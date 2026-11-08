import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { BrowserContext, Page } from 'playwright';
import { cfg, egressFor } from './config.js';

chromium.use(StealthPlugin());

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
];

export function pickUa(mobile: boolean): string {
  const pool = mobile ? UAS.slice(2) : UAS.slice(0, 2);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function isMobile(ua: string) { return /Android|iPhone|iPad/i.test(ua); }

export async function openContext(cc?: string, ua?: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const userAgent = ua ?? pickUa(false);
  const mobile = isMobile(userAgent);
  const proxy = egressFor(cc);
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const ctx = await chromium.launchPersistentContext('', {
    headless: true,
    executablePath,
    userAgent,
    locale: 'en-US',
    timezoneId: cc ? ccTimezone(cc) : 'UTC',
    viewport: mobile ? { width: 393, height: 852 } : { width: 1366, height: 900 },
    deviceScaleFactor: mobile ? 3 : 1,
    hasTouch: mobile,
    isMobile: mobile,
    proxy: proxy ? { server: proxy } : undefined,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  return { ctx, page };
}

function ccTimezone(cc: string): string {
  const map: Record<string, string> = {
    US: 'America/New_York', GB: 'Europe/London', DE: 'Europe/Berlin',
    FR: 'Europe/Paris', NL: 'Europe/Amsterdam', CA: 'America/Toronto',
    AU: 'Australia/Sydney', SG: 'Asia/Singapore', JP: 'Asia/Tokyo',
  };
  return map[cc.toUpperCase()] ?? 'UTC';
}