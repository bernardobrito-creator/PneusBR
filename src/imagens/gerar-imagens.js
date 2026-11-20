// Gera os ícones e a imagem de prévia (WhatsApp/Open Graph) a partir da marca do sistema (o pneu do login e do menu).
// Uso: NODE_PATH=$(npm root -g) node src/imagens/gerar-imagens.js docs
// Depois: python3 src/imagens/favicon.py docs (junta 16, 32 e 48 px no favicon.ico)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const OUT = path.resolve(process.argv[2] || 'docs');
const FONTES = path.join(OUT, 'fonts');
const FUNDO = '#141112', TINTA = '#F3F0F0', VERMELHO = '#D9474D';
// pneu desenhado em 32 x 32 (o mesmo do login), com as cores fixas
const pneu = (fundo) => `<circle cx="16" cy="16" r="12.4" fill="none" stroke="${TINTA}" stroke-width="4.4"/><circle cx="16" cy="16" r="14.1" fill="none" stroke="${fundo}" stroke-width="1.3" stroke-dasharray="1.6 2.1"/><circle cx="16" cy="16" r="8.2" fill="none" stroke="${TINTA}" stroke-width="1.3"/><path d="M16 13.4V7.8M18.47 15.2l5.33-1.73M17.53 18.1l3.29 4.53M14.47 18.1l-3.29 4.53M13.53 15.2l-5.33-1.73" fill="none" stroke="${TINTA}" stroke-width="1.6" stroke-linecap="round"/><circle cx="16" cy="16" r="2.5" fill="${VERMELHO}"/>`;
// ícone: quadrado arredondado escuro com o pneu (escala = tamanho do pneu em relação ao ícone)
const icone = ({ rx = 112, escala = 0.75 } = {}) => { const t = 512 * escala, o = (512 - t) / 2; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${FUNDO}"/><g transform="translate(${o} ${o}) scale(${t / 32})">${pneu(FUNDO)}</g></svg>`; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const png = async (svgOuHtml, w, h, arq, transparente) => {
    await p.setViewportSize({ width: w, height: h });
    const corpo = svgOuHtml.startsWith('<svg') ? `<style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${svgOuHtml}` : svgOuHtml;
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${corpo}</body></html>`);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, arq), omitBackground: !!transparente, clip: { x: 0, y: 0, width: w, height: h } });
  };
  fs.writeFileSync(path.join(OUT, 'icon.svg'), icone());
  await png(icone(), 192, 192, 'icon-192.png', true);
  await png(icone(), 512, 512, 'icon-512.png', true);
  // maskable: fundo até a borda e o pneu dentro da área segura (círculo central de 80%)
  await png(icone({ rx: 0, escala: 0.58 }), 512, 512, 'icon-maskable-512.png');
  // iPhone/iPad: sem transparência (o aparelho arredonda os cantos sozinho)
  await png(icone({ rx: 0, escala: 0.72 }), 180, 180, 'apple-touch-icon.png');
  for (const n of [16, 32, 48]) await png(icone({ rx: 0, escala: 0.9 }), n, n, `favicon-${n}.png`);
  // prévia do link (WhatsApp, Telegram etc.): 1200 x 630
  const fonte = f => 'data:font/woff2;base64,' + fs.readFileSync(path.join(FONTES, f)).toString('base64');
  await png(`<style>
@font-face{font-family:"IS";font-weight:400 700;src:url(${fonte('instrument-sans-latin.woff2')}) format("woff2")}
html,body{margin:0}
.c{width:1200px;height:630px;box-sizing:border-box;padding:84px 96px;background:linear-gradient(180deg,#060505 0%,#141112 58%,#2a2627 100%);color:${TINTA};font-family:"IS",sans-serif;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.m{display:flex;align-items:center;gap:30px}
.m svg{width:132px;height:132px;display:block}
.m b{font-size:112px;font-weight:700;letter-spacing:-.035em;line-height:1}
.m b span{color:${VERMELHO}}
.t{font-size:44px;font-weight:600;letter-spacing:-.01em;line-height:1.2}
.r{font-size:30px;color:#B9B2B2;font-weight:500}
</style><div class="c">
<div class="m"><svg viewBox="0 0 32 32">${pneu('#0b0a0a')}</svg><b>Pneus<span>BR</span></b></div>
<div><div class="t">Sistema interno da loja: estoque, caixa e notas</div><div class="r" style="margin-top:18px">Acesso só para a equipe</div></div></div>`, 1200, 630, 'og.png');
  await b.close();
  // PNG menores (paleta de cores: os ícones têm poucas cores)
  const sharp = require('sharp');
  for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) {
    const arq = path.join(OUT, f), buf = await sharp(arq).png({ palette: true, quality: 95, compressionLevel: 9, effort: 10 }).toBuffer();
    if (buf.length < fs.statSync(arq).size) fs.writeFileSync(arq, buf);
  }
  console.log('imagens geradas em', OUT);
})().catch(e => { console.error(e); process.exit(1); });
