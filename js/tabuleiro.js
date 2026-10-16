// Desenho do tabuleiro em SVG: mármore verde com veios e peças Merida,
// o mesmo visual dos diagramas coloridos do PDF.
import { indiceCasa } from './xadrez.js';

const CLARA = '#E7EEE5', ESCURA = '#487568';
const VEIO_CLARA = '#DAE4DB', VEIO_ESCURA = '#557F72';
const ARQ = { K: 'wK', Q: 'wQ', R: 'wR', B: 'wB', N: 'wN', P: 'wP', k: 'bK', q: 'bQ', r: 'bR', b: 'bB', n: 'bN', p: 'bP' };
const S = 100; // tamanho da casa em unidades do SVG

const fundoCache = {};
function fundo(virado, coordenadas) {
  const chave = `${virado}${coordenadas}`;
  if (fundoCache[chave]) return fundoCache[chave];
  let s = '';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const x = (virado ? 7 - c : c) * S, y = (virado ? 7 - r : r) * S;
    const clara = (r + c) % 2 === 0;
    s += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="${clara ? CLARA : ESCURA}"/>`;
    // Mesmos veios do PDF (SvgPieceDiagram), presos à casa.
    let d = '';
    for (let v = 0; v < 3; v++) {
      for (let k = 0; k <= 16; k++) {
        const u = k / 16;
        const yy = y + S - (v / 3 + 0.16 * u + 0.045 * Math.sin(u * 9 + r + c + v)) * S;
        d += `${k ? 'L' : 'M'}${(x + u * S).toFixed(1)} ${Math.max(y, Math.min(y + S, yy)).toFixed(1)}`;
      }
    }
    s += `<path d="${d}" fill="none" stroke="${clara ? VEIO_CLARA : VEIO_ESCURA}" stroke-width="0.9"/>`;
  }
  if (coordenadas) {
    for (let i = 0; i < 8; i++) {
      const lin = virado ? i + 1 : 8 - i, col = 'abcdefgh'[virado ? 7 - i : i];
      const corL = i % 2 === 0 ? ESCURA : CLARA, corC = i % 2 === 0 ? CLARA : ESCURA;
      s += `<text x="4" y="${i * S + 20}" font-size="17" font-weight="700" fill="${corL}" font-family="sans-serif">${lin}</text>`;
      s += `<text x="${i * S + S - 15}" y="${8 * S - 5}" font-size="17" font-weight="700" fill="${corC}" font-family="sans-serif">${col}</text>`;
    }
  }
  return (fundoCache[chave] = s);
}

const xy = (casa, virado) => {
  const i = typeof casa === 'number' ? casa : indiceCasa(casa);
  const r = i >> 3, c = i & 7;
  return [(virado ? 7 - c : c) * S, (virado ? 7 - r : r) * S];
};

function seta(de, para, cor, virado) {
  const [x1, y1] = xy(de, virado).map(v => v + S / 2), [x2, y2] = xy(para, virado).map(v => v + S / 2);
  const ang = Math.atan2(y2 - y1, x2 - x1), ponta = 34, larg = 0.5;
  const xb = x2 - Math.cos(ang) * ponta * 0.8, yb = y2 - Math.sin(ang) * ponta * 0.8;
  const p1 = [x2 - ponta * Math.cos(ang - larg), y2 - ponta * Math.sin(ang - larg)];
  const p2 = [x2 - ponta * Math.cos(ang + larg), y2 - ponta * Math.sin(ang + larg)];
  return `<g opacity="0.82"><line x1="${x1}" y1="${y1}" x2="${xb}" y2="${yb}" stroke="${cor}" stroke-width="13" stroke-linecap="round"/>`
    + `<polygon points="${x2},${y2} ${p1.join(',')} ${p2.join(',')}" fill="${cor}"/></g>`;
}

// Gera o SVG do tabuleiro. op: { virado, ultimo:{de,para}, selecionada, destinos:[],
// setas:[{de,para,cor}], casas:[{casa,cor}], coordenadas, base (caminho das peças) }
export function svgTabuleiro(pos, op = {}) {
  const v = !!op.virado, base = op.base || 'pecas/merida/';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 ${8 * S + 12} ${8 * S + 12}" class="svg-tab">`;
  s += `<rect x="-6" y="-6" width="${8 * S + 12}" height="${8 * S + 12}" fill="#111"/>`;
  s += fundo(v, op.coordenadas !== false);
  if (op.ultimo) for (const q of [op.ultimo.de, op.ultimo.para]) {
    const [x, y] = xy(q, v); s += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#CDD26A" opacity="0.72"/>`;
  }
  for (const c of op.casas || []) {
    const [x, y] = xy(c.casa, v); s += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="${c.cor}" opacity="0.42"/>`;
  }
  if (op.selecionada != null) {
    const [x, y] = xy(op.selecionada, v); s += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="#F6F669" opacity="0.8"/>`;
  }
  pos.b.forEach((p, i) => {
    if (!p) return;
    const [x, y] = xy(i, v);
    s += `<image href="${base}${ARQ[p]}.svg" x="${x}" y="${y}" width="${S}" height="${S}"/>`;
  });
  for (const d of op.destinos || []) {
    const [x, y] = xy(d, v), ocupada = !!pos.b[d];
    s += ocupada
      ? `<circle cx="${x + S / 2}" cy="${y + S / 2}" r="${S * 0.46}" fill="none" stroke="#1B5E20" stroke-opacity="0.55" stroke-width="7"/>`
      : `<circle cx="${x + S / 2}" cy="${y + S / 2}" r="${S * 0.15}" fill="#1B5E20" fill-opacity="0.55"/>`;
  }
  for (const a of op.setas || []) s += seta(a.de, a.para, a.cor, v);
  return s + '</svg>';
}

// Casa tocada (índice 0..63) a partir de coordenadas relativas ao elemento.
export function casaTocada(el, clientX, clientY, virado) {
  const r = el.getBoundingClientRect();
  const escala = r.width / (8 * S + 12);
  const x = (clientX - r.left) / escala - 6, y = (clientY - r.top) / escala - 6;
  if (x < 0 || y < 0 || x >= 8 * S || y >= 8 * S) return null;
  let c = Math.floor(x / S), l = Math.floor(y / S);
  if (virado) { c = 7 - c; l = 7 - l; }
  return l * 8 + c;
}
