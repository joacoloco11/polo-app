/* Servidor local que imita el ruteo de Vercel: todo /api/ va a la función
   única de `api/servidor.js` —igual que la regla de `vercel.json`— y el resto
   sale de `public/`. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const api = require('./api/servidor.js');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => { res.end(b); return res; };

  if (url.pathname.startsWith('/api/')) {
    let cuerpo = '';
    for await (const trozo of req) cuerpo += trozo;
    req.body = cuerpo;
    try {
      return await api(req, res);
    } catch (e) {
      console.error(e); res.statusCode = 500; return res.end(JSON.stringify({ error: e.message }));
    }
  }

  const archivo = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (fs.existsSync(archivo) && fs.statSync(archivo).isFile()) {
    const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
    res.setHeader('Content-Type', (tipos[path.extname(archivo)] || 'text/plain') + '; charset=utf-8');
    return res.end(fs.readFileSync(archivo));
  }
  res.statusCode = 404; res.end('no existe');
});
server.listen(3000, () => console.log('dev en http://localhost:3000'));
