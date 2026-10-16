# FZA Leitor PGN

Leitor gratuito de livros de xadrez em PGN para celular. Abre um arquivo `.pgn`, mostra o livro com sumário, texto, lances, variantes e diagramas, e tem o Stockfish para analisar posições. Não salva nem exporta nada: o arquivo PGN nunca é alterado.

Funciona no navegador (Chrome do Android) e pode ser instalado como app pela opção "Adicionar à tela inicial". Depois da primeira abertura, funciona sem internet.

## Testar no seu celular (rede de casa)

1. Dê dois cliques em `ferramentas\testar_no_celular.bat`.
2. Se o Windows perguntar sobre o firewall, permita em **Redes privadas**.
3. No Chrome do celular (no mesmo Wi-Fi), abra o endereço que a janela mostra, por exemplo `http://192.168.100.203:8765`.
4. Toque em **Abrir livro (.pgn)** e escolha um arquivo do celular.

Por esse endereço local, três recursos ficam desligados, porque o Chrome só os libera em sites com `https`: instalar o app, funcionar sem internet e receber arquivos pelo menu Compartilhar. Eles passam a funcionar depois de publicar (abaixo).

Para testar esses três ainda em casa: no Chrome do celular, abra `chrome://flags`, procure **Insecure origins treated as secure**, ative e escreva o endereço (ex.: `http://192.168.100.203:8765`). Toque em **Relaunch**.

## Publicar para amigos e alunos (grátis, GitHub Pages)

1. Crie uma conta em https://github.com (gratuita).
2. Crie um repositório público, por exemplo `fza-leitor`.
3. Envie **o conteúdo desta pasta** (`index.html`, `app.css`, `js`, `pecas`, `vendor` etc.) para a raiz do repositório.
4. No repositório: **Settings → Pages → Branch: main → / (root) → Save**.
5. Em alguns minutos o endereço fica pronto: `https://SEU-USUARIO.github.io/fza-leitor/`.
6. Mande esse link pelo WhatsApp. No Chrome, cada pessoa toca em **⋮ → Adicionar à tela inicial** (ou no botão **Instalar o app** da tela inicial).

## Atualizar o app depois de publicado

Sempre que mudar algum arquivo, aumente o número da versão na 1ª linha de código de `sw.js`:

```js
const VERSAO = 'fza-leitor-v1';   // mude para v2, v3...
```

Sem isso, os celulares que já instalaram continuam usando os arquivos antigos guardados. Com a versão nova, a atualização chega sozinha na próxima abertura.

## Estrutura

| Arquivo | Função |
| --- | --- |
| `index.html`, `app.css` | Telas e visual |
| `js/app.js` | Interface: biblioteca, leitura, navegação, rascunho, Stockfish |
| `js/livro.js` | Capítulos, títulos e parágrafos (mesmas regras do PDF do programa do PC) |
| `js/pgn.js` | Leitura do PGN: lances, variantes, comentários, NAGs, setas e diagramas |
| `js/xadrez.js` | Regras do xadrez; aceita as posições didáticas do livro |
| `js/tabuleiro.js` | Desenho do tabuleiro (mármore verde + peças Merida) |
| `js/motor.js` | Stockfish num Web Worker |
| `js/armazenamento.js` | Biblioteca no celular e marcador de leitura |
| `sw.js`, `manifest.webmanifest` | Uso sem internet, instalação e menu Compartilhar |
| `vendor/stockfish/` | Stockfish 19 lite (GPL v3) |
| `pecas/merida/` | Peças Merida (GPL v2+) |
| `ferramentas/` | Servidor para testar no celular pela rede de casa |

Licenças: veja `LICENCAS.txt`.
