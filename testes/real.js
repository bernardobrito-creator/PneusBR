// Lê a exportação real da planilha (com a aba nova) pelo mesmo caminho do site
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2], xlsx = fs.readFileSync(process.argv[3], 'utf8');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8768', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(), ctx = await b.newContext(), errs = [];
  await ctx.route(/fonts\./, r => r.abort());
  await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
  await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
  await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
  await ctx.addInitScript(x => { window.__xlsxB64 = x; window.__pbrTeste = api => { window.__api = api; }; localStorage.setItem('mock-sb-db', JSON.stringify({ docs: { 'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { ajusteMercado: 30, arredondar: 'inteiro', markup: 1.43, markupModo: 'planilha', variaveis: [] } } }, membros: {}, users: {} })); }, xlsx);
  const A = await ctx.newPage(); A.on('pageerror', e => errs.push(e.message));
  await A.goto('http://127.0.0.1:8768/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'B'); await A.fill('#lc-email', 'a@b.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3500);
  const r = await A.evaluate(() => { const S = window.__api.S, m = S.planilha.meta, P = [...S.produtos.values()];
    const pick = n => { const p = P.find(p => (p.nome + ' ' + p.modelo).startsWith(n)); return p && { custo: p.custo, preco: p.preco, fonte: p.fonte }; };
    return { total: P.size, markupMes: m.markupMes, aba: m.abaPrecos, nTabela: m.nTabela, contagem: m.contagem, geral: S.T.geral,
      art: pick('ARTICULAÇÃO AXIAL HIDRÁULICA'), cf510: pick('PNEU CF510 175/75R13'), amortecedor: pick('AMORTECEDOR DIANTEIRO'), fontes: P.reduce((a, p) => (a[p.fonte] = (a[p.fonte] || 0) + 1, a), {}) }; });
  console.log(JSON.stringify({ errs, r }, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
