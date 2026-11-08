import type { Page } from 'playwright';
import { cfg } from './config.js';

const EMAIL_SEL = ['input[type=email]', 'input[inputmode=email]', 'input[name=email]', 'input[autocomplete=email]'];
const NUM_SEL = ['input[inputmode=numeric]', 'input[autocomplete=one-time-code]', 'input[name*=pin]', 'input[name*=otp]', 'input[type=tel]'];

const human = (min = 90, max = 260) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

async function firstVisible(page: Page, sels: string[]) {
  for (const s of sels) {
    const l = page.locator(s).first();
    if (await l.count() && await l.isVisible().catch(() => false)) return l;
  }
  return null;
}

export type Step = 'pin' | 'otp' | 'done' | 'error' | 'unknown';

export async function classify(page: Page): Promise<Step> {
  if (await isAuthed(page)) return 'done';
  const text = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  const num = await firstVisible(page, NUM_SEL);
  if (/verification code|verify|6-digit code|we sent|check your/.test(text) && num) return 'otp';
  if (/passcode|pin|enter your \d-digit/.test(text) && num) return 'pin';
  if (num) return 'pin';
  if (/incorrect|invalid|wrong|try again/.test(text)) return 'error';
  return 'unknown';
}

export async function isAuthed(page: Page): Promise<boolean> {
  const url = page.url();
  // Only consider authed if we're on a known post-login dashboard URL
  const authedUrl = /\/(home|dashboard|portfolio|wallet|app|overview)/i.test(url)
    && !/login|signin|account/i.test(url);
  if (!authedUrl) return false;
  // Also require an auth cookie to confirm
  const cookies = await page.context().cookies();
  return cookies.some(c => /session|sso|auth|token|sid/i.test(c.name) && c.value.length > 20);
}

export async function gotoEntry(page: Page) {
  // go directly to login page
  await page.goto('https://crypto.com/account/login', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await human(800, 1500);
  let email = await firstVisible(page, EMAIL_SEL);
  if (email) return;

  // try alternate login URLs
  for (const url of [
    'https://crypto.com/en/login',
    'https://crypto.com/exchange/login',
    'https://crypto.com/account/sign-in',
  ]) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await human(600, 1000);
    email = await firstVisible(page, EMAIL_SEL);
    if (email) return;
  }

  // fallback: click any sign-in link on current page
  for (const t of ['Sign in', 'Log in', 'Sign In', 'Login', 'Get Started']) {
    const b = page.getByRole('link', { name: t }).first();
    if (await b.count().catch(() => 0)) {
      await b.click().catch(() => {});
      await page.waitForTimeout(3000);
      email = await firstVisible(page, EMAIL_SEL);
      if (email) return;
    }
  }
}

export async function submitEmail(page: Page, email: string) {
  // wait up to 10s for email field to appear
  let el = await firstVisible(page, EMAIL_SEL);
  if (!el) {
    await page.waitForTimeout(3000);
    el = await firstVisible(page, EMAIL_SEL);
  }
  if (!el) {
    // try waiting for any input
    await page.waitForSelector('input', { timeout: 8000 }).catch(() => {});
    el = await firstVisible(page, EMAIL_SEL);
  }
  if (!el) throw new Error('no email field');
  await el.click();
  await el.fill('');
  await el.type(email, { delay: 40 + Math.random() * 60 });
  await human();
  await pressContinue(page);
}

export async function submitPin(page: Page, pin: string) {
  await fillNumeric(page, pin);
  await pressContinue(page);
}

export async function submitOtp(page: Page, code: string) {
  await fillNumeric(page, code);
  await pressContinue(page);
}

async function fillNumeric(page: Page, value: string) {
  const boxes = page.locator(NUM_SEL.join(','));
  const n = await boxes.count();
  const visible: any[] = [];
  for (let i = 0; i < n; i++) if (await boxes.nth(i).isVisible().catch(() => false)) visible.push(boxes.nth(i));
  if (visible.length > 1) {
    for (let i = 0; i < value.length && i < visible.length; i++) {
      await visible[i].click();
      await visible[i].type(value[i], { delay: 60 + Math.random() * 80 });
      await human(40, 120);
    }
  } else {
    const el = visible[0] ?? (await firstVisible(page, NUM_SEL));
    if (!el) throw new Error('no numeric field');
    await el.click();
    await el.type(value, { delay: 60 + Math.random() * 80 });
  }
  await human();
}

async function pressContinue(page: Page) {
  const byRole = page.getByRole('button', { name: /continue|log in|sign in|verify|submit|next/i }).first();
  if (await byRole.count().catch(() => 0)) {
    await byRole.click().catch(() => {});
    return;
  }
  await page.keyboard.press('Enter');
}

export async function submitSocial(page: Page, provider: 'google' | 'apple') {
  const sels = provider === 'google'
    ? ['[data-provider=google]', 'button[aria-label*=Google i]', 'a[href*=google]', 'button:has-text("Google")', '[class*=google]']
    : ['[data-provider=apple]', 'button[aria-label*=Apple i]', 'a[href*=apple]', 'button:has-text("Apple")', '[class*=apple]'];
  for (const s of sels) {
    const l = page.locator(s).first();
    if (await l.count().catch(() => 0) && await l.isVisible().catch(() => false)) {
      await l.click().catch(() => {});
      await human(800, 1600);
      return;
    }
  }
  // fallback: find by visible text
  const btn = page.getByRole('button', { name: new RegExp(provider, 'i') }).first();
  if (await btn.count().catch(() => 0)) { await btn.click().catch(() => {}); await human(800, 1600); }
}

export async function waitStep(page: Page, ms = 30_000): Promise<Step> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await classify(page).catch(() => 'unknown' as Step);
    if (s !== 'unknown') return s;
    await page.waitForTimeout(900);
  }
  return 'unknown';
}

export async function shot(page: Page, dir: string, name: string) {
  try { await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false }); } catch {}
}