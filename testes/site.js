const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha.xlsx.b64'), 'utf8');
const migr = {
  'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { ajusteMercado: 30, arredondar: 'inteiro', faturamento: 0, loja: 'PneusBR', margem: 30, markup: 1.43, markupCat: {}, markupModo: 'direto', metaMensal: 0, variaveis: [{ id: 'imp', nome: 'Impostos sobre a venda', pct: 0 }, { id: 'maq', nome: 'Taxa da maquininha / cartão', pct: 0 }] } },
  'servicos/sw51sxzso': { path: 'servicos/sw51sxzso', colecao: 'servicos', doc_id: 'sw51sxzso', data: { ativo: true, cod: 'S01', nome: 'Montagem de pneu P', preco: 15 } }
};
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const out = { errors: [], c: {} };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 860 }, acceptDownloads: true });
  await ctx.route(/fonts\./, r => r.abort());
  await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
  await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
  await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
  await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  const nova = async () => { const p = await ctx.newPage(); p.on('pageerror', e => out.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) out.errors.push(m.text()); }); return p; };
  const A = await nova();
  await A.goto('http://127.0.0.1:8765/'); await A.waitForTimeout(600);
  out.c.primeiroAcesso = await A.evaluate(() => ({ criar: !document.querySelector('#f-criar').hidden, entrar: !document.querySelector('#f-entrar').hidden }));
  await A.screenshot({ path: path.join(SP, 'teste/s-login.png') });
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);
  out.c.posLogin = await A.evaluate(() => ({ overlay: !document.querySelector('#login').hidden, produtos: window.__api.S.produtos.size, e12071: window.__api.S.produtos.get('e12071')?.preco, servicos: [...window.__api.S.servicos.values()].map(s => s.nome), planilhaDoc: !!JSON.parse(localStorage.getItem('mock-sb-db')).docs['planilha/meta'], status: document.querySelector('#st-sync-txt').textContent }));
  const B = await nova();
  await B.goto('http://127.0.0.1:8765/#produtos'); await B.waitForTimeout(1500);
  const scan = async (p, v) => { await p.fill('#scan', v); await p.press('#scan', 'Enter'); await p.waitForTimeout(200); };
  await A.keyboard.press('F2'); await A.fill('#qtd', '2'); await scan(A, '12077');
  await A.waitForTimeout(500);
  out.c.tempoReal = await B.evaluate(() => ({ estoqueB: window.__api.S.produtos.get('e12077')?.estoque, ledgersB: window.__api.S.ledgers.size }));
  await A.screenshot({ path: path.join(SP, 'teste/s-registrar.png') });
  // equipe
  await A.click('#btn-ajustes'); await A.waitForTimeout(400);
  await A.fill('#a-p-nome', 'Ana'); await A.fill('#a-p-email', 'ana@pneusbr.com'); await A.fill('#a-p-senha', 'ana-12345');
  await A.click('[data-acao="pbr-add"]'); await A.waitForTimeout(400);
  out.c.equipe = await A.evaluate(() => [...document.querySelectorAll('#a-equipe .pessoa b')].map(b => b.textContent));
  await A.screenshot({ path: path.join(SP, 'teste/s-ajustes.png') });
  // trocar senha
  await A.fill('#a-senha-nova', 'nova-senha-2'); await A.click('[data-acao="pbr-senha"]'); await A.waitForTimeout(200);
  // download
  await A.keyboard.press('Escape');
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(200);
  const [dl] = await Promise.all([A.waitForEvent('download', { timeout: 5000 }), A.click('#p-csv')]);
  out.c.download = dl.suggestedFilename();
  // falha de planilha
  await A.evaluate(() => { window.__planilhaFalha = true; location.hash = '#precificacao'; }); await A.waitForTimeout(200);
  if (await A.evaluate(() => !document.querySelector('[data-view="trava"]').hidden)) { await A.fill('#trava-senha', 'TREPNIAYKS'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(300); }
  await A.click('[data-acao="sincronizar"]'); await A.waitForTimeout(500);
  out.c.erroPlanilha = await A.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).pop());
  // sair e entrar como funcionária
  await B.close();
  await A.click('#btn-ajustes'); await A.waitForTimeout(300);
  await Promise.all([A.waitForNavigation({ timeout: 5000 }).catch(() => null), A.click('[data-acao="pbr-sair"]')]); await A.waitForTimeout(800);
  out.c.aposSair = await A.evaluate(() => ({ entrar: !document.querySelector('#f-entrar').hidden }));
  await A.fill('#le-email', 'ana@pneusbr.com'); await A.fill('#le-senha', 'errada'); await A.click('#f-entrar button[type=submit]'); await A.waitForTimeout(300);
  out.c.senhaErrada = await A.evaluate(() => document.querySelector('#le-erro').textContent);
  await A.fill('#le-senha', 'ana-12345'); await A.click('#f-entrar button[type=submit]'); await A.waitForTimeout(2000);
  await A.click('#btn-ajustes'); await A.waitForTimeout(400);
  out.c.func = await A.evaluate(() => ({ overlay: !document.querySelector('#login').hidden, conta: document.querySelector('#a-conta').innerText.split('\n')[0], equipeVisivel: !document.querySelector('#a-equipe').closest('section').hidden, estoque12077: window.__api.S.produtos.get('e12077')?.estoque }));
  // celular
  const ctxM = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctxM.route(/fonts\./, r => r.abort()); await ctxM.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
  const M = await ctxM.newPage(); M.on('pageerror', e => out.errors.push('M ' + e.message));
  await M.goto('http://127.0.0.1:8765/'); await M.waitForTimeout(800);
  out.c.mobileLogin = await M.evaluate(() => document.documentElement.scrollWidth);
  await M.screenshot({ path: path.join(SP, 'teste/s-login-mobile.png') });
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
