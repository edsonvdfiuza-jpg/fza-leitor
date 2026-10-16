// Biblioteca de livros (IndexedDB) e marcador de leitura (localStorage).
// Tudo fica só no celular; o arquivo PGN nunca é alterado.

const BANCO = 'fza-leitor', VERSAO = 1;

export function abrirBanco() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, VERSAO);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('livros')) db.createObjectStore('livros', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pendente')) db.createObjectStore('pendente');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}

function pedido(loja, modo, fazer) {
  return abrirBanco().then(db => new Promise((ok, erro) => {
    const tx = db.transaction(loja, modo);
    const r = fazer(tx.objectStore(loja));
    tx.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
    tx.onerror = () => erro(tx.error);
  }));
}

export const salvarLivro = livro => pedido('livros', 'readwrite', s => s.put(livro));
export const lerLivro = id => pedido('livros', 'readonly', s => s.get(id));
export const removerLivro = id => pedido('livros', 'readwrite', s => s.delete(id));
export async function listarLivros() {
  const todos = await pedido('livros', 'readonly', s => s.getAll());
  return (todos || []).sort((a, b) => (b.abertoEm || 0) - (a.abertoEm || 0));
}

// Arquivo recebido pelo menu Compartilhar (gravado pelo service worker).
export const lerPendente = () => pedido('pendente', 'readonly', s => s.get('arquivo'));
export const limparPendente = () => pedido('pendente', 'readwrite', s => s.delete('arquivo'));

// Identificador estável do livro: nome + tamanho + amostra do conteúdo.
export function idLivro(nome, texto) {
  let h = 2166136261;
  const amostra = `${nome}|${texto.length}|${texto.slice(0, 4000)}|${texto.slice(-4000)}`;
  for (let i = 0; i < amostra.length; i++) { h ^= amostra.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'l' + (h >>> 0).toString(36) + texto.length.toString(36);
}

// Lê o arquivo como UTF-8; se não for UTF-8 válido, usa Windows-1252 (Latin-1).
export async function lerTextoArquivo(arquivo) {
  const bytes = await arquivo.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

const chaveMarcador = id => 'fza:marcador:' + id;
export function lerMarcador(id) {
  try { return JSON.parse(localStorage.getItem(chaveMarcador(id))) || null; } catch { return null; }
}
export function gravarMarcador(id, m) {
  try { localStorage.setItem(chaveMarcador(id), JSON.stringify(m)); } catch { /* sem armazenamento */ }
}
export function apagarMarcador(id) {
  try { localStorage.removeItem(chaveMarcador(id)); } catch { /* sem armazenamento */ }
}

export function lerPreferencias() {
  const padrao = { linhas: 2, profundidade: 18, fonte: 1, virado: false };
  try { return { ...padrao, ...JSON.parse(localStorage.getItem('fza:prefs')) }; } catch { return padrao; }
}
export function gravarPreferencias(p) {
  try { localStorage.setItem('fza:prefs', JSON.stringify(p)); } catch { /* sem armazenamento */ }
}
