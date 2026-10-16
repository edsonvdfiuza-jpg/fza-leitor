// Service worker: guarda o app no celular para funcionar sem internet e
// recebe arquivos .pgn pelo menu "Compartilhar" do Android.
const VERSAO = 'fza-leitor-v1';
const ARQUIVOS = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/xadrez.js', 'js/pgn.js', 'js/livro.js', 'js/tabuleiro.js', 'js/motor.js', 'js/armazenamento.js',
  'vendor/stockfish/stockfish-19-lite-single.js', 'vendor/stockfish/stockfish-19-lite-single.wasm',
  'icones/icone-192.png', 'icones/icone-512.png',
  ...['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'].map(p => `pecas/merida/${p}.svg`),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(chaves => Promise.all(chaves.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function guardarPendente(registro) {
  return new Promise((ok, erro) => {
    const r = indexedDB.open('fza-leitor', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('livros')) db.createObjectStore('livros', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pendente')) db.createObjectStore('pendente');
    };
    r.onerror = () => erro(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('pendente', 'readwrite');
      tx.objectStore('pendente').put(registro, 'arquivo');
      tx.oncomplete = ok; tx.onerror = () => erro(tx.error);
    };
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/compartilhar')) {
    e.respondWith((async () => {
      try {
        const dados = await e.request.formData();
        const arquivo = dados.getAll('pgn').find(f => f && typeof f !== 'string');
        if (arquivo) await guardarPendente({ nome: arquivo.name, dados: await arquivo.arrayBuffer() });
      } catch { /* abre a biblioteca mesmo assim */ }
      return Response.redirect('./?compartilhado=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(achado => achado || fetch(e.request).then(resp => {
      if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); }
      return resp;
    }).catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
