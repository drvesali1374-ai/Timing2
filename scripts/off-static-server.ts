// static server for offline parity tests — port 3031
const root = '/home/z/my-project';
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};
Bun.serve({
  port: 3031,
  async fetch(req) {
    let p = new URL(req.url).pathname;
    if (p.endsWith('/')) p += 'index.html';
    const file = root + decodeURIComponent(p);
    const f = Bun.file(file);
    if (await f.exists()) {
      const ext = file.slice(file.lastIndexOf('.'));
      return new Response(f, { headers: { 'content-type': mime[ext] || 'application/octet-stream' } });
    }
    return new Response('not found', { status: 404 });
  },
});
console.log('offline static server on :3031');
