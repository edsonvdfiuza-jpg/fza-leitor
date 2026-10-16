// Regras de xadrez do leitor.
// Casas: índice 0..63, linha 0 = 8ª fileira, coluna 0 = coluna "a".
// Peças no padrão FEN: maiúsculas = brancas, minúsculas = pretas.
// Posições didáticas (sem reis, peças soltas) são aceitas: nesses casos os
// lances do livro são aplicados sem checar xeque, como no programa do PC.

export const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const COLUNAS = 'abcdefgh';

export const nomeCasa = i => COLUNAS[i & 7] + (8 - (i >> 3));
export const indiceCasa = s => (8 - Number(s[1])) * 8 + COLUNAS.indexOf(s[0]);
const ehBranca = p => p === p.toUpperCase();
const corDe = p => (ehBranca(p) ? 'w' : 'b');

export function lerFen(fen) {
  const [disp = '', vez = 'w', roque = '-', ep = '-', meio = '0', num = '1'] = String(fen).trim().split(/\s+/);
  const b = new Array(64).fill(null);
  disp.split('/').slice(0, 8).forEach((linha, r) => {
    let c = 0;
    for (const ch of linha) {
      if (/\d/.test(ch)) c += Number(ch);
      else { if (c < 8 && /[prnbqkPRNBQK]/.test(ch)) b[r * 8 + c] = ch; c++; }
    }
  });
  return {
    b, vez: vez === 'b' ? 'b' : 'w',
    roque: /^[KQkq]+$/.test(roque) ? roque : '-',
    ep: /^[a-h][36]$/.test(ep) ? ep : '-',
    meio: parseInt(meio, 10) || 0, num: parseInt(num, 10) || 1,
  };
}

export function paraFen(p) {
  const linhas = [];
  for (let r = 0; r < 8; r++) {
    let s = '', vazio = 0;
    for (let c = 0; c < 8; c++) {
      const x = p.b[r * 8 + c];
      if (!x) { vazio++; continue; }
      if (vazio) { s += vazio; vazio = 0; }
      s += x;
    }
    linhas.push(s + (vazio || ''));
  }
  return `${linhas.join('/')} ${p.vez} ${p.roque || '-'} ${p.ep || '-'} ${p.meio} ${p.num}`;
}

const N_SALTOS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const REI = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const TORRE = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISPO = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const dentro = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

// A casa `alvo` é atacada por peças da cor `cor`?
export function atacada(b, alvo, cor) {
  const r0 = alvo >> 3, c0 = alvo & 7;
  const minha = t => (cor === 'w' ? t.toUpperCase() : t.toLowerCase());
  const dirPeao = cor === 'w' ? 1 : -1; // peão branco ataca "para cima": vem da linha de baixo
  for (const dc of [-1, 1]) {
    const r = r0 + dirPeao, c = c0 + dc;
    if (dentro(r, c) && b[r * 8 + c] === minha('p')) return true;
  }
  for (const [dr, dc] of N_SALTOS) {
    const r = r0 + dr, c = c0 + dc;
    if (dentro(r, c) && b[r * 8 + c] === minha('n')) return true;
  }
  for (const [dr, dc] of REI) {
    const r = r0 + dr, c = c0 + dc;
    if (dentro(r, c) && b[r * 8 + c] === minha('k')) return true;
  }
  for (const [dirs, tipos] of [[TORRE, 'rq'], [BISPO, 'bq']]) {
    for (const [dr, dc] of dirs) {
      let r = r0 + dr, c = c0 + dc;
      while (dentro(r, c)) {
        const x = b[r * 8 + c];
        if (x) { if (corDe(x) === cor && tipos.includes(x.toLowerCase())) return true; break; }
        r += dr; c += dc;
      }
    }
  }
  return false;
}

const casaDoRei = (b, cor) => b.indexOf(cor === 'w' ? 'K' : 'k');
export const emXeque = p => { const k = casaDoRei(p.b, p.vez); return k >= 0 && atacada(p.b, k, p.vez === 'w' ? 'b' : 'w'); };

// Posição jogável de verdade: um rei de cada lado, sem peões na 1ª/8ª fileira e
// o lado que acabou de jogar não está em xeque. Só nela o Stockfish e os lances
// próprios funcionam.
export function posicaoLegal(p) {
  const reis = p.b.filter(x => x === 'K').length, reisP = p.b.filter(x => x === 'k').length;
  if (reis !== 1 || reisP !== 1) return false;
  for (let c = 0; c < 8; c++) if (/[pP]/.test(p.b[c] || '') || /[pP]/.test(p.b[56 + c] || '')) return false;
  const outro = p.vez === 'w' ? 'b' : 'w';
  return !atacada(p.b, casaDoRei(p.b, outro), p.vez);
}

// Lances pseudo-legais (sem checar se o próprio rei fica em xeque).
function lancesPseudo(p) {
  const { b, vez } = p, lista = [];
  const inimigo = x => x && corDe(x) !== vez;
  for (let de = 0; de < 64; de++) {
    const x = b[de];
    if (!x || corDe(x) !== vez) continue;
    const t = x.toLowerCase(), r0 = de >> 3, c0 = de & 7;
    if (t === 'p') {
      const dir = vez === 'w' ? -1 : 1, ini = vez === 'w' ? 6 : 1, ult = vez === 'w' ? 0 : 7;
      const add = (para, extra = {}) => {
        if ((para >> 3) === ult) for (const pr of 'qrbn') lista.push({ de, para, peca: x, promo: pr, ...extra });
        else lista.push({ de, para, peca: x, ...extra });
      };
      const r1 = r0 + dir;
      if (dentro(r1, c0) && !b[r1 * 8 + c0]) {
        add(r1 * 8 + c0);
        const r2 = r0 + 2 * dir;
        if (r0 === ini && dentro(r2, c0) && !b[r2 * 8 + c0]) lista.push({ de, para: r2 * 8 + c0, peca: x, duplo: true });
      }
      for (const dc of [-1, 1]) {
        const c = c0 + dc;
        if (!dentro(r1, c)) continue;
        const para = r1 * 8 + c;
        if (inimigo(b[para])) add(para, { captura: true });
        else if (p.ep !== '-' && nomeCasa(para) === p.ep) lista.push({ de, para, peca: x, captura: true, ep: true });
      }
      continue;
    }
    if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? N_SALTOS : REI) {
        const r = r0 + dr, c = c0 + dc;
        if (!dentro(r, c)) continue;
        const para = r * 8 + c, y = b[para];
        if (!y || inimigo(y)) lista.push({ de, para, peca: x, captura: !!y });
      }
      if (t === 'k') lancesRoque(p, de, lista);
      continue;
    }
    const dirs = t === 'r' ? TORRE : t === 'b' ? BISPO : [...TORRE, ...BISPO];
    for (const [dr, dc] of dirs) {
      let r = r0 + dr, c = c0 + dc;
      while (dentro(r, c)) {
        const para = r * 8 + c, y = b[para];
        if (y) { if (inimigo(y)) lista.push({ de, para, peca: x, captura: true }); break; }
        lista.push({ de, para, peca: x });
        r += dr; c += dc;
      }
    }
  }
  return lista;
}

function lancesRoque(p, de, lista) {
  const { b, vez, roque } = p;
  const base = vez === 'w' ? 60 : 4, inimigo = vez === 'w' ? 'b' : 'w';
  if (de !== base || roque === '-') return;
  const torre = vez === 'w' ? 'R' : 'r';
  const temRei = casaDoRei(b, vez) >= 0;
  const seguro = casas => !temRei || casas.every(s => !atacada(b, s, inimigo));
  if (roque.includes(vez === 'w' ? 'K' : 'k') && b[base + 3] === torre && !b[base + 1] && !b[base + 2]
      && seguro([base, base + 1, base + 2]))
    lista.push({ de, para: base + 2, peca: b[de], roque: 'K' });
  if (roque.includes(vez === 'w' ? 'Q' : 'q') && b[base - 4] === torre && !b[base - 1] && !b[base - 2] && !b[base - 3]
      && seguro([base, base - 1, base - 2]))
    lista.push({ de, para: base - 2, peca: b[de], roque: 'Q' });
}

export function aplicar(p, m) {
  const b = p.b.slice();
  const vez = p.vez, outro = vez === 'w' ? 'b' : 'w';
  let roque = p.roque === '-' ? '' : p.roque;
  const capturada = b[m.para];
  b[m.para] = m.promo ? (vez === 'w' ? m.promo.toUpperCase() : m.promo.toLowerCase()) : b[m.de];
  b[m.de] = null;
  if (m.ep) b[(m.de & ~7) | (m.para & 7)] = null;
  if (m.roque) {
    const base = m.de;
    if (m.roque === 'K') { b[base + 1] = b[base + 3]; b[base + 3] = null; }
    else { b[base - 1] = b[base - 4]; b[base - 4] = null; }
  }
  const tira = s => { roque = roque.replace(s, ''); };
  if (m.peca === 'K') { tira('K'); tira('Q'); }
  if (m.peca === 'k') { tira('k'); tira('q'); }
  for (const s of [m.de, m.para]) {
    if (s === 63) tira('K'); if (s === 56) tira('Q'); if (s === 7) tira('k'); if (s === 0) tira('q');
  }
  const ep = m.duplo ? nomeCasa((m.de + m.para) >> 1) : '-';
  const zera = m.peca.toLowerCase() === 'p' || capturada || m.ep;
  return {
    b, vez: outro, roque: roque || '-', ep,
    meio: zera ? 0 : p.meio + 1, num: vez === 'b' ? p.num + 1 : p.num,
  };
}

// Lances legais. Sem rei do próprio lado (posição didática) vale o pseudo-legal.
export function lancesLegais(p) {
  const pseudo = lancesPseudo(p);
  if (casaDoRei(p.b, p.vez) < 0) return pseudo;
  return pseudo.filter(m => {
    const q = aplicar(p, m);
    const k = casaDoRei(q.b, p.vez);
    return k < 0 || !atacada(q.b, k, q.vez);
  });
}

export function san(p, m, legais = lancesLegais(p)) {
  let s;
  if (m.roque) s = m.roque === 'K' ? 'O-O' : 'O-O-O';
  else {
    const t = m.peca.toUpperCase(), destino = nomeCasa(m.para);
    if (t === 'P') {
      s = (m.captura ? COLUNAS[m.de & 7] + 'x' : '') + destino + (m.promo ? '=' + m.promo.toUpperCase() : '');
    } else {
      const rivais = legais.filter(o => o.peca === m.peca && o.para === m.para && o.de !== m.de);
      let desamb = '';
      if (rivais.length) {
        const mesmaCol = rivais.some(o => (o.de & 7) === (m.de & 7));
        const mesmaLin = rivais.some(o => (o.de >> 3) === (m.de >> 3));
        if (!mesmaCol) desamb = COLUNAS[m.de & 7];
        else if (!mesmaLin) desamb = String(8 - (m.de >> 3));
        else desamb = nomeCasa(m.de);
      }
      s = t + desamb + (m.captura ? 'x' : '') + destino;
    }
  }
  const q = aplicar(p, m);
  if (emXeque(q)) s += lancesLegais(q).length ? '+' : '#';
  return s;
}

const RE_SAN = /^([KQRBN])?([a-h])?([1-8])?[-x:]?([a-h][1-8])(?:=?([QRBNqrbn]))?$/;

// Converte o texto de um lance do PGN em lance. Aceita SAN, notação longa
// (Qc4-c8, e2-e4) e roque com zeros. Devolve null se não houver lance possível.
export function lerLance(p, texto) {
  let t = String(texto).replace(/[+#!?]+$/g, '').replace(/[+#]/g, '').replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O');
  const legais = lancesLegais(p);
  const escolher = lista => {
    if (t === 'O-O' || t === 'O-O-O') return lista.find(m => m.roque === (t === 'O-O' ? 'K' : 'Q')) || null;
    const x = RE_SAN.exec(t);
    if (!x) return null;
    const [, peca = 'P', col, lin, destino, promo] = x;
    const para = indiceCasa(destino);
    const cands = lista.filter(m => m.para === para
      && m.peca.toUpperCase() === peca
      && (!col || (m.de & 7) === COLUNAS.indexOf(col))
      && (!lin || (m.de >> 3) === 8 - Number(lin))
      && (!m.promo || m.promo === (promo || 'q').toLowerCase()));
    return cands[0] || null;
  };
  return escolher(legais) || escolher(lancesPseudo(p));
}
