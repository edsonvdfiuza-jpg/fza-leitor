// Stockfish (versão leve, uma thread) rodando num Web Worker.
// Uma análise por vez: pedir outra posição interrompe a atual.
import { lerFen, lancesLegais, aplicar, san, nomeCasa } from './xadrez.js';

const ARQUIVO = 'vendor/stockfish/stockfish-19-lite-single.js';

export class Motor {
  constructor(aoAtualizar) {
    this.aoAtualizar = aoAtualizar; // ({profundidade, linhas:[{nota, lances}], fim})
    this.worker = null;
    this.pronto = null;
    this.ocupado = false;
    this.pendente = null;
    this.atual = null;
    this.multipv = 0;
  }

  _iniciar() {
    if (this.pronto) return this.pronto;
    // Às vezes o motor carrega mas não responde. Vigia: sem "readyok" em
    // 5 s, descarta o worker e cria outro (até 3 tentativas).
    this.pronto = new Promise((ok, falha) => {
      let tentativas = 0;
      const criar = () => {
        tentativas++;
        if (this.worker) this.worker.terminate();
        const w = this.worker = new Worker(ARQUIVO);
        let respondeu = false;
        const vigia = setTimeout(() => {
          if (respondeu) return;
          if (tentativas < 3) return criar();
          this.desligar();
          this.aoAtualizar({ erro: true });
          falha(new Error('Stockfish não respondeu'));
        }, 5000);
        w.onerror = e => console.error('Stockfish:', e.message || e);
        w.onmessage = e => {
          if (w !== this.worker) return;
          const l = String(e.data);
          if (l === 'readyok' && !respondeu) { respondeu = true; clearTimeout(vigia); ok(); }
          this._linha(l);
        };
        w.postMessage('uci');
        w.postMessage('isready');
      };
      criar();
    });
    return this.pronto;
  }

  async analisar(fen, { linhas = 2, profundidade = 18 } = {}) {
    try { await this._iniciar(); } catch { return; }
    this.pendente = { fen, linhas, profundidade };
    if (this.ocupado) this.worker.postMessage('stop');
    else this._comecar();
  }

  parar() {
    this.pendente = null;
    if (this.ocupado && this.worker) this.worker.postMessage('stop');
  }

  desligar() {
    this.parar();
    if (this.worker) this.worker.terminate();
    this.worker = null; this.pronto = null; this.ocupado = false; this.multipv = 0;
  }

  _comecar() {
    const p = this.pendente;
    this.pendente = null;
    if (!p) return;
    if (p.linhas !== this.multipv) {
      this.worker.postMessage(`setoption name MultiPV value ${p.linhas}`);
      this.multipv = p.linhas;
    }
    this.atual = { ...p, pos: lerFen(p.fen), linhas: [], profundidade: 0 };
    this.ocupado = true;
    this.worker.postMessage(`position fen ${p.fen}`);
    this.worker.postMessage(`go depth ${p.profundidade}`);
  }

  _linha(l) {
    if (l.startsWith('bestmove')) {
      this.ocupado = false;
      if (this.atual && !this.pendente) this.aoAtualizar({ ...this._estado(), fim: true });
      if (this.pendente) this._comecar();
      return;
    }
    if (!l.startsWith('info') || !this.atual || this.pendente) return;
    const pv = / pv (.+)$/.exec(l), nota = / score (cp|mate) (-?\d+)/.exec(l);
    if (!pv || !nota || / lowerbound| upperbound/.test(l)) return;
    const k = Number((/ multipv (\d+)/.exec(l) || [, 1])[1]) - 1;
    const prof = Number((/ depth (\d+)/.exec(l) || [, 0])[1]);
    const sinal = this.atual.pos.vez === 'w' ? 1 : -1; // nota sempre do ponto de vista das brancas
    this.atual.linhas[k] = {
      tipo: nota[1], valor: Number(nota[2]) * sinal,
      lances: this._uciParaSan(pv[1].trim().split(/\s+/).slice(0, 12)),
    };
    if (k === 0) this.atual.profundidade = prof;
    this.aoAtualizar({ ...this._estado(), fim: false });
  }

  _estado() {
    return { fen: this.atual.fen, profundidade: this.atual.profundidade, linhas: this.atual.linhas.filter(Boolean) };
  }

  _uciParaSan(lista) {
    let p = this.atual.pos;
    const saida = [];
    for (const u of lista) {
      const legais = lancesLegais(p);
      const m = legais.find(x => nomeCasa(x.de) === u.slice(0, 2) && nomeCasa(x.para) === u.slice(2, 4)
        && (!x.promo || x.promo === (u[4] || 'q')));
      if (!m) break;
      saida.push({ san: san(p, m, legais), vez: p.vez, num: p.num });
      p = aplicar(p, m);
    }
    return saida;
  }
}

export function textoNota(l) {
  if (!l) return '';
  if (l.tipo === 'mate') return (l.valor > 0 ? '+' : '−') + 'M' + Math.abs(l.valor);
  const v = l.valor / 100;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
}
