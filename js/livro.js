// Estrutura de livro: capa, capítulos, títulos e parágrafos.
// Segue as mesmas regras do PDF do programa do PC (_gerar_pdf_lista).
import { separarRegistros, lerCabecalhos, lerPartida, resumirPartida } from './pgn.js';
import { lerFen, posicaoLegal, INICIAL } from './xadrez.js';

export function tituloEAutor(nomeArquivo) {
  const base = String(nomeArquivo || 'Livro').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const i = base.indexOf(' - ');
  return i >= 0 ? { autor: base.slice(0, i), titulo: base.slice(i + 3) } : { autor: '', titulo: base };
}

export function textoCabecalho(v) {
  v = String(v ?? '').trim();
  if (['?', '-', '—', '????', '*'].includes(v)) return '';
  if (/^Texto(?:\s+\d+\/\d+|\s+do\s+livro)?$/i.test(v)) return '';
  return v;
}

export function diagramaOriginal(cab) {
  for (const k of ['White', 'Black', 'Annotator']) {
    const m = /^diagrama\s+(\d+[a-z]?)\.?$/i.exec(String(cab[k] || '').trim());
    if (m) return 'Diagrama ' + m[1];
  }
  return '';
}

function tituloRegistro(cab, numero) {
  const partes = [textoCabecalho(cab.White), textoCabecalho(cab.Black)].filter(Boolean);
  return partes.join(' - ') || textoCabecalho(cab.Opening) || `Posição ${numero}`;
}

const RE_CAPITULO = /^CAP[IÍ]TULO\s+([IVXLCDM]+)\b/i;

// Divide um texto em parágrafos: só linhas em branco separam parágrafos;
// quebras simples viram espaço. Marca títulos como o PDF faz.
export function paragrafos(texto) {
  const blocos = String(texto || '').split(/\n[ \t]*\n+/).map(b => b.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  return blocos.map(b => {
    const limpo = b.replace(/^\[página PDF [^\]]+\]\s*/i, '');
    const capitulo = RE_CAPITULO.test(limpo) && limpo.length < 160;
    const titulo = !capitulo && blocos.length > 1 && limpo.length < 100 && (
      (limpo === limpo.toUpperCase() && /\p{L}/u.test(limpo)) ||
      /^(?:[IVXLCDM]+|\d+)\s+[—–-]\s+\D/.test(limpo) ||
      /^(?:O|A|Os|As)\s+(?:Peão|Peões|Cavalo|Cavalos|Bispo|Bispos|Torre|Torres|Dama|Damas|Rei|Reis)$/.test(limpo));
    return { texto: capitulo ? limpo : b, tipo: capitulo ? 'capitulo' : titulo ? 'titulo' : 'texto' };
  });
}

// Monta o livro inteiro a partir do texto do arquivo.
export function montarLivro(texto, nomeArquivo) {
  const { titulo, autor } = tituloEAutor(nomeArquivo);
  const registros = separarRegistros(texto).map((reg, i) => {
    const { cab, corpo } = lerCabecalhos(reg);
    const fen = (cab.FEN || '').trim();
    const inicio = fen || INICIAL;
    const { intro, temLances } = resumirPartida(corpo);
    return {
      i, cab, intro, temLances,
      // Os lances só são processados quando o registro é aberto.
      get raiz() { return (this._raiz ||= lerPartida(corpo, inicio).raiz); },
      titulo: tituloRegistro(cab, i + 1),
      evento: textoCabecalho(cab.Event),
      abertura: textoCabecalho(cab.Opening) || textoCabecalho(cab.ECO),
      anotador: textoCabecalho(cab.Annotator),
      resultado: temLances ? textoCabecalho(cab.Result) : '',
      posicaoInicialPropria: !!fen && fen.split(' ')[0] !== INICIAL.split(' ')[0],
      legenda: diagramaOriginal(cab),
      didatico: !posicaoLegal(lerFen(inicio)),
    };
  });

  const ehLivro = registros.some(r => /texto/i.test(r.cab.Stage || '') || r.cab.SourceTitle);
  const capitulos = [];
  let atual = null;
  const abrir = (tituloCap, i) => {
    const m = RE_CAPITULO.exec(tituloCap);
    const chave = m ? m[1].toUpperCase() : tituloCap;
    if (atual && atual.chave === chave) return;
    atual = { chave, titulo: tituloCap, itens: [] };
    capitulos.push(atual);
  };
  for (const r of registros) {
    if (ehLivro) {
      const m = /cap[ií]tulo\s+([IVXLCDM]+)\b/i.exec(r.evento);
      if (m) {
        let t = 'Capítulo ' + m[1].toUpperCase();
        const w = textoCabecalho(r.cab.White), b = textoCabecalho(r.cab.Black);
        if (!RE_CAPITULO.test(w)) { if (w) t += ' - ' + w; } else if (b) t += ' - ' + b;
        abrir(t, r.i);
      } else if (!atual) {
        abrir(/material inicial/i.test(r.evento) ? 'Textos introdutórios' : 'Textos e assuntos', r.i);
      }
      // Um parágrafo "CAPÍTULO II ..." dentro do texto também abre capítulo.
      for (const p of paragrafos(r.intro)) if (p.tipo === 'capitulo') abrir(p.texto, r.i);
    } else if (!atual) {
      abrir('Partidas', r.i);
    }
    r.capitulo = capitulos.length - 1;
    const anterior = atual.itens[atual.itens.length - 1];
    if (!anterior || anterior.titulo !== r.titulo) atual.itens.push({ titulo: r.titulo, registro: r.i });
  }
  return { titulo, autor, registros, capitulos, ehLivro };
}
