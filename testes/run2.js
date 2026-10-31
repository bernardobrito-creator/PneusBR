const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const SP = process.argv[2];
const page_src = fs.readFileSync(path.join(SP, 'bipa-estoque.html'), 'utf8');
const mock = fs.readFileSync(path.join(SP, 'teste/mock.js'), 'utf8');
const txt = fs.readFileSync(process.argv[3], 'utf8');
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha.xlsx.b64'), 'utf8');
fs.writeFileSync(path.join(SP, 'teste/test.html'), `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body><script>${mock}<\/script>${page_src}</body></html>`);
// --- gerar boleto e NF-e válidos ---
function mod11b(s){let soma=0,w=2;for(let i=s.length-1;i>=0;i--){soma+=+s[i]*w;w=w===9?2:w+1;}const r=11-(soma%11);return (r===0||r===10||r===11)?1:r;}
function mod10(s){let soma=0,m=2;for(let i=s.length-1;i>=0;i--){let p=+s[i]*m;if(p>9)p=Math.floor(p/10)+p%10;soma+=p;m=m===2?1:2;}return (10-soma%10)%10;}
function dvn(s){let soma=0,w=2;for(let i=s.length-1;i>=0;i--){soma+=+s[i]*w;w=w===9?2:w+1;}const r=soma%11;return r<2?0:11-r;}
const venc='2026-11-10'; const dias=Math.round((new Date(2026,10,10)-new Date(2025,1,22))/86400000); const fator=String(1000+dias).padStart(4,'0');
const livre='1234567890123456789012345'; const sem='3419'+fator+'0000123456'+livre; const dv=mod11b(sem); const bar=sem.slice(0,4)+dv+sem.slice(4);
const c1=bar.slice(0,4)+bar.slice(19,24), c2=bar.slice(24,34), c3=bar.slice(34,44);
const linha=c1+mod10(c1)+c2+mod10(c2)+c3+mod10(c3)+bar[4]+bar.slice(5,19);
const ch43='31'+'2610'+'12345678000195'+'55'+'001'+'000009497'+'1'+'12345678'; const chave=ch43+dvn(ch43);
(async () => {
  const browser = await chromium.launch();
  const out = { errors: [], c: {} };
  async function nova(opts) {
    const ctx = await browser.newContext(opts);
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.route(/cdn\.jsdelivr\.net\/npm\/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/cdn\.jsdelivr\.net\/npm\/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) out.errors.push(m.text()); });
    page.on('pageerror', e => out.errors.push('PAGEERROR ' + e.message));
    await page.addInitScript(([t, x]) => { window.__txt = t; window.__xlsxB64 = x; }, [txt, xlsx]);
    return { ctx, page };
  }
  const { page } = await nova({ viewport: { width: 1400, height: 900 } });
  const go = async h => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForTimeout(250); };
  const P = k => page.evaluate(k => { const p = window.__api.S.produtos.get(k); return p && { preco: p.preco, fonte: p.fonte, mk: p.mk, est: p.estoque, custo: p.custo }; }, k);
  await page.goto('file://' + path.join(SP, 'teste/test.html'));
  await page.waitForTimeout(3000);
  out.c.docs = await page.evaluate(([b, l, ch]) => { const a = window.__api; return { b44: a.lerCodigoDoc(b), b47: a.lerCodigoDoc(l), nfe: a.lerCodigoDoc(ch), lixo: a.lerCodigoDoc('7891234567895') }; }, [bar, linha, chave]);
  out.c.precoInicial = { e12077: await P('e12077'), e12071: await P('e12071'), produtos: await page.evaluate(() => window.__api.S.produtos.size) };
  // markup por categoria Pneus = 1,6 e geral 1,8
  await go('#precificacao');
  await page.fill('#c-mk', '1,8'); await page.fill('[data-mkcat="Pneus"]', '1,6'); await page.waitForTimeout(900);
  const pneuK = await page.evaluate(() => [...window.__api.S.produtos.values()].find(p => p.nome === 'PNEU CF510' && /185\/60R15/.test(p.modelo)).k);
  out.c.markup = { e12077: await P('e12077'), pneu: await P(pneuK), cfg: await page.evaluate(() => window.__store.get('config/geral')) };
  await page.fill('#k-custo', '100'); await page.fill('#k-mk', '2'); await page.waitForTimeout(100);
  out.c.calc = await page.evaluate(() => [document.querySelector('#k-preco').value, document.querySelector('#k-res').innerText]);
  await page.screenshot({ path: path.join(SP, 'teste/n1-precos.png') });
  // serviços
  await go('#servicos');
  await page.click('[data-acao="serv-sug"][data-nome="Alinhamento"]'); await page.waitForTimeout(150);
  await page.click('#s-tab tbody tr'); await page.waitForTimeout(200);
  await page.fill('#sv-preco', '80'); await page.click('[data-acao="serv-salvar"]'); await page.waitForTimeout(200);
  out.c.serv = await page.evaluate(() => [...window.__api.S.servicos.values()]);
  // registrar
  await go('#registrar');
  const scan = async v => { await page.fill('#scan', v); await page.press('#scan', 'Enter'); await page.waitForTimeout(150); };
  await page.keyboard.press('F2'); await page.fill('#qtd', '4'); await scan('12077');
  await page.keyboard.press('F4'); await page.click('[data-pg="pix"]'); await scan('12077');
  await page.click('[data-acao="reg-serv"]'); await page.waitForTimeout(150);
  await scan('S01');
  out.c.reg = { e12077: await P('e12077'), ultimo: await page.evaluate(() => document.querySelector('#ultimo .u-total')?.textContent), fita: await page.evaluate(() => document.querySelector('#fita-tot').innerText.replace(/\n/g, ' | ')) };
  await page.screenshot({ path: path.join(SP, 'teste/n2-registrar.png') });
  // boleto lido no Registrar abre nota a pagar
  await scan(linha); await page.waitForTimeout(400);
  out.c.notaBoleto = await page.evaluate(() => ({ tab: window.__api.S.tab, nd: window.__api.S.nd && { total: window.__api.S.nd.total, venc1: window.__api.S.nd.venc1, desc: window.__api.S.nd.descricao } }));
  await page.fill('[data-nd="parte"]', 'Mauer MG'); await page.click('[data-acao="nd-salvar"]'); await page.waitForTimeout(250);
  // nota a pagar com NF-e + itens
  await page.click('[data-acao="nova-nota"][data-col="pagar"]'); await page.waitForTimeout(200);
  await page.fill('#nd-leitor', chave); await page.press('#nd-leitor', 'Enter'); await page.waitForTimeout(200);
  await page.fill('#nd-leitor', '6*12073'); await page.press('#nd-leitor', 'Enter'); await page.waitForTimeout(150);
  await page.fill('#nd-leitor', '12074'); await page.press('#nd-leitor', 'Enter'); await page.waitForTimeout(150);
  await page.fill('[data-nd="parte"]', 'MDP Peças'); await page.selectOption('[data-nd="nParc"]', '3'); await page.waitForTimeout(100);
  out.c.ndNfe = await page.evaluate(() => ({ nd: { numero: window.__api.S.nd.numero, doc: window.__api.S.nd.doc, total: window.__api.S.nd.total, itens: window.__api.S.nd.itens.length }, parc: document.querySelector('#nd-parc').innerText }));
  await page.screenshot({ path: path.join(SP, 'teste/n3-nota-nova.png') });
  await page.click('[data-acao="nd-salvar"]'); await page.waitForTimeout(250);
  out.c.posNota = { e12073: await P('e12073'), np: await page.evaluate(() => document.querySelector('#np-kpis').innerText.replace(/\n/g, ' | ')) };
  // pagar 1a parcela da nota MDP
  await page.click('#np-tab tbody tr:has-text("MDP")'); await page.waitForTimeout(200);
  await page.click('[data-acao="parc-abrir"][data-i="0"]'); await page.click('[data-acao="parc-ok"][data-i="0"]'); await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SP, 'teste/n4-nota-ver.png') });
  await page.click('.pn-acoes [data-acao="fechar-drawer"]'); await page.waitForTimeout(150);
  out.c.posPagto = await page.evaluate(() => document.querySelector('#np-kpis').innerText.replace(/\n/g, ' | '));
  // nota a receber
  await go('#receber');
  await page.click('[data-acao="nova-nota"][data-col="receber"]'); await page.waitForTimeout(200);
  await page.fill('#nd-leitor', '2*12071'); await page.press('#nd-leitor', 'Enter'); await page.waitForTimeout(150);
  await page.fill('#nd-leitor', 'S01'); await page.press('#nd-leitor', 'Enter'); await page.waitForTimeout(150);
  await page.fill('[data-nd="parte"]', 'João da Silva'); await page.fill('[data-nd="doc"]', '(33) 99999-0000'); await page.selectOption('[data-nd="nParc"]', '2');
  out.c.ndRec = await page.evaluate(() => ({ total: window.__api.S.nd.total, itens: window.__api.S.nd.itens.map(i => [i.nome, i.qtd, i.vu]) }));
  await page.click('[data-acao="nd-salvar"]'); await page.waitForTimeout(250);
  out.c.posRec = { e12071: await P('e12071'), kpis: await page.evaluate(() => document.querySelector('#nr-kpis').innerText.replace(/\n/g, ' | ')) };
  await page.click('#nr-tab tbody tr'); await page.waitForTimeout(200);
  await page.click('[data-acao="parc-abrir"][data-i="0"]'); await page.click('[data-acao="parc-ok"][data-i="0"]'); await page.waitForTimeout(200);
  await page.click('.pn-acoes [data-acao="fechar-drawer"]');
  // caixa do dia
  await go('#caixa');
  await page.fill('#cd-abre', '100'); await page.click('[data-acao="cd-abrir"]'); await page.waitForTimeout(200);
  await page.fill('#cd-conta', '100'); await page.click('[data-acao="cd-fechar"]'); await page.waitForTimeout(200);
  out.c.caixa = await page.evaluate(() => ({ dia: document.querySelector('#caixa-dia').innerText.replace(/\n/g, ' | '), kpis: document.querySelector('#c-kpis').innerText.replace(/\n/g, ' | ') }));
  await page.screenshot({ path: path.join(SP, 'teste/n5-caixa.png'), fullPage: true });
  await go('#faturamento');
  out.c.fat = await page.evaluate(() => document.querySelector('#f-kpis').innerText.replace(/\n/g, ' | ') + ' || ' + document.querySelector('#f-dre').innerText.replace(/\n/g, ' | '));
  await page.screenshot({ path: path.join(SP, 'teste/n6-fat.png'), fullPage: true });
  await go('#balanco');
  out.c.bal = await page.evaluate(() => document.querySelector('#b-dest').innerText.replace(/\n/g, ' | '));
  await page.screenshot({ path: path.join(SP, 'teste/n7-balanco.png'), fullPage: true });
  await go('#rotina');
  await page.click('[data-rot="d2"]'); await page.waitForTimeout(150);
  out.c.rotina = await page.evaluate(() => ({ badge: document.querySelector('#badge-rotina').textContent, dia: document.querySelector('.rot header span').textContent, store: [...window.__store.keys()].filter(k => k.startsWith('rotina/')) }));
  await page.screenshot({ path: path.join(SP, 'teste/n8-rotina.png') });
  // tema
  await page.click('#btn-ajustes'); await page.waitForTimeout(150);
  await page.click('[data-acao="tema"][data-v="escuro"]'); await page.waitForTimeout(100);
  out.c.temaEscuro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.screenshot({ path: path.join(SP, 'teste/n9-ajustes-escuro.png') });
  await page.click('[data-acao="tema"][data-v="claro"]'); await page.waitForTimeout(100);
  out.c.temaClaro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.keyboard.press('Escape');
  out.c.movs = await (async () => { await go('#movimentacoes'); await page.selectOption('#m-per', '7d'); await page.waitForTimeout(150); return page.evaluate(() => document.querySelector('#m-resumo').innerText.replace(/\n/g, ' | ')); })();
  // sistema escuro + escolha claro
  const d = await nova({ viewport: { width: 1200, height: 800 }, colorScheme: 'dark' });
  await d.page.addInitScript(() => { try { localStorage.setItem('pbr.tema', '"claro"'); } catch (e) {} });
  await d.page.goto('file://' + path.join(SP, 'teste/test.html')); await d.page.waitForTimeout(600);
  out.c.osEscuroEscolhaClaro = await d.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await d.page.evaluate(() => { localStorage.setItem('pbr.tema', '"auto"'); }); await d.page.reload(); await d.page.waitForTimeout(600);
  out.c.osEscuroAuto = await d.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // celular
  const m = await nova({ viewport: { width: 390, height: 844 } });
  await m.page.goto('file://' + path.join(SP, 'teste/test.html')); await m.page.waitForTimeout(2500);
  out.c.mobile = {};
  for (const h of ['registrar', 'produtos', 'servicos', 'precificacao', 'movimentacoes', 'caixa', 'faturamento', 'balanco', 'pagar', 'receber', 'rotina']) {
    await m.page.evaluate(h => { location.hash = '#' + h; }, h); await m.page.waitForTimeout(200);
    out.c.mobile[h] = await m.page.evaluate(() => document.documentElement.scrollWidth);
  }
  await m.page.evaluate(() => { location.hash = '#registrar'; }); await m.page.waitForTimeout(200);
  await m.page.screenshot({ path: path.join(SP, 'teste/n10-mobile.png') });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
