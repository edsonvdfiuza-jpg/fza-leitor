// Servidor local para testar o leitor no celular pela rede de casa.
// Uso: node servidor.mjs <porta> <pasta> [endereço]
import http from 'http';
import fs from 'fs';
import path from 'path';

const [porta = '8765', pasta = '.', host = '0.0.0.0'] = process.argv.slice(2);
const raiz = path.resolve(pasta);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.md': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); return res.end('Endereço inválido'); }
  if (p.endsWith('/')) p += 'index.html';
  const arquivo = path.join(raiz, p);
  if (!arquivo.startsWith(raiz)) { res.writeHead(403); return res.end(); }
  fs.stat(arquivo, (erro, info) => {
    if (erro || !info.isFile()) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(arquivo)] || 'application/octet-stream',
      'Content-Length': info.size, 'Cache-Control': 'no-cache',
    });
    fs.createReadStream(arquivo).pipe(res);
  });
}).listen(Number(porta), host, () => console.log(`Servindo ${raiz} na porta ${porta}. Feche esta janela para parar.`));
