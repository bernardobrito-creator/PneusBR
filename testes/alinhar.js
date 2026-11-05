// Teste: cabeçalhos alinhados com os valores e botões de alinhar (esquerda, centro, direita)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2], LIB = path.join(SP, 'libs/node_modules');
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const migr = { 'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { ajusteMercado: 30, arredondar: 'inteiro', markup: 1.43, markupModo: 'planilha', variaveis: [] } }, 'servicos/s1': { path: 'servicos/s1', colecao: 'servicos', doc_id: 's1', data: { ativo: true, cod: 'S01', nome: 'Montagem de pneu P', preco: 15 } } };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8771', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const out = { errors: [], c: {} };
  const prep = async ctx => {
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(LIB, 'xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(LIB, 'jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await prep(ctx);
  const A = await ctx.newPage(); A.on('pageerror', e => out.errors.push(e.message));
  await A.goto('http://127.0.0.1:8771/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(2500);
  // uma venda e um serviço para ter linhas em Movimentações
  await A.keyboard.press('F4'); await A.fill('#scan', '7891234567895'); await A.press('#scan', 'Enter'); await A.waitForTimeout(200);
  await A.fill('#scan', 'S01'); await A.press('#scan', 'Enter'); await A.waitForTimeout(300);
  // compara o alinhamento de cada cabeçalho com a primeira linha
  const comparar = id => A.evaluate(id => {
    const t = document.getElementById(id), ths = [...t.querySelectorAll('thead th')], tr = t.querySelector('tbody tr'); if (!tr) return 'sem linhas';
    const tds = [...tr.children]; if (tds.length !== ths.length) return 'linha especial';
    const al = e => { const v = getComputedStyle(e).textAlign; return v === 'start' ? 'left' : v; }; const dif = ths.map((th, i) => [th.textContent.trim(), al(th), al(tds[i])]).filter(([n, a, b]) => n && a !== b);
    return dif.length ? dif : 'ok';
  }, id);
  out.c.barras = await A.evaluate(() => [...document.querySelectorAll('.alinhar-bar')].map(b => b.nextElementSibling.querySelector('table').id));
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(300);
  out.c.produtosAuto = await comparar('p-tab');
  await A.screenshot({ path: path.join(SP, 'teste/a1-produtos.png'), clip: { x: 66, y: 200, width: 1294, height: 360 } });
  await A.click('[data-acao="alinhar"][data-tabela="p-tab"][data-v="cen"]'); await A.waitForTimeout(150);
  out.c.produtosCentro = await A.evaluate(() => { const t = document.getElementById('p-tab'); return [...new Set([...t.querySelectorAll('th,td')].map(e => getComputedStyle(e).textAlign))]; });
  await A.screenshot({ path: path.join(SP, 'teste/a2-produtos-centro.png'), clip: { x: 66, y: 200, width: 1294, height: 360 } });
  await A.reload(); await A.waitForTimeout(1800); await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(300);
  out.c.depoisDeRecarregar = await A.evaluate(() => ({ classe: document.getElementById('p-tab').className, apertado: document.querySelector('[data-acao="alinhar"][data-tabela="p-tab"][aria-pressed="true"]')?.dataset.v }));
  await A.click('[data-acao="alinhar"][data-tabela="p-tab"][data-v="cen"]'); await A.waitForTimeout(150);
  out.c.voltouAuto = await A.evaluate(() => document.getElementById('p-tab').className);
  await A.evaluate(() => { location.hash = '#movimentacoes'; }); await A.waitForTimeout(300);
  out.c.movAuto = await comparar('m-tab');
  await A.click('[data-acao="alinhar"][data-tabela="m-tab"][data-v="dir"]'); await A.waitForTimeout(150);
  out.c.movDireita = await A.evaluate(() => [...new Set([...document.querySelectorAll('#m-tab th,#m-tab td')].map(e => getComputedStyle(e).textAlign))]);
  await A.screenshot({ path: path.join(SP, 'teste/a3-mov-direita.png'), clip: { x: 66, y: 120, width: 1294, height: 360 } });
  await A.evaluate(() => { location.hash = '#servicos'; }); await A.waitForTimeout(300);
  out.c.servicos = await comparar('s-tab');
  await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(300);
  await A.fill('#trava-senha', 'TREPNIAYKS'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(400);
  out.c.precos = await comparar('pr-tab');
  await A.evaluate(() => { location.hash = '#caixa'; }); await A.waitForTimeout(300);
  out.c.caixa = await comparar('c-tab');
  await A.hover('[data-acao="alinhar"][data-tabela="c-tab"][data-v="esq"]'); await A.waitForTimeout(150);
  out.c.dica = await A.evaluate(() => document.querySelector('#tip').hidden ? null : document.querySelector('#tip').textContent);
  // celular
  const ls = await A.evaluate(() => Object.entries(localStorage));
  const ctxM = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctxM.addInitScript(l => { if (!sessionStorage.getItem('c')) { for (const [k, v] of l) localStorage.setItem(k, v); sessionStorage.setItem('c', '1'); } }, ls); await prep(ctxM);
  const M = await ctxM.newPage(); M.on('pageerror', e => out.errors.push('M ' + e.message));
  await M.goto('http://127.0.0.1:8771/#produtos'); await M.waitForTimeout(1800);
  out.c.mobile = await M.evaluate(() => document.documentElement.scrollWidth);
  await M.screenshot({ path: path.join(SP, 'teste/a4-mobile.png') });
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
