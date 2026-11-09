// Teste: célula "Código de barras" da planilha com mais de um código (separados por " / ")
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos3.xlsx.b64'), 'utf8');
const migr = {
  'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { ajusteMercado: 30, arredondar: 'inteiro', faturamento: 0, loja: 'PneusBR', margem: 30, markup: 1.43, markupCat: {}, markupModo: 'planilha', metaMensal: 0, variaveis: [] } }
};
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8771', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const out = { errors: [], c: {} };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.route(/fonts\./, r => r.abort());
  await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
  await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
  await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
  await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  const A = await ctx.newPage();
  A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) out.errors.push(m.text()); });
  await A.goto('http://127.0.0.1:8771/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);
  out.c.indice = await A.evaluate(() => {
    const S = window.__api.S, nome = c => { const p = S.produtos.get(S.indice.get(c)); return p ? (p.nome + ' ' + p.modelo + ' ' + p.marca).trim() : null; };
    return {
      total: S.produtos.size,
      f700a: nome('7893091033834'), f700b: nome('7893091008665'),
      eco: ['7893091008467', '7893091036309', '7893091027505', '7893091003721'].map(nome),
      numero: nome('7898492107108'), um: nome('6939801710853'),
      juntoNaoExiste: S.indice.has('7893091033834/7893091008665') || S.indice.has('78930910338347893091008665')
    };
  });
  // bipar o segundo código do F-700 em Venda
  await A.keyboard.press('F4'); await A.fill('#qtd', '1'); await A.fill('#scan', '7893091008665'); await A.press('#scan', 'Enter'); await A.waitForTimeout(300);
  out.c.bipado = await A.evaluate(() => document.querySelector('.u-nome, .ultimo b')?.textContent || document.querySelector('#ultimo')?.innerText.split('\n').slice(0, 3).join(' | '));
  // ficha do produto
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(300);
  await A.fill('#p-q', 'ecopia ep150'); await A.dispatchEvent('#p-q', 'input'); await A.waitForTimeout(300);
  out.c.linha = await A.evaluate(() => document.querySelector('#p-tab tbody tr').innerText.replace(/\s+/g, ' '));
  await A.click('#p-tab tbody tr'); await A.waitForTimeout(400);
  out.c.ficha = await A.evaluate(() => [...document.querySelectorAll('#drawer-pn p.muted')].map(p => p.textContent).find(t => /planilha/.test(t)));
  await A.screenshot({ path: path.join(SP, 'teste/m1-ficha.png') });
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
