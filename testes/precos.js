const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos.xlsx.b64'), 'utf8');
const migr = {
  'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { ajusteMercado: 30, arredondar: 'inteiro', faturamento: 0, loja: 'PneusBR', margem: 30, markup: 1.43, markupCat: {}, markupModo: 'planilha', metaMensal: 0, variaveis: [{ id: 'imp', nome: 'Impostos sobre a venda', pct: 0 }, { id: 'maq', nome: 'Taxa da maquininha / cartão', pct: 0 }] } }
};
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const out = { errors: [], c: {} };
  const prep = async ctx => {
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 860 } }); await prep(ctx);
  const A = await ctx.newPage(); A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) out.errors.push(m.text()); });
  await A.goto('http://127.0.0.1:8766/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);
  out.c.leitura = await A.evaluate(() => {
    const S = window.__api.S, P = S.produtos, m = S.planilha.meta;
    const achar = n => [...P.values()].find(p => p.nome === n);
    const art = achar('ARTICULAÇÃO AXIAL HIDRÁULICA UNO/FIORINO APÓS 93'), amo = P.get('e12071'), fc = [...P.values()].filter(p => p.nome === 'Filtro de Combustível'), pn = achar('Pneu 175/70 R13 Teste');
    const v = p => p && { k: p.k, custo: p.custo, preco: p.preco, fonte: p.fonte, ean: p.eanPl };
    return { total: P.size, meta: { markupMes: m.markupMes, abaPrecos: m.abaPrecos, nTabela: m.nTabela, contagem: m.contagem }, geral: S.T.geral, mkPlanilha: S.T.mkPlanilha,
      art: v(art), amo: v(amo), fcfb001: v(fc.find(p => p.modelo === 'FCFB001')), fs047: v(fc.find(p => p.modelo === 'FS04/7')), pneu: v(pn),
      porEan: S.indice.get('7891234567895') === art?.k && S.indice.get('7890000000017') === 'e12071' };
  });
  // menu lateral
  out.c.rail = await A.evaluate(() => [...document.querySelectorAll('.rail a[data-tab]')].map(a => a.dataset.tab));
  // tabela de produtos
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(300);
  await A.fill('#p-q', 'amortecedor dianteiro'); await A.dispatchEvent('#p-q', 'input'); await A.waitForTimeout(300);
  out.c.tabela = await A.evaluate(() => ({ cab: [...document.querySelectorAll('#p-tab th')].map(t => t.textContent), linha: document.querySelector('#p-tab tbody tr')?.innerText.replace(/\s+/g, ' ') }));
  await A.fill('#p-q', ''); await A.dispatchEvent('#p-q', 'input'); await A.waitForTimeout(200);
  await A.screenshot({ path: path.join(SP, 'teste/t1-produtos.png') });
  // configurações
  await A.click('#btn-ajustes'); await A.waitForTimeout(400);
  out.c.config = await A.evaluate(() => ({ titulo: document.querySelector('.drawer h2').textContent, itens: [...document.querySelectorAll('.cfg-lista a')].map(a => a.getAttribute('href')) }));
  await A.screenshot({ path: path.join(SP, 'teste/t2-config.png') });
  await A.click('.cfg-lista a[href="#caixa"]'); await A.waitForTimeout(400);
  out.c.caixa = await A.evaluate(() => ({ tab: window.__api.S.tab, drawerFechado: document.querySelector('#drawer').hidden, engrenagemAtiva: document.querySelector('#btn-ajustes').getAttribute('aria-current'), visivel: !document.querySelector('[data-view="caixa"]').hidden }));
  await A.screenshot({ path: path.join(SP, 'teste/t3-caixa.png') });
  await A.click('[data-view="caixa"] .migalha'); await A.waitForTimeout(300);
  out.c.migalha = await A.evaluate(() => !document.querySelector('#drawer').hidden && document.querySelector('.cfg-lista a[aria-current]')?.getAttribute('href'));
  await A.click('.cfg-lista a[href="#precificacao"]'); await A.waitForTimeout(500);
  out.c.precos = await A.evaluate(() => ({ seg: [...document.querySelectorAll('#param-card .seg button')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? ' *' : '')), formula: document.querySelector('#formula').innerText.replace(/\s+/g, ' '), plano: document.querySelector('#plan-card').innerText.replace(/\s+/g, ' ').slice(0, 400) }));
  await A.screenshot({ path: path.join(SP, 'teste/t4-precos.png'), fullPage: false });
  // leitor no código de barras novo
  await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(300);
  await A.keyboard.press('F4'); await A.fill('#scan', '7891234567895'); await A.press('#scan', 'Enter'); await A.waitForTimeout(400);
  out.c.leitor = await A.evaluate(() => ({ nome: document.querySelector('.u-nome')?.textContent, total: document.querySelector('.u-total')?.textContent }));
  // tema noturno + celular
  await A.evaluate(() => { localStorage.setItem('pbr.tema', '"escuro"'); document.documentElement.setAttribute('data-tema', 'escuro'); });
  await A.click('#btn-ajustes'); await A.waitForTimeout(300);
  await A.screenshot({ path: path.join(SP, 'teste/t5-config-escuro.png') });
  const ls = await A.evaluate(() => Object.entries(localStorage));
  const ctxM = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctxM.addInitScript(l => { if (!sessionStorage.getItem('feito')) { for (const [k, v] of l) localStorage.setItem(k, v); sessionStorage.setItem('feito', '1'); } }, ls);
  await prep(ctxM);
  const M = await ctxM.newPage(); M.on('pageerror', e => out.errors.push('M ' + e.message));
  await M.goto('http://127.0.0.1:8766/#produtos'); await M.waitForTimeout(1200);
  out.c.mobileChaves = await M.evaluate(() => Object.keys(localStorage));
  if (await M.evaluate(() => !document.querySelector('#login').hidden)) { await M.fill('#le-email', 'loja@pneusbr.com'); await M.fill('#le-senha', 'senha-forte-1'); await M.click('#f-entrar button[type=submit]'); await M.waitForTimeout(2000); }
  out.c.mobile = { produtos: await M.evaluate(() => document.documentElement.scrollWidth) };
  await M.screenshot({ path: path.join(SP, 'teste/t6-mobile-produtos.png') });
  await M.click('#btn-ajustes'); await M.waitForTimeout(400);
  out.c.mobile.config = await M.evaluate(() => document.documentElement.scrollWidth);
  await M.screenshot({ path: path.join(SP, 'teste/t7-mobile-config.png') });
  await M.click('.cfg-lista a[href="#precificacao"]'); await M.waitForTimeout(500);
  out.c.mobile.precos = await M.evaluate(() => document.documentElement.scrollWidth);
  await M.screenshot({ path: path.join(SP, 'teste/t8-mobile-precos.png') });
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
