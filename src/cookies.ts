import type { BrowserContext } from 'playwright';

export async function dump(ctx: BrowserContext) {
  const cookies = await ctx.cookies();
  return {
    json: JSON.stringify(cookies, null, 2),
    netscape: cookies.map(c =>
      [c.domain, c.domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path, c.secure ? 'TRUE' : 'FALSE',
       Math.floor(c.expires > 0 ? c.expires : 0), c.name, c.value].join('\t')
    ).join('\n'),
    editor: JSON.stringify(cookies.map(c => ({
      domain: c.domain, name: c.name, value: c.value, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
      expirationDate: c.expires > 0 ? c.expires : undefined,
    })), null, 2),
  };
}