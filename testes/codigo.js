// Teste: códigos TREPNIAYKS, senha do Caixa/Faturamento, ícones das Configurações e gráfico de lucro e prejuízo
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const migr = {
  'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { ajusteMercado: 30, arredondar: 'inteiro', faturamento: 0, loja: 'PneusBR', margem: 30, markup: 1.43, markupCat: {}, markupModo: 'planilha', metaMensal: 0, variaveis: [{ id: 'imp', nome: 'Impostos sobre a venda', pct: 0 }, { id: 'maq', nome: 'Taxa da maquininha / cartão', pct: 0 }] } },
  'servicos/sw51sxzso': { path: 'servicos/sw51sxzso', colecao: 'servicos', doc_id: 'sw51sxzso', data: { ativo: true, cod: 'S01', nome: 'Montagem de pneu P', preco: 15 } }
};
const temDigito = s => /\d/.test(String(s).replace(/R\$\s?/g, ''));
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8767', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const out = { errors: [], c: {} };
  const prep = async (ctx, lsCopia) => {
    if (lsCopia) await ctx.addInitScript(l => { if (!sessionStorage.getItem('copiado')) { for (const [k, v] of l) localStorage.setItem(k, v); sessionStorage.setItem('copiado', '1'); } }, lsCopia);
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  };
  const nova = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => out.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) out.errors.push(m.text()); }); return p; };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await prep(ctx);
  const A = await nova(ctx);
  await A.goto('http://127.0.0.1:8767/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);
  out.c.planilha = await A.evaluate(() => { const S = window.__api.S, m = S.planilha.meta; return { total: S.produtos.size, markupMes: m.markupMes, aba: m.abaPrecos, nTabela: m.nTabela, venda: m.contagem.venda, zero: S.indice.has('0789000000048') }; });
  // movimentos
  const scan = async v => { await A.fill('#scan', v); await A.press('#scan', 'Enter'); await A.waitForTimeout(250); };
  await A.keyboard.press('F4'); await A.fill('#qtd', '2'); await scan('7891234567895');
  out.c.ultimoVenda = await A.evaluate(() => ({ total: document.querySelector('.u-total').textContent, calc: document.querySelector('.u-calc').textContent }));
  await A.fill('#qtd', '1'); await scan('7890000000031');
  await A.fill('#u-vu', '100,00'); await A.click('[data-acao="u-salvar"]'); await A.waitForTimeout(250);
  await scan('S01'); await A.click('.pede-quem .btn'); await A.waitForTimeout(250);
  await A.click('[data-motivo="perda"]'); await A.waitForTimeout(150); await scan('0789000000048');
  out.c.ultimoPerda = await A.evaluate(() => document.querySelector('.u-total').textContent);
  out.c.kpis = await A.evaluate(() => [...document.querySelectorAll('[data-view="registrar"] .kpi')].map(k => k.querySelector('.eyebrow').textContent + ': ' + k.querySelector('.v').textContent));
  out.c.fita = await A.evaluate(() => [...document.querySelectorAll('#fita-lista .f-v')].map(e => e.textContent));
  out.c.fitaRodape = await A.evaluate(() => document.querySelector('.fita footer').innerText.replace(/\s+/g, ' '));
  await A.screenshot({ path: path.join(SP, 'teste/c1-registrar.png') });
  // produtos
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(300);
  await A.fill('#p-q', 'articulacao axial hidraulica'); await A.dispatchEvent('#p-q', 'input'); await A.waitForTimeout(300);
  out.c.produto = await A.evaluate(() => document.querySelector('#p-tab tbody tr').innerText.replace(/\s+/g, ' '));
  await A.click('#p-tab tbody tr'); await A.waitForTimeout(400);
  out.c.ficha = await A.evaluate(() => document.querySelector('#d-calc').innerText.replace(/\t/g, ': ').split('\n').filter(Boolean));
  await A.keyboard.press('Escape'); await A.fill('#p-q', ''); await A.dispatchEvent('#p-q', 'input');
  // configurações: só ícones
  out.c.travadasAntes = await A.evaluate(() => ['balanco', 'precificacao'].map(t => { location.hash = '#' + t; return t; }));
  await A.evaluate(() => { location.hash = '#balanco'; }); await A.waitForTimeout(300);
  out.c.balancoTravado = await A.evaluate(() => !document.querySelector('[data-view="trava"]').hidden && document.querySelector('#trava-titulo').textContent);
  await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(300);
  out.c.precosTravado = await A.evaluate(() => !document.querySelector('[data-view="trava"]').hidden && document.querySelector('#trava-titulo').textContent);
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(300);
  await A.click('#btn-ajustes'); await A.waitForTimeout(400);
  out.c.icones = await A.evaluate(() => [...document.querySelectorAll('.cfg-icones a')].map(a => ({ href: a.getAttribute('href'), texto: a.innerText.trim(), dica: a.dataset.tip })));
  await A.hover('.cfg-icones a[href="#caixa"]'); await A.waitForTimeout(200);
  out.c.dica = await A.evaluate(() => ({ visivel: !document.querySelector('#tip').hidden, texto: document.querySelector('#tip').textContent }));
  await A.screenshot({ path: path.join(SP, 'teste/c2-config.png') });
  await A.click('.cfg-icones a[href="#caixa"]'); await A.waitForTimeout(400);
  out.c.trava = await A.evaluate(() => ({ trava: !document.querySelector('[data-view="trava"]').hidden, caixa: !document.querySelector('[data-view="caixa"]').hidden, titulo: document.querySelector('#trava-titulo').textContent, foco: document.activeElement?.id }));
  await A.screenshot({ path: path.join(SP, 'teste/c3-trava.png') });
  await A.fill('#trava-senha', 'abc'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(200);
  out.c.senhaErrada = await A.evaluate(() => !document.querySelector('#trava-erro').hidden);
  await A.fill('#trava-senha', 'trepniayks'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(400);
  out.c.caixa = await A.evaluate(() => ({ visivel: !document.querySelector('[data-view="caixa"]').hidden, kpis: [...document.querySelectorAll('#c-kpis .kpi .v')].map(v => v.textContent) }));
  await A.screenshot({ path: path.join(SP, 'teste/c4-caixa.png') });
  await A.evaluate(() => { location.hash = '#faturamento'; }); await A.waitForTimeout(500);
  out.c.fat = await A.evaluate(() => ({ visivel: !document.querySelector('[data-view="faturamento"]').hidden, kpis: [...document.querySelectorAll('#f-kpis .kpi .v')].map(v => v.textContent), lp: [...document.querySelectorAll('#f-lp .lp-row')].map(r => r.innerText.replace(/\s+/g, ' ')), tot: document.querySelector('#f-lp .lp-tot')?.innerText.replace(/\s+/g, ' ') }));
  await A.screenshot({ path: path.join(SP, 'teste/c5-faturamento.png'), fullPage: true });
  // balanço e preços: liberados junto, com números normais; produtos continua em letras
  await A.evaluate(() => { location.hash = '#balanco'; }); await A.waitForTimeout(400);
  out.c.balanco = await A.evaluate(() => ({ visivel: !document.querySelector('[data-view="balanco"]').hidden, kpis: [...document.querySelectorAll('[data-view="balanco"] .kpi .v')].map(v => v.textContent) }));
  await A.screenshot({ path: path.join(SP, 'teste/c8-balanco.png') });
  await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(400);
  out.c.precos = await A.evaluate(() => ({ visivel: !document.querySelector('[data-view="precificacao"]').hidden, formula: document.querySelector('#formula').innerText.replace(/\s+/g, ' ').slice(0, 80), linha: document.querySelector('#pr-tab tbody tr')?.innerText.replace(/\s+/g, ' ') }));
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(300);
  out.c.produtosDepois = await A.evaluate(() => document.querySelector('#p-resumo').innerText);
  // recarregar a mesma aba: continua liberado
  await A.reload(); await A.waitForTimeout(1800); await A.evaluate(() => { location.hash = '#caixa'; }); await A.waitForTimeout(300);
  out.c.aposRecarregar = await A.evaluate(() => !document.querySelector('[data-view="caixa"]').hidden);
  // outra aba: pede senha de novo
  const B = await nova(ctx); await B.goto('http://127.0.0.1:8767/#faturamento'); await B.waitForTimeout(1800);
  out.c.outraAba = await B.evaluate(() => ({ trava: !document.querySelector('[data-view="trava"]').hidden, titulo: document.querySelector('#trava-titulo').textContent }));
  await B.close();
  // bloquear
  await A.click('[data-view="caixa"] [data-acao="bloquear"]'); await A.waitForTimeout(300);
  out.c.bloqueado = await A.evaluate(() => !document.querySelector('[data-view="trava"]').hidden);
  // celular e noturno
  const lsCopia = await A.evaluate(() => Object.entries(localStorage));
  const ctxM = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' }); await prep(ctxM, lsCopia);
  const M = await nova(ctxM);
  await M.goto('http://127.0.0.1:8767/#faturamento'); await M.waitForTimeout(1800);
  await M.fill('#trava-senha', 'TREPNIAYKS'); await M.press('#trava-senha', 'Enter'); await M.waitForTimeout(500);
  out.c.mobile = { fat: await M.evaluate(() => document.documentElement.scrollWidth) };
  const lp = await M.$('#f-lp'); await lp.screenshot({ path: path.join(SP, 'teste/c6-mobile-lp.png') });
  await M.click('#btn-ajustes'); await M.waitForTimeout(400);
  out.c.mobile.config = await M.evaluate(() => document.documentElement.scrollWidth);
  await M.screenshot({ path: path.join(SP, 'teste/c7-mobile-config.png') });
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
