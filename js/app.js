// FZA Leitor PGN — interface do leitor de livros.
import { montarLivro, paragrafos } from './livro.js';
import { paraFen, lancesLegais, aplicar, san, posicaoLegal } from './xadrez.js';
import { todosNos } from './pgn.js';
import { svgTabuleiro, casaTocada } from './tabuleiro.js';
import { Motor, textoNota } from './motor.js';
import * as A from './armazenamento.js';

const $ = id => document.getElementById(id);
const prefs = A.lerPreferencias();
const TAMANHOS = ['16px', '18px', '21px'];

const E = {
  livro: null, id: null, reg: 0, no: null,
  rascunho: null,          // { baseNo, lances: [{lance, san, antes, depois}], idx }
  selecionada: null, destinos: [],
  motorLigado: false,
};
const nosPorId = new Map();

// ── Texto e notação ─────────────────────────────────────────────────────────
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FIG = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
const LETRA_PT = { K: 'R', Q: 'D', R: 'T', B: 'B', N: 'C' };
const NAG = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!', 7: '□', 8: '□', 10: '=', 11: '=', 12: '=',
  13: '∞', 14: '+=', 15: '=+', 16: '±', 17: '∓', 18: '+−', 19: '−+', 22: '⊙', 23: '⊙', 32: '⟳', 33: '⟳',
  36: '↑', 37: '↑', 40: '→', 41: '→', 44: '=∞', 45: '=∞', 132: '⇆', 133: '⇆', 138: '⊕', 139: '⊕',
  140: '∆', 142: '⌓', 145: 'RR', 146: 'N' };

const figura = s => esc(s).replace(/^([KQRBN])/, (m, p) => `<span class="fig">${FIG[p]}</span>`)
  .replace(/=([QRBN])/, (m, p) => `=<span class="fig">${FIG[p]}</span>`);
const numero = (pos, forcar) => pos.vez === 'w' ? `${pos.num}.` : forcar ? `${pos.num}...` : '';
const nagsDoLance = n => n.nags.filter(x => x < 10).map(x => NAG[x] || '').join('');
const nagsPosicao = n => n.nags.filter(x => x >= 10).map(x => NAG[x]).filter(Boolean).join(' ');

function htmlParagrafos(texto) {
  return paragrafos(texto).map(p =>
    p.tipo === 'capitulo' ? `<h2 class="capitulo">${esc(p.texto)}</h2>`
      : p.tipo === 'titulo' ? `<h3 class="titulo">${esc(p.texto)}</h3>`
        : `<p>${esc(p.texto)}</p>`).join('');
}

function legendaApos(n) {
  const s = n.san.replace(/^([KQRBN])/, (m, p) => LETRA_PT[p]);
  return `Posição após ${n.antes.num}${n.antes.vez === 'w' ? '.' : '...'}${s}`;
}

function diagramaHtml(pos, marcas, legenda, alvo) {
  const svg = svgTabuleiro(pos, { setas: marcas?.setas, casas: marcas?.casas, coordenadas: true });
  return `<figure class="diagrama" data-alvo="${alvo}">${svg}<figcaption>${esc(legenda)}</figcaption></figure>`;
}

function htmlLinha(linha, principal) {
  const blocos = [];
  let corrente = [];
  let forcarNumero = true;
  const fechar = () => {
    if (corrente.length) blocos.push(principal ? `<div class="lances">${corrente.join(' ')}</div>` : corrente.join(' '));
    corrente = [];
  };
  if (!principal && linha.intro) corrente.push(`<span class="coment">${esc(linha.intro)}</span>`);
  for (const n of linha.nos) {
    const num = numero(n.antes, forcarNumero);
    const pos = nagsPosicao(n);
    corrente.push(`${num ? `<span class="num">${num}</span>` : ''}<span class="lance" data-id="${n.id}">${figura(n.san)}${esc(nagsDoLance(n))}</span>${pos ? ` <span class="nag">${esc(pos)}</span>` : ''}`);
    forcarNumero = false;
    if (n.coment) {
      if (principal) { fechar(); blocos.push(`<div class="coment">${htmlParagrafos(n.coment)}</div>`); }
      else corrente.push(`<span class="coment">${esc(n.coment)}</span>`);
      forcarNumero = true;
    }
    if (n.diagrama || n.setas.length || n.casas.length) {
      fechar();
      const legenda = n.numeroDiagrama ? `Diagrama ${n.numeroDiagrama} (original)` : legendaApos(n);
      blocos.push(diagramaHtml(n.depois, n, legenda, n.id));
      forcarNumero = true;
    }
    if (n.variantes.length) {
      fechar();
      for (const v of n.variantes) blocos.push(`<div class="var">${htmlLinha(v, false)}</div>`);
      forcarNumero = true;
    }
  }
  fechar();
  return blocos.join('');
}

function htmlRegistro(r) {
  const h = [];
  const extra = [r.abertura, r.anotador && `[${r.anotador}]`].filter(Boolean).join(' · ');
  const [branco, preto] = [r.cab.White, r.cab.Black].map(v => v && !/^(\?|-|Texto(\s+\d+\/\d+|\s+do\s+livro)?)$/i.test(v.trim()) ? v.trim() : '');
  h.push('<header class="reg-cab">');
  if (r.evento) h.push(`<div class="evento">${esc(r.evento)}</div>`);
  if (extra) h.push(`<div class="extra">${esc(extra)}</div>`);
  if (branco || preto) h.push(`<h2>${esc(branco)}${preto ? `<span class="preto">${esc(preto)}</span>` : ''}</h2>`);
  else h.push(`<h2>${esc(r.titulo)}</h2>`);
  h.push('</header>');
  if (r.didatico && (r.temLances || r.posicaoInicialPropria))
    h.push('<p class="aviso-didatico">Posição didática do livro: o Stockfish e os lances próprios ficam desligados aqui.</p>');
  if (r.raiz.intro) h.push(htmlParagrafos(r.raiz.intro));
  const im = r.raiz.introMarcas;
  if (r.posicaoInicialPropria || im?.diagrama || im?.setas.length || im?.casas.length) {
    const legenda = r.legenda ? `${r.legenda} (original)` : im?.numeroDiagrama ? `Diagrama ${im.numeroDiagrama} (original)` : 'Posição inicial';
    h.push(diagramaHtml(r.raiz.inicio, im, legenda, 'inicio'));
  }
  if (r.temLances) h.push(htmlLinha(r.raiz, true));
  if (r.resultado) h.push(`<p class="resultado">${esc(r.resultado)}</p>`);
  return h.join('');
}

// ── Posição atual ───────────────────────────────────────────────────────────
const registro = () => E.livro.registros[E.reg];
function posicaoAtual() {
  const R = E.rascunho;
  if (R && R.idx >= 0) return R.lances[R.idx].depois;
  if (R) return R.baseNo ? R.baseNo.depois : registro().raiz.inicio;
  return E.no ? E.no.depois : registro().raiz.inicio;
}
function ultimoLance() {
  const R = E.rascunho;
  if (R) return R.idx >= 0 ? R.lances[R.idx].lance : R.baseNo?.lance;
  return E.no?.lance;
}

function desenharTabuleiro() {
  const marcas = E.rascunho ? null : E.no ? E.no : registro().raiz.introMarcas;
  $('tabuleiro').innerHTML = svgTabuleiro(posicaoAtual(), {
    virado: prefs.virado, ultimo: ultimoLance(), selecionada: E.selecionada, destinos: E.destinos,
    setas: marcas?.setas, casas: marcas?.casas,
  });
  const R = E.rascunho;
  const n = R ? (R.idx >= 0 ? R.lances[R.idx] : R.baseNo) : E.no;
  $('lance-atual').innerHTML = n ? `${numero(n.antes, true)}${figura(n.san)}` : 'Início';
}

function marcarNoTexto() {
  const texto = $('texto');
  texto.querySelectorAll('.ativo').forEach(el => el.classList.remove('ativo'));
  if (E.rascunho) return;
  const el = E.no ? texto.querySelector(`.lance[data-id="${E.no.id}"]`) : null;
  if (!el) return;
  el.classList.add('ativo');
  const a = el.getBoundingClientRect(), b = texto.getBoundingClientRect();
  if (a.top < b.top + 8 || a.bottom > b.bottom - 8) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function desenharRascunho() {
  const R = E.rascunho;
  $('rascunho').hidden = !R;
  if (!R) return;
  let forcar = true;
  $('rascunho-lances').innerHTML = R.lances.map((l, i) => {
    const s = `${numero(l.antes, forcar)}<span class="lance${i === R.idx ? ' ativo' : ''}" data-r="${i}">${figura(l.san)}</span>`;
    forcar = false; return s;
  }).join(' ');
}

function atualizar({ rolar = true } = {}) {
  desenharTabuleiro();
  desenharRascunho();
  if (rolar) marcarNoTexto();
  analisarSeLigado();
  guardarMarcador();
}

// ── Navegação ───────────────────────────────────────────────────────────────
const antesDe = n => (!n ? null : n.indice > 0 ? n.linha.nos[n.indice - 1] : antesDe(n.linha.pai || null));
const depoisDe = n => (n ? n.linha.nos[n.indice + 1] : registro().raiz.nos[0]) || null;

function selecionar(no) {
  E.no = no; E.rascunho = null; E.selecionada = null; E.destinos = [];
  atualizar();
}
function navegar(direcao) {
  const R = E.rascunho;
  E.selecionada = null; E.destinos = [];
  if (R) {
    const fim = R.lances.length - 1;
    R.idx = direcao === 'primeiro' ? -1 : direcao === 'ultimo' ? fim
      : Math.max(-1, Math.min(fim, R.idx + (direcao === 'proximo' ? 1 : -1)));
    return atualizar();
  }
  if (direcao === 'proximo') { const n = depoisDe(E.no); if (n) selecionar(n); }
  else if (direcao === 'anterior') { if (E.no) selecionar(antesDe(E.no)); }
  else if (direcao === 'primeiro') selecionar(null);
  else { const linha = E.no ? E.no.linha : registro().raiz; if (linha.nos.length) selecionar(linha.nos[linha.nos.length - 1]); }
}

function irPara(reg, noId = null, rolagem = null) {
  E.reg = Math.max(0, Math.min(E.livro.registros.length - 1, reg));
  const r = registro();
  nosPorId.clear();
  for (const n of todosNos(r.raiz)) nosPorId.set(n.id, n);
  E.no = noId != null && noId >= 0 ? nosPorId.get(noId) || null : null;
  E.rascunho = null; E.selecionada = null; E.destinos = [];
  $('texto').innerHTML = htmlRegistro(r);
  $('area-tabuleiro').hidden = !(r.temLances || r.posicaoInicialPropria);
  $('texto').scrollTop = rolagem ?? 0;
  const cap = E.livro.capitulos[r.capitulo];
  $('t-capitulo').textContent = cap ? cap.titulo : '';
  $('pag-num').textContent = `${E.reg + 1} de ${E.livro.registros.length}`;
  $('b-pag-ant').disabled = E.reg === 0;
  $('b-pag-prox').disabled = E.reg === E.livro.registros.length - 1;
  atualizar({ rolar: rolagem == null });
}

// ── Lances no tabuleiro (rascunho) ──────────────────────────────────────────
function aviso(msg) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.textContent = msg; t.className = 'mostrar';
  clearTimeout(aviso.t); aviso.t = setTimeout(() => { t.className = ''; }, 2600);
}

function escolherPromocao(cor) {
  return new Promise(ok => {
    const g = $('promocao'), op = $('promo-opcoes');
    op.innerHTML = ['q', 'r', 'b', 'n'].map(p =>
      `<button data-p="${p}"><img src="pecas/merida/${cor}${p.toUpperCase()}.svg" alt="${p}"></button>`).join('');
    g.hidden = false;
    g.onclick = e => {
      const b = e.target.closest('button');
      g.hidden = true; g.onclick = null;
      ok(b ? b.dataset.p : null);
    };
  });
}

async function tocarCasa(casa) {
  const pos = posicaoAtual();
  if (!posicaoLegal(pos)) { aviso('Posição didática: aqui não dá para jogar lances.'); return; }
  const legais = lancesLegais(pos);
  if (E.selecionada != null && E.destinos.includes(casa)) {
    let opcoes = legais.filter(m => m.de === E.selecionada && m.para === casa);
    if (opcoes.length > 1) {
      const p = await escolherPromocao(pos.vez);
      if (!p) return;
      opcoes = opcoes.filter(m => m.promo === p);
    }
    E.selecionada = null; E.destinos = [];
    return jogar(pos, opcoes[0], legais);
  }
  const peca = pos.b[casa];
  const meus = peca ? legais.filter(m => m.de === casa) : [];
  E.selecionada = meus.length ? casa : null;
  E.destinos = meus.map(m => m.para);
  desenharTabuleiro();
}

function jogar(pos, m, legais) {
  const igual = n => n && n.lance.de === m.de && n.lance.para === m.para && (n.lance.promo || '') === (m.promo || '');
  if (!E.rascunho) {
    const prox = depoisDe(E.no);
    const doLivro = [prox, ...(prox ? prox.variantes.map(v => v.nos[0]) : [])].find(igual);
    if (doLivro) return selecionar(doLivro);
    E.rascunho = { baseNo: E.no, lances: [], idx: -1 };
  }
  const R = E.rascunho;
  R.lances = R.lances.slice(0, R.idx + 1);
  R.lances.push({ lance: m, san: san(pos, m, legais), antes: pos, depois: aplicar(pos, m) });
  R.idx = R.lances.length - 1;
  atualizar({ rolar: false });
}

// ── Stockfish ───────────────────────────────────────────────────────────────
const motor = new Motor(mostrarAnalise);
let tempoAnalise = 0;

function analisarSeLigado() {
  if (!E.motorLigado || document.hidden) return;
  const pos = posicaoAtual();
  clearTimeout(tempoAnalise);
  if (!posicaoLegal(pos)) {
    motor.parar();
    $('motor-nota').textContent = '—'; $('motor-prof').textContent = '';
    $('motor-aviso').textContent = 'Posição didática: sem análise.';
    $('motor-linhas').innerHTML = '';
    return;
  }
  $('motor-aviso').textContent = 'analisando…';
  tempoAnalise = setTimeout(() => motor.analisar(paraFen(pos), { linhas: prefs.linhas, profundidade: prefs.profundidade }), 120);
}

function mostrarAnalise(est) {
  if (est.erro) {
    $('motor-nota').textContent = '—';
    $('motor-aviso').textContent = 'O Stockfish não iniciou. Toque em SF para tentar de novo.';
    return;
  }
  if (!E.motorLigado || est.fen !== paraFen(posicaoAtual())) return;
  const [l0] = est.linhas;
  if (!l0) return;
  $('motor-nota').textContent = textoNota(l0);
  $('motor-prof').textContent = `prof. ${est.profundidade}`;
  $('motor-aviso').textContent = est.fim ? '' : 'analisando…';
  $('motor-linhas').innerHTML = est.linhas.map(l => {
    let forcar = true;
    const lances = l.lances.map(x => { const s = numero({ vez: x.vez, num: x.num }, forcar) + figura(x.san); forcar = false; return s; }).join(' ');
    return `<li><b>${textoNota(l)}</b> ${lances}</li>`;
  }).join('');
}

function ligarMotor(ligar) {
  E.motorLigado = ligar;
  $('b-motor').setAttribute('aria-pressed', String(ligar));
  $('motor').hidden = !ligar;
  if (ligar) { $('motor-nota').textContent = '…'; $('motor-linhas').innerHTML = ''; analisarSeLigado(); }
  else motor.parar();
}

// ── Marcador de leitura ─────────────────────────────────────────────────────
let tempoMarcador = 0;
function guardarMarcador() {
  if (!E.id) return;
  clearTimeout(tempoMarcador);
  tempoMarcador = setTimeout(() => A.gravarMarcador(E.id, {
    reg: E.reg, no: E.no ? E.no.id : -1, rolagem: Math.round($('texto').scrollTop),
    total: E.livro.registros.length,
  }), 300);
}

// ── Sumário ─────────────────────────────────────────────────────────────────
function abrirSumario() {
  const L = E.livro;
  $('s-titulo').textContent = L.titulo;
  $('s-autor').textContent = L.autor;
  let atual = null;
  for (const c of L.capitulos) for (const it of c.itens) if (it.registro <= E.reg) atual = it;
  $('s-lista').innerHTML = L.capitulos.map(c => `<li class="cap">${esc(c.titulo)}</li>` + c.itens.map(it =>
    `<li><button data-reg="${it.registro}"${it === atual ? ' class="atual"' : ''}>${esc(it.titulo)}</button></li>`).join('')).join('');
  $('aj-fonte').value = String(prefs.fonte);
  $('aj-linhas').value = String(prefs.linhas);
  $('aj-prof').value = String(prefs.profundidade);
  $('sumario').hidden = false;
  history.pushState({ gaveta: true }, '');
  $('s-lista').querySelector('.atual')?.scrollIntoView({ block: 'center' });
}
function fecharSumario() { $('sumario').hidden = true; }

// ── Biblioteca ──────────────────────────────────────────────────────────────
async function mostrarBiblioteca() {
  ligarMotor(false);
  motor.desligar();
  E.livro = null; E.id = null;
  $('leitor').hidden = true; $('inicio').hidden = false;
  let livros = [];
  try { livros = await A.listarLivros(); } catch { /* sem IndexedDB */ }
  $('vazio').hidden = livros.length > 0;
  $('biblioteca').innerHTML = livros.map(l => {
    const m = A.lerMarcador(l.id);
    const pct = m ? Math.round(100 * (m.reg + 1) / (l.total || m.total || 1)) : 0;
    return `<li class="livro-card"><button class="abrir" data-id="${l.id}"><strong>${esc(l.titulo)}</strong>`
      + `<small>${esc(l.autor || l.nome)}${m ? ` · ${pct}% lido` : ''}</small>`
      + `<div class="progresso"><i style="width:${pct}%"></i></div></button>`
      + `<button class="remover" data-remover="${l.id}" aria-label="Remover ${esc(l.titulo)}">✕</button></li>`;
  }).join('');
}

function abrirLeitor(livro, id) {
  E.livro = livro; E.id = id;
  $('t-livro').textContent = livro.titulo;
  $('inicio').hidden = true; $('leitor').hidden = false;
  history.pushState({ leitor: true }, '');
  const m = A.lerMarcador(id);
  if (m && m.reg < livro.registros.length) irPara(m.reg, m.no, m.rolagem);
  else irPara(0);
}

async function abrirSalvo(id) {
  const l = await A.lerLivro(id);
  if (!l) return mostrarBiblioteca();
  l.abertoEm = Date.now();
  A.salvarLivro(l).catch(() => {});
  abrirLeitor(montarLivro(l.texto, l.nome), id);
}

async function abrirArquivo(nome, texto) {
  $('aviso-erro').hidden = true;
  let livro;
  try { livro = montarLivro(texto, nome); } catch (e) { livro = null; }
  if (!livro || !livro.registros.length) {
    $('aviso-erro').textContent = `Não encontrei partidas em "${nome}". Confira se é um arquivo .pgn.`;
    $('aviso-erro').hidden = false;
    return;
  }
  const id = A.idLivro(nome, texto);
  try {
    await A.salvarLivro({ id, nome, titulo: livro.titulo, autor: livro.autor, texto, total: livro.registros.length, abertoEm: Date.now() });
  } catch { /* abre mesmo sem conseguir guardar */ }
  abrirLeitor(livro, id);
}

// ── Ligações ────────────────────────────────────────────────────────────────
function aplicarFonte() { document.documentElement.style.setProperty('--tam-texto', TAMANHOS[prefs.fonte] || TAMANHOS[1]); }

function ligar() {
  $('arquivo').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) abrirArquivo(f.name, await A.lerTextoArquivo(f));
  });
  $('biblioteca').addEventListener('click', async e => {
    const rem = e.target.closest('[data-remover]');
    if (rem) {
      if (confirm('Remover este livro do celular? O arquivo original não é apagado.')) {
        await A.removerLivro(rem.dataset.remover); A.apagarMarcador(rem.dataset.remover); mostrarBiblioteca();
      }
      return;
    }
    const b = e.target.closest('[data-id]');
    if (b) abrirSalvo(b.dataset.id);
  });

  $('texto').addEventListener('click', e => {
    const l = e.target.closest('.lance');
    if (l) return selecionar(nosPorId.get(Number(l.dataset.id)) || null);
    const f = e.target.closest('figure.diagrama');
    if (f) selecionar(f.dataset.alvo === 'inicio' ? null : nosPorId.get(Number(f.dataset.alvo)) || null);
  });
  $('texto').addEventListener('scroll', guardarMarcador, { passive: true });
  $('rascunho-lances').addEventListener('click', e => {
    const l = e.target.closest('[data-r]');
    if (l && E.rascunho) { E.rascunho.idx = Number(l.dataset.r); atualizar({ rolar: false }); }
  });
  $('b-descartar').onclick = () => { E.rascunho = null; atualizar(); };

  for (const [id, dir] of [['b-primeiro', 'primeiro'], ['b-anterior', 'anterior'], ['b-proximo', 'proximo'], ['b-ultimo', 'ultimo']])
    $(id).onclick = () => navegar(dir);
  $('b-pag-ant').onclick = () => irPara(E.reg - 1);
  $('b-pag-prox').onclick = () => irPara(E.reg + 1);
  $('b-virar').onclick = () => { prefs.virado = !prefs.virado; A.gravarPreferencias(prefs); desenharTabuleiro(); };
  $('b-motor').onclick = () => ligarMotor(!E.motorLigado);
  $('b-sumario').onclick = abrirSumario;
  $('b-fechar-sumario').onclick = () => history.back();
  $('sumario').addEventListener('click', e => {
    if (e.target === $('sumario')) return history.back();
    const b = e.target.closest('[data-reg]');
    if (b) { history.back(); irPara(Number(b.dataset.reg)); }
  });
  $('b-biblioteca').onclick = () => { fecharSumario(); mostrarBiblioteca(); };
  $('aj-fonte').onchange = e => { prefs.fonte = Number(e.target.value); A.gravarPreferencias(prefs); aplicarFonte(); };
  $('aj-linhas').onchange = e => { prefs.linhas = Number(e.target.value); A.gravarPreferencias(prefs); analisarSeLigado(); };
  $('aj-prof').onchange = e => { prefs.profundidade = Number(e.target.value); A.gravarPreferencias(prefs); analisarSeLigado(); };

  // Tabuleiro: toque escolhe peça/casa; deslizar o dedo avança ou volta.
  let ini = null;
  const tab = $('tabuleiro');
  tab.addEventListener('pointerdown', e => { ini = { x: e.clientX, y: e.clientY }; });
  tab.addEventListener('pointerup', e => {
    if (!ini) return;
    const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
    ini = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) return navegar(dx < 0 ? 'proximo' : 'anterior');
    const c = casaTocada(tab, e.clientX, e.clientY, prefs.virado);
    if (c != null) tocarCasa(c);
  });

  document.addEventListener('keydown', e => {
    if ($('leitor').hidden || e.target.tagName === 'SELECT') return;
    const mapa = { ArrowRight: 'proximo', ArrowLeft: 'anterior', Home: 'primeiro', End: 'ultimo' };
    if (mapa[e.key]) { e.preventDefault(); navegar(mapa[e.key]); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) motor.parar(); else analisarSeLigado();
  });
  window.addEventListener('popstate', () => {
    if (!$('sumario').hidden) return fecharSumario();
    if (!$('promocao').hidden) { $('promocao').hidden = true; return; }
    if (!$('leitor').hidden) mostrarBiblioteca();
  });

  let pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); pedidoInstalar = e;
    const d = $('instalar-dica');
    d.hidden = false;
    d.innerHTML = '<button class="botao-secundario" id="b-instalar">Instalar o app neste celular</button>';
    $('b-instalar').onclick = async () => { await pedidoInstalar.prompt(); d.hidden = true; };
  });
  if (!matchMedia('(display-mode: standalone)').matches) $('instalar-dica').hidden = false;
}

async function iniciar() {
  aplicarFonte();
  ligar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (new URLSearchParams(location.search).has('compartilhado')) {
    history.replaceState(null, '', location.pathname);
    try {
      const p = await A.lerPendente();
      if (p) {
        await A.limparPendente();
        const texto = await A.lerTextoArquivo(new Blob([p.dados]));
        return abrirArquivo(p.nome || 'Livro.pgn', texto);
      }
    } catch { /* segue para a biblioteca */ }
  }
  mostrarBiblioteca();
}

iniciar();
