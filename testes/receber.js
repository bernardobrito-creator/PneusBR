// Teste: notas a receber importadas (escritas à mão), organizar por comprador/data, abater valor, desfazer, editar, conferir
// Precisa de nr/notas.json (dados reais dos clientes, fora do repositório).
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const notas = JSON.parse(fs.readFileSync(path.join(SP, 'nr/notas.json'), 'utf8'));
const migr = { 'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'inteiro', ajusteMercado: 30, margem: 30, markupCat: {}, variaveis: [] } } };
for (const n of notas) migr['receber/' + n.id] = { path: 'receber/' + n.id, colecao: 'receber', doc_id: n.id, data: n.data };
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8769', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} };
  const prep = async (ctx, lsCopia) => {
    if (lsCopia) await ctx.addInitScript(l => { if (!sessionStorage.getItem('copiado')) { for (const [k, v] of l) localStorage.setItem(k, v); sessionStorage.setItem('copiado', '1'); } }, lsCopia);
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  };
  const nova = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => out.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|404/.test(m.text())) out.errors.push(m.text()); }); return p; };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await prep(ctx);
  const A = await nova(ctx);
  await A.goto('http://127.0.0.1:8769/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);
  const db = () => A.evaluate(() => JSON.parse(localStorage.getItem('mock-sb-db')).docs);
  await A.evaluate(() => { location.hash = '#receber'; }); await A.waitForTimeout(600);
  out.c.kpis = await A.evaluate(() => [...document.querySelectorAll('#nr-kpis .kpi')].map(k => k.innerText.replace(/\s+/g, ' ')));
  out.c.filtros = await A.evaluate(() => [...document.querySelectorAll('#nr-filtro button')].map(b => b.textContent));
  out.c.linhasData = await A.evaluate(() => document.querySelectorAll('#nr-tab tbody tr').length);
  ok(out.c.linhasData === 105, '105 linhas em aberto', out);
  await A.screenshot({ path: path.join(SP, 'teste/r1-data.png') });
  // por comprador
  await A.click('#nr-ordem [data-v="parte"]'); await A.waitForTimeout(300);
  out.c.grupos = await A.evaluate(() => [...document.querySelectorAll('#nr-tab tr.grupo')].map(r => r.innerText.replace(/\s+/g, ' ')));
  ok(out.c.grupos.length === 71, '71 grupos', out);
  out.c.adriano = await A.evaluate(() => { const g = [...document.querySelectorAll('#nr-tab tr.grupo')].find(r => r.innerText.includes('Adriano Amaral')); const l = []; let r = g.nextElementSibling; while (r && !r.classList.contains('grupo')) { l.push(r.querySelector('td').innerText.replace(/\s+/g, ' ')); r = r.nextElementSibling; } return { cab: g.innerText.replace(/\s+/g, ' '), datas: l }; });
  await A.screenshot({ path: path.join(SP, 'teste/r2-comprador.png') });
  // filtro conferir
  await A.click('#nr-filtro [data-v="conferir"]'); await A.waitForTimeout(200);
  out.c.conferir = await A.evaluate(() => document.querySelectorAll('#nr-tab tbody tr:not(.grupo)').length);
  ok(out.c.conferir === 33, '33 a conferir', out);
  await A.click('#nr-filtro [data-v="aberto"]'); await A.waitForTimeout(150);
  // busca por veículo
  await A.fill('#nr-q', 'Strada'); await A.waitForTimeout(200);
  out.c.buscaStrada = await A.evaluate(() => [...document.querySelectorAll('#nr-tab tbody tr:not(.grupo) td.nome b')].map(b => b.textContent));
  await A.fill('#nr-q', ''); await A.waitForTimeout(150);
  // abrir a nota da Augusta (5.600 com 1.500 abatido)
  const idAug = notas.find(n => n.data.parte === 'Augusta' && n.data.total === 5600).id;
  await A.evaluate(id => window.__api && document.querySelector(`[data-acao="abrir-nota"][data-id="${id}"]`).click(), idAug); await A.waitForTimeout(300);
  out.c.drawerAug = await A.evaluate(() => document.querySelector('#drawer-pn').innerText.replace(/\s+/g, ' ').slice(0, 900));
  ok(/Falta R\$ PTSS,SS/.test(out.c.drawerAug) || /Falta/.test(out.c.drawerAug), 'drawer mostra falta', out);
  await A.screenshot({ path: path.join(SP, 'teste/r3-drawer.png') });
  // abater 1.000 sem caixa (pagamento antigo)
  await A.click('[data-acao="abat-abrir"]'); await A.waitForTimeout(150);
  await A.fill('#ab-valor', '1000'); await A.fill('#ab-data', '2026-11-06');
  await A.click('[data-acao="abat-ok"]'); await A.waitForTimeout(150);
  out.c.erroSemEscolha = await A.evaluate(() => document.querySelector('#ab-erro').textContent);
  ok(/caixa/.test(out.c.erroSemEscolha), 'pede para escolher caixa', out);
  await A.check('input[name="ab-caixa"][value="nao"]'); await A.click('[data-acao="abat-ok"]'); await A.waitForTimeout(400);
  let d = (await db())['receber/' + idAug].data;
  out.c.aug1 = { abatido: d.parcelas[0].abatido, n: d.abatimentos.length, ult: d.abatimentos.at(-1) };
  ok(d.parcelas[0].abatido === 2500 && !d.parcelas[0].pago, 'abatido 2.500 sem quitar', out);
  out.c.caixaDepoisNao = await A.evaluate(() => [...window.__api.S.ledgers.values()].flatMap(L => L.itens).filter(i => i.k === 'caixa').length);
  ok(out.c.caixaDepoisNao === 0, 'pagamento antigo não mexe no caixa', out);
  // abater 600 com caixa (pix hoje)
  await A.click('[data-acao="abat-abrir"]'); await A.fill('#ab-valor', '600'); await A.check('input[name="ab-caixa"][value="sim"]');
  out.c.pgVisivel = await A.evaluate(() => !document.querySelector('#ab-pg-l').hidden);
  await A.selectOption('#ab-pg', 'dinheiro'); await A.click('[data-acao="abat-ok"]'); await A.waitForTimeout(400);
  d = (await db())['receber/' + idAug].data;
  out.c.aug2 = { abatido: d.parcelas[0].abatido, falta: d.total - d.parcelas[0].abatido };
  out.c.caixa = await A.evaluate(() => [...window.__api.S.ledgers.values()].flatMap(L => L.itens).filter(i => i.k === 'caixa').map(i => ({ v: i.valor, c: i.caixa, pg: i.pg, nota: i.nota, desc: i.desc })));
  ok(out.c.caixa.length === 1 && out.c.caixa[0].c === 600 && out.c.caixa[0].pg === 'dinheiro', 'abatimento no caixa', out);
  // valor maior que o saldo
  await A.click('[data-acao="abat-abrir"]'); await A.fill('#ab-valor', '9999'); await A.check('input[name="ab-caixa"][value="nao"]'); await A.click('[data-acao="abat-ok"]'); await A.waitForTimeout(150);
  out.c.erroMaior = await A.evaluate(() => document.querySelector('#ab-erro').textContent);
  ok(/maior/.test(out.c.erroMaior), 'não deixa abater mais que o saldo', out);
  // quitar o resto (2.500) sem caixa -> parcela paga
  await A.fill('#ab-valor', '2500'); await A.click('[data-acao="abat-ok"]'); await A.waitForTimeout(400);
  d = (await db())['receber/' + idAug].data;
  out.c.aug3 = { pago: !!d.parcelas[0].pago, abatido: d.parcelas[0].abatido };
  ok(d.parcelas[0].pago && d.parcelas[0].abatido === 5600, 'quitou por abatimento', out);
  out.c.drawerQuitada = await A.evaluate(() => document.querySelector('#drawer-pn').innerText.replace(/\s+/g, ' ').slice(0, 700));
  await A.screenshot({ path: path.join(SP, 'teste/r4-abatida.png') });
  // desfazer o abatimento com caixa (600): estorna o caixa e volta o saldo
  const abCaixa = d.abatimentos.find(a => a.caixa).id;
  await A.click(`[data-acao="abat-desfazer"][data-ab="${abCaixa}"]`); await A.click(`[data-acao="abat-desfazer"][data-ab="${abCaixa}"]`); await A.waitForTimeout(400);
  d = (await db())['receber/' + idAug].data;
  out.c.aug4 = { pago: !!d.parcelas[0].pago, abatido: d.parcelas[0].abatido, n: d.abatimentos.length };
  ok(!d.parcelas[0].pago && d.parcelas[0].abatido === 5000 && d.abatimentos.length === 3, 'desfez abatimento com caixa', out);
  out.c.estorno = await A.evaluate(() => [...window.__api.S.ledgers.values()].flatMap(L => L.itens).filter(i => i.k === 'estorno').length);
  ok(out.c.estorno === 1, 'estorno do caixa criado', out);
  // receber a parcela pelo botão (resto 600) deve sugerir 600
  await A.click('[data-acao="parc-abrir"]'); await A.waitForTimeout(100);
  out.c.sugestaoReceber = await A.evaluate(() => document.querySelector('[id^="pf-valor-"]').value);
  ok(out.c.sugestaoReceber === '600,00', 'receber sugere o que falta', out);
  // editar nota da Elizabeth: nome e marcar conferida
  const idEli = notas.find(n => n.data.parte === 'Elizabeth').id;
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  await A.evaluate(id => document.querySelector(`[data-acao="abrir-nota"][data-id="${id}"]`).click(), idEli); await A.waitForTimeout(250);
  await A.click('[data-acao="nota-editar"]'); await A.waitForTimeout(200);
  await A.screenshot({ path: path.join(SP, 'teste/r5-editar.png') });
  out.c.avisoConferir = await A.evaluate(() => document.querySelector('#ne-conf')?.innerText.replace(/\s+/g, ' ') || null);
  ok(/Ao salvar, a marca "Conferir" sai/.test(out.c.avisoConferir || ''), 'aviso de que salvar tira a marca', out);
  // sem marcar nada: só editar e salvar já tira a marca
  await A.fill('#ne-parte', 'Elizângela'); await A.fill('#ne-emissao', '2026-04-01'); await A.fill('#ne-total', '300,00');
  await A.click('[data-acao="nota-salvar-edicao"]'); await A.waitForTimeout(400);
  d = (await db())['receber/' + idEli].data;
  out.c.eli = { parte: d.parte, conferir: d.conferir || null, resolvido: d.conferirResolvido || null, total: d.total, toast: await A.evaluate(() => document.querySelector('#toast, .toast')?.textContent || null) };
  ok(d.parte === 'Elizângela' && !d.conferir && d.conferirResolvido?.length && d.conferidaEm, 'edição salva e marca Conferir retirada', out);
  out.c.semPill = await A.evaluate(id => !document.querySelector(`#nr-tab [data-id="${id}"] .pill.red`), idEli);
  ok(out.c.semPill, 'lista sem a marca Conferir', out);
  // abrir Editar e salvar sem mudar nada também tira a marca
  const idSer = notas.find(n => n.data.parte === 'Sérgio (Gol Vermelho)')?.id;
  if (idSer) {
    await A.keyboard.press('Escape'); await A.waitForTimeout(150);
    await A.evaluate(id => document.querySelector(`[data-acao="abrir-nota"][data-id="${id}"]`).click(), idSer); await A.waitForTimeout(250);
    await A.click('[data-acao="nota-editar"]'); await A.waitForTimeout(200);
    await A.click('[data-acao="nota-salvar-edicao"]'); await A.waitForTimeout(400);
    const ds = (await db())['receber/' + idSer].data;
    out.c.sergio = { conferir: ds.conferir || null, parte: ds.parte, total: ds.total };
    ok(!ds.conferir && ds.parte === 'Sérgio (Gol Vermelho)', 'salvar sem mudar nada tira a marca', out);
  }
  // cobrança usa o que falta
  const idEus = notas.find(n => n.data.parte === 'Eustáquio').id;
  await A.keyboard.press('Escape');
  await A.evaluate(id => document.querySelector(`[data-acao="abrir-nota"][data-id="${id}"]`).click(), idEus); await A.waitForTimeout(250);
  out.c.cobranca = await A.evaluate(() => window.__api ? null : null);
  out.c.drawerEus = await A.evaluate(() => document.querySelector('#drawer-pn').innerText.replace(/\s+/g, ' ').slice(0, 700));
  // celular
  const lsCopia = await A.evaluate(() => Object.entries(localStorage));
  const ctxM = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' }); await prep(ctxM, lsCopia);
  const M = await nova(ctxM);
  await M.goto('http://127.0.0.1:8769/#receber'); await M.waitForTimeout(1800);
  out.c.mobileW = await M.evaluate(() => document.documentElement.scrollWidth);
  await M.screenshot({ path: path.join(SP, 'teste/r6-mobile.png') });
  await M.evaluate(id => document.querySelector(`[data-acao="abrir-nota"][data-id="${id}"]`).click(), idAug); await M.waitForTimeout(300);
  await M.click('[data-acao="abat-abrir"]'); await M.waitForTimeout(200);
  out.c.mobileDrawerW = await M.evaluate(() => document.documentElement.scrollWidth);
  await M.screenshot({ path: path.join(SP, 'teste/r7-mobile-abater.png') });
  ok(out.c.mobileW <= 390 && out.c.mobileDrawerW <= 390, 'sem rolagem lateral no celular', out);
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
