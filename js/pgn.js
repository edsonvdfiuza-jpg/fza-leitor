// Leitura de PGN em árvore: linha principal, variantes, comentários e NAGs.
import { lerFen, aplicar, lerLance, san, posicaoLegal, INICIAL } from './xadrez.js';

// Separa o arquivo em registros (um por [Event ...]), como o programa do PC.
export function separarRegistros(texto) {
  const t = texto.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return t.split(/\n(?=\[Event\s+")/).map(s => s.trim()).filter(s => s.includes('['));
}

export function lerCabecalhos(registro) {
  const cab = {};
  const linhas = registro.split('\n');
  let i = 0;
  for (; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!l) continue;
    const m = /^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/.exec(l);
    if (!m) break;
    cab[m[1]] = m[2].replace(/\\(["\\])/g, '$1');
  }
  return { cab, corpo: linhas.slice(i).join('\n') };
}

const NAG_SUFIXO = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
const NAG_SOLTO = { '=': 10, '∞': 13, '+=': 14, '⩲': 14, '=+': 15, '⩱': 15, '+/-': 16, '±': 16,
                    '-/+': 17, '∓': 17, '+-': 18, '-+': 19 };
const COR_MARCA = { G: '#2E7D32', Y: '#F9A825', R: '#C62828', B: '#1565C0' };

// Extrai setas/casas coloridas e marcas de diagrama; devolve o texto limpo.
export function tratarComentario(bruto) {
  const setas = [], casas = [];
  for (const [, lista] of bruto.matchAll(/\[%cal\s+([^\]]+)\]/g))
    for (const it of lista.split(',')) {
      const m = /^([A-Za-z])([a-h][1-8])([a-h][1-8])$/.exec(it.trim());
      if (m) setas.push({ de: m[2], para: m[3], cor: COR_MARCA[m[1].toUpperCase()] || COR_MARCA.G });
    }
  for (const [, lista] of bruto.matchAll(/\[%csl\s+([^\]]+)\]/g))
    for (const it of lista.split(',')) {
      const m = /^([A-Za-z])([a-h][1-8])$/.exec(it.trim());
      if (m) casas.push({ casa: m[2], cor: COR_MARCA[m[1].toUpperCase()] || COR_MARCA.G });
    }
  const diagrama = /\[D\]|\[#\]|%#%/.test(bruto);
  const numerado = diagrama ? /^\s*(?:\[[D#]\]|%#%)?\s*Diagrama\s+(\d+[a-z]?)\s*[:.-]/i.exec(bruto) : null;
  const texto = bruto
    .replace(/\[%[a-zA-Z]+\s[^\]]*\]/g, '')
    .replace(/\[D\]|\[#\]|%#%/g, '')
    .trim();
  return { texto, setas, casas, diagrama, numeroDiagrama: numerado ? numerado[1] : null };
}

function* fichas(corpo) {
  let i = 0;
  const n = corpo.length;
  while (i < n) {
    const ch = corpo[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '{') {
      const f = corpo.indexOf('}', i + 1);
      const fim = f < 0 ? n : f;
      yield { tipo: 'coment', v: corpo.slice(i + 1, fim) };
      i = fim + 1; continue;
    }
    if (ch === ';') { const f = corpo.indexOf('\n', i); i = f < 0 ? n : f + 1; continue; }
    if (ch === '%' && (i === 0 || corpo[i - 1] === '\n')) { const f = corpo.indexOf('\n', i); i = f < 0 ? n : f + 1; continue; }
    if (ch === '(' || ch === ')') { yield { tipo: ch }; i++; continue; }
    let j = i;
    while (j < n && !/[\s{}();]/.test(corpo[j])) j++;
    yield { tipo: 'palavra', v: corpo.slice(i, j) };
    i = j;
  }
}

// Monta a árvore de um registro.
// Linha = { intro, nos: [No] }. No = { id, san, antes, depois, nags, coment,
//   setas, casas, diagrama, numeroDiagrama, variantes: [Linha], linha, indice }.
export function lerPartida(corpo, fenInicial = INICIAL) {
  const inicio = lerFen(fenInicial);
  let proximoId = 0, invalidos = 0;
  const raiz = { intro: '', introMarcas: null, nos: [], inicio };
  let linha = raiz, pos = inicio, ultimo = null;
  const pilha = [];

  const anexarComent = bruto => {
    const c = tratarComentario(bruto);
    const alvo = ultimo || linha;
    if (ultimo) {
      ultimo.coment = [ultimo.coment, c.texto].filter(Boolean).join(' ');
      ultimo.setas.push(...c.setas); ultimo.casas.push(...c.casas);
      if (c.diagrama) { ultimo.diagrama = true; ultimo.numeroDiagrama ||= c.numeroDiagrama; }
    } else {
      alvo.intro = [alvo.intro, c.texto].filter(Boolean).join('\n\n');
      alvo.introMarcas ||= { setas: [], casas: [], diagrama: false, numeroDiagrama: null };
      alvo.introMarcas.setas.push(...c.setas); alvo.introMarcas.casas.push(...c.casas);
      if (c.diagrama) { alvo.introMarcas.diagrama = true; alvo.introMarcas.numeroDiagrama ||= c.numeroDiagrama; }
    }
  };

  for (const f of fichas(corpo)) {
    if (f.tipo === 'coment') { anexarComent(f.v); continue; }
    if (f.tipo === '(') {
      pilha.push({ linha, pos, ultimo });
      const nova = { intro: '', introMarcas: null, nos: [], pai: ultimo };
      if (ultimo) { ultimo.variantes.push(nova); pos = ultimo.antes; }
      else (linha.variantesSoltas ||= []).push(nova);
      linha = nova; ultimo = null;
      continue;
    }
    if (f.tipo === ')') {
      if (pilha.length) ({ linha, pos, ultimo } = pilha.pop());
      continue;
    }
    let w = f.v;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(w)) continue;
    if (/^\$\d+$/.test(w)) { if (ultimo) ultimo.nags.push(Number(w.slice(1))); continue; }
    if (w in NAG_SOLTO) { if (ultimo) ultimo.nags.push(NAG_SOLTO[w]); continue; }
    if (w in NAG_SUFIXO) { if (ultimo) ultimo.nags.push(NAG_SUFIXO[w]); continue; }
    w = w.replace(/^\d+\.+/, '');
    if (!w || /^\.+$/.test(w)) continue;
    if (w === 'Z0' || w === '--') continue; // lance nulo usado só para carregar texto
    const suf = /([!?]{1,2})$/.exec(w);
    if (suf) w = w.slice(0, -suf[1].length);
    const lance = lerLance(pos, w);
    if (!lance) { invalidos++; continue; }
    const depois = aplicar(pos, lance);
    const no = {
      id: proximoId++, san: posicaoLegal(pos) ? san(pos, lance) : w, lance, antes: pos, depois,
      nags: suf && NAG_SUFIXO[suf[1]] ? [NAG_SUFIXO[suf[1]]] : [],
      coment: '', setas: [], casas: [], diagrama: false, numeroDiagrama: null,
      variantes: [], linha, indice: linha.nos.length,
    };
    linha.nos.push(no);
    ultimo = no; pos = depois;
  }
  return { raiz, invalidos, total: proximoId };
}

// Leitura rápida, sem aplicar lances: texto antes do 1º lance e se há lances.
// Serve para montar o sumário sem processar o livro inteiro.
export function resumirPartida(corpo) {
  const intro = [];
  let nivel = 0, temLances = false;
  for (const f of fichas(corpo)) {
    if (f.tipo === '(') { nivel++; continue; }
    if (f.tipo === ')') { nivel = Math.max(0, nivel - 1); continue; }
    if (nivel) continue;
    if (f.tipo === 'coment') { if (!temLances) intro.push(tratarComentario(f.v).texto); continue; }
    const w = f.v.replace(/^\d+\.+/, '');
    if (!w || /^(1-0|0-1|1\/2-1\/2|\*|\$\d+|Z0|--|[!?=+\-/∞±∓]+)$/.test(w)) continue;
    temLances = true;
  }
  return { intro: intro.filter(Boolean).join('\n\n'), temLances };
}

// Percorre todos os nós (para localizar por id).
export function* todosNos(linha) {
  for (const no of linha.nos) {
    yield no;
    for (const v of no.variantes) yield* todosNos(v);
  }
}
