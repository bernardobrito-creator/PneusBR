// Teste (12/11/2026): aviso de notas a pagar no canto superior direito (todas as telas, minimiza numa bolinha e abre
// sozinho de novo), filtro por fornecedor, código de barras do papel e boleto de cada parcela, leitor abrindo a nota já lançada.
// Dados fictícios (nada de clientes ou fornecedores reais).
// Uso: ./testes/preparar-site.sh <rascunho> && node testes/aviso-notas.js <rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const pad = n => String(n).padStart(2, '0');
const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = dk(new Date());
const addDias = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dk(new Date(y, m - 1, d + n)); };
const doc = (col, id, data) => ({ [col + '/' + id]: { path: col + '/' + id, colecao: col, doc_id: id, data } });
const base = { itens: [], criadoEm: 1, por: null, movimentou: false, movs: [], obs: '', combinado: '' };
// boletos fictícios com dígitos válidos (banco 246)
const BOL = [
  { codigo: '24695168700000100000011710503275709903200990', linha: '24690.01172 10503.275702 99032.009906 5 16870000010000' },
  { codigo: '24691171800000100000011710503275709903200991', linha: '24690.01172 10503.275702 99032.009914 1 17180000010000' },
  { codigo: '24691174600000100000011710503275709903200992', linha: '24690.01172 10503.275702 99032.009922 1 17460000010000' }
].map(b => ({ tipo: 'boleto', banco: '246', bancoNome: 'ABC Brasil', valor: 100, venc: null, valido: true, ...b }));
const migr = {
  ...doc('config', 'geral', { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'inteiro', ajusteMercado: 30, margem: 30, markupCat: {}, variaveis: [] }),
  // vence hoje, com código de barras do papel
  ...doc('pagar', 'np-a1', { ...base, parte: 'Fornecedor Alfa', numero: '9991', codBarras: '00000009991', descricao: 'Peça de teste', emissao: addDias(hoje, -30), total: 150, parcelas: [{ n: 1, venc: hoje, valor: 150 }],
    infos: [{ r: 'Vendedor', v: 'Fulano de Teste' }, { r: 'Condição no papel', v: 'À vista' }], itens: [{ nome: 'PECA TESTE', mod: 'cód. 0001', cod: '0001', qtd: 2, vu: 75 }] }),
  ...doc('pagar', 'np-a2', { ...base, parte: 'Fornecedor Alfa', numero: '9992', codBarras: '00000009992', descricao: 'Outra peça', emissao: addDias(hoje, -10), total: 80, parcelas: [{ n: 1, venc: addDias(hoje, 20), valor: 80 }] }),
  // atrasada 3 dias, com desconto
  ...doc('pagar', 'np-b1', { ...base, parte: 'Fornecedor Beta', doc: '11222333000181', numero: '22.533', descricao: 'Requisição de teste', emissao: addDias(hoje, -33), total: 75,
    desconto: { bruto: 100, valor: 25, pct: 25 }, itens: [{ nome: 'ITEM BETA', mod: 'cód. 00253', cod: '00253', qtd: 1, vu: 100 }], parcelas: [{ n: 1, venc: addDias(hoje, -3), valor: 75 }] }),
  // 3 parcelas, cada uma com o seu boleto
  ...doc('pagar', 'np-c1', { ...base, parte: 'Fornecedor Gama', doc: '11222333000181', numero: '777', descricao: 'Compra em 3 boletos', emissao: addDias(hoje, -2), total: 300,
    parcelas: BOL.map((b, i) => ({ n: i + 1, venc: addDias(hoje, 25 + 30 * i), valor: 100, boleto: b })) }),
  // já paga (não entra no aviso)
  ...doc('pagar', 'np-d1', { ...base, parte: 'Fornecedor Delta', numero: '55', descricao: 'Paga', emissao: addDias(hoje, -40), total: 50, parcelas: [{ n: 1, venc: addDias(hoje, -1), valor: 50, pago: { data: addDias(hoje, -1), pg: 'pix', valor: 50 } }] })
};
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8779', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} }; globalThis.__out = out;
  const prep = async ctx => {
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    await ctx.addInitScript(([x, m]) => {
      window.__xlsxB64 = x;
      if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} }));
      window.__pbrTeste = api => { window.__api = api; };
    }, [xlsx, migr]);
  };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await prep(ctx);
  const A = await ctx.newPage();
  A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|404/.test(m.text())) out.errors.push(m.text()); });
  const txt = sel => A.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText.replace(/\s+/g, ' ').trim()), sel);
  const aviso = () => A.evaluate(() => { const el = document.querySelector('#aviso'); return { visivel: !!el && !el.hidden, aberto: !!el?.querySelector('.aviso-card'), bola: !!el?.querySelector('.aviso-bola'), num: el?.querySelector('.aviso-bola b')?.textContent || '', itens: [...(el?.querySelectorAll('.aviso-l button') || [])].map(x => x.innerText.replace(/\s+/g, ' ').trim()), texto: el?.innerText.replace(/\s+/g, ' ') || '' }; });
  const ir = async h => { await A.evaluate(x => { location.hash = x; }, h); await A.waitForTimeout(350); };
  await A.goto('http://127.0.0.1:8779/'); await A.waitForTimeout(700);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);

  /* ---------- 1) aviso aberto na entrada, em todas as telas ---------- */
  out.c.entrada = await aviso();
  ok(out.c.entrada.visivel && out.c.entrada.aberto, 'aviso aparece aberto na entrada', out);
  ok(out.c.entrada.itens.length === 2, 'aviso lista 2 parcelas (hoje + atrasada)', out);
  ok(/Vencem hoje/i.test(out.c.entrada.texto) && /Atrasadas/i.test(out.c.entrada.texto), 'aviso separa vencem hoje e atrasadas', out);
  ok(out.c.entrada.itens.some(t => /Fornecedor Alfa/.test(t) && /vence hoje/.test(t)), 'Alfa aparece como vence hoje', out);
  ok(out.c.entrada.itens.some(t => /Fornecedor Beta/.test(t) && /3 dias de atraso/.test(t)), 'Beta aparece com 3 dias de atraso', out);
  ok(!/Delta|Gama/.test(out.c.entrada.texto), 'paga e a vencer não entram no aviso', out);
  await A.screenshot({ path: path.join(SP, 'teste/av1-aberto.png') });
  for (const h of ['#produtos', '#servicos', '#movimentacoes', '#receber', '#retornos', '#pagar']) {
    await ir(h); const a = await aviso(); out.c['tela' + h] = a.visivel && a.aberto;
    ok(a.visivel && a.aberto, 'aviso continua na tela ' + h, out);
  }
  /* ---------- 2) minimizar: bolinha no canto, sem cobrir o status ---------- */
  await ir('#registrar');
  await A.click('#aviso [data-acao="aviso-min"]'); await A.waitForTimeout(250);
  out.c.min = await aviso();
  ok(out.c.min.bola && !out.c.min.aberto && out.c.min.num === '2', 'minimiza numa bolinha com o número 2', out);
  out.c.geo = await A.evaluate(() => { const r = e => e.getBoundingClientRect(); const bo = r(document.querySelector('.aviso-bola')), st = r(document.querySelector('.topo .status')); return { bola: [bo.left, bo.top, bo.right, bo.bottom], status: [st.left, st.top, st.right, st.bottom], vw: innerWidth, cobre: !(bo.right <= st.left || bo.left >= st.right || bo.bottom <= st.top || bo.top >= st.bottom) }; });
  ok(!out.c.geo.cobre, 'bolinha não cobre o status do topo', out);
  ok(out.c.geo.bola[2] > out.c.geo.vw - 60 && out.c.geo.bola[1] < 60, 'bolinha fica no canto superior direito', out);
  await A.screenshot({ path: path.join(SP, 'teste/av2-bolinha.png') });
  // continua minimizado ao recarregar no mesmo dia
  await A.reload(); await A.waitForTimeout(2500);
  out.c.recarga = await aviso();
  ok(out.c.recarga.bola && !out.c.recarga.aberto, 'continua minimizado ao recarregar no mesmo dia', out);
  // dia seguinte (a chave guardada é de outro dia): abre sozinho
  await A.evaluate(() => { const k = JSON.parse(localStorage.getItem('pbr.aviso-min')); localStorage.setItem('pbr.aviso-min', JSON.stringify(k.replace(/^\d{4}-\d{2}-\d{2}/, '2000-01-01'))); });
  await A.reload(); await A.waitForTimeout(2500);
  out.c.outroDia = await aviso();
  ok(out.c.outroDia.aberto, 'no dia seguinte o aviso abre sozinho', out);
  // minimiza e entra nota nova vencendo hoje: abre sozinho
  await A.click('#aviso [data-acao="aviso-min"]'); await A.waitForTimeout(200);
  await A.evaluate(h => { const api = window.__api; api.S.pagar.set('np-e1', { parte: 'Fornecedor Épsilon', numero: '1', descricao: '', emissao: h, itens: [], total: 40, parcelas: [{ n: 1, venc: h, valor: 40 }], criadoEm: 2, movs: [] }); api.render(); }, hoje);
  await A.waitForTimeout(250);
  out.c.notaNova = await aviso();
  ok(out.c.notaNova.aberto && out.c.notaNova.itens.length === 3, 'nota nova vencendo hoje abre o aviso de novo', out);
  // a nota nova sai do aviso: volta ao que já estava minimizado (bolinha)
  await A.evaluate(() => { window.__api.S.pagar.delete('np-e1'); window.__api.render(); }); await A.waitForTimeout(200);
  out.c.voltaMin = await aviso();
  ok(out.c.voltaMin.bola, 'sem a nota nova, volta à bolinha que já estava minimizada', out);
  // clicar na bolinha abre; Esc minimiza de novo
  await A.click('#aviso .aviso-bola'); await A.waitForTimeout(150);
  await A.evaluate(() => document.activeElement?.blur()); await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  out.c.esc = await aviso();
  ok(out.c.esc.bola, 'Esc minimiza o aviso', out);
  await A.click('#aviso .aviso-bola'); await A.waitForTimeout(150);
  ok((await aviso()).aberto, 'clicar na bolinha abre o aviso', out);
  /* ---------- 3) clicar numa nota do aviso abre a nota em Notas a pagar ---------- */
  await ir('#produtos');
  await A.click('#aviso .aviso-l button >> text=Fornecedor Beta'); await A.waitForTimeout(500);
  out.c.cliqueNota = await A.evaluate(() => ({ tab: location.hash, titulo: document.querySelector('#drawer:not([hidden]) .pn-h h2')?.textContent, texto: document.querySelector('#drawer:not([hidden])')?.innerText.replace(/\s+/g, ' ') }));
  ok(out.c.cliqueNota.tab === '#pagar' && out.c.cliqueNota.titulo === 'Fornecedor Beta', 'clicar no aviso abre a nota em Notas a pagar', out);
  ok(/Valor dos itens/.test(out.c.cliqueNota.texto || '') && /Desconto/.test(out.c.cliqueNota.texto || '') && /25%/.test(out.c.cliqueNota.texto || ''), 'nota mostra valor dos itens e desconto', out);
  ok(/Emissão/.test(out.c.cliqueNota.texto || ''), 'nota mostra a emissão', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);
  /* ---------- 4) detalhes: código de barras do papel, infos e boleto de cada parcela ---------- */
  await A.evaluate(() => window.__api.abrirNota('pagar', 'np-a1')); await A.waitForTimeout(300);
  out.c.notaA = await txt('#drawer:not([hidden])');
  ok(/Código de barras da nota/.test(out.c.notaA[0] || '') && /00000009991/.test(out.c.notaA[0] || ''), 'nota mostra o código de barras do papel', out);
  ok(/Vendedor/.test(out.c.notaA[0] || '') && /Fulano de Teste/.test(out.c.notaA[0] || ''), 'nota mostra as informações do papel', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  await A.evaluate(() => window.__api.abrirNota('pagar', 'np-c1')); await A.waitForTimeout(300);
  out.c.notaC = await A.evaluate(() => [...document.querySelectorAll('#drawer .parc-bol')].map(r => r.innerText.replace(/\s+/g, ' ')));
  ok(out.c.notaC.length === 3 && /parcela 2/.test(out.c.notaC[1]) && /99032\.009914/.test(out.c.notaC[1]), 'cada parcela mostra o seu boleto', out);
  await A.screenshot({ path: path.join(SP, 'teste/av3-boletos.png') });
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  /* ---------- 5) filtro por fornecedor e busca por código ---------- */
  await ir('#pagar');
  await A.click('[data-acao="nf"][data-v="todas"]'); await A.waitForTimeout(150);
  out.c.opcoes = await A.evaluate(() => [...document.querySelectorAll('#np-forn option')].map(o => o.textContent));
  ok(out.c.opcoes.length === 5 && /Todos os fornecedores \(4\)/.test(out.c.opcoes[0]), 'filtro lista os 4 fornecedores', out);
  ok(out.c.opcoes.some(o => /Fornecedor Alfa · 2 notas/.test(o)), 'filtro mostra quantas notas cada fornecedor tem', out);
  await A.selectOption('#np-forn', { label: out.c.opcoes.find(o => /Alfa/.test(o)) }); await A.waitForTimeout(200);
  out.c.soAlfa = await txt('#np-tab tbody tr');
  ok(out.c.soAlfa.length === 2 && out.c.soAlfa.every(t => /Fornecedor Alfa/.test(t)), 'filtro mostra só o fornecedor escolhido', out);
  out.c.kpiAlfa = (await txt('#np-kpis .kpi'))[0];
  await A.screenshot({ path: path.join(SP, 'teste/av6-filtro.png') });
  ok(/2 parcela/.test(out.c.kpiAlfa || ''), 'os números do topo seguem o fornecedor escolhido', out);
  await A.selectOption('#np-forn', ''); await A.waitForTimeout(150);
  out.c.todas = (await txt('#np-tab tbody tr')).length;
  ok(out.c.todas === 6, 'sem filtro volta a mostrar todas as parcelas (a nota paga fica no Arquivo)', out);
  await A.fill('#np-q', '22533'); await A.waitForTimeout(200);
  out.c.busca1 = await txt('#np-tab tbody tr');
  ok(out.c.busca1.length === 1 && /Beta/.test(out.c.busca1[0]), 'busca 22533 acha a nota 22.533', out);
  await A.fill('#np-q', '9992'); await A.waitForTimeout(200);
  out.c.busca2 = await txt('#np-tab tbody tr');
  ok(out.c.busca2.length === 1 && /9992/.test(out.c.busca2[0]), 'busca pelo código de barras do papel', out);
  await A.fill('#np-q', '99032.009922'); await A.waitForTimeout(200);
  out.c.busca3 = await txt('#np-tab tbody tr');
  ok(out.c.busca3.length === 3 && out.c.busca3.every(t => /Gama/.test(t)), 'busca por trecho do boleto de uma parcela', out);
  await A.fill('#np-q', ''); await A.waitForTimeout(150);
  /* ---------- 6) leitor: código de uma nota já lançada abre a nota ---------- */
  const bipar = async code => { await A.evaluate(() => document.activeElement?.blur()); await A.keyboard.type(code, { delay: 8 }); await A.keyboard.press('Enter'); await A.waitForTimeout(500); };
  const tituloDrawer = () => A.evaluate(() => document.querySelector('#drawer:not([hidden]) .pn-h h2')?.textContent || null);
  await bipar('00000009992'); out.c.lerPapel = await tituloDrawer();
  ok(out.c.lerPapel === 'Fornecedor Alfa', 'em Notas a pagar, ler o código do papel abre a nota', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  await bipar('9991'); out.c.lerSemZero = await tituloDrawer();
  ok(out.c.lerSemZero === 'Fornecedor Alfa', 'código sem os zeros da frente também acha a nota', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  await bipar(BOL[1].codigo); out.c.lerBoleto = await tituloDrawer();
  ok(out.c.lerBoleto === 'Fornecedor Gama', 'ler o boleto de uma parcela abre a nota', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  await bipar('123456789012'); out.c.lerNovo = await A.evaluate(() => !!window.__api.S.nd);
  ok(out.c.lerNovo, 'código desconhecido continua abrindo nota nova', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  await ir('#registrar');
  await A.fill('#scan', '00000009991'); await A.press('#scan', 'Enter'); await A.waitForTimeout(600);
  out.c.lerRegistrar = { tab: await A.evaluate(() => location.hash), titulo: await tituloDrawer() };
  ok(out.c.lerRegistrar.tab === '#pagar' && out.c.lerRegistrar.titulo === 'Fornecedor Alfa', 'no Registrar, código de nota lançada abre a nota', out);
  /* ---------- 7) editar o código de barras ---------- */
  await A.click('#drawer [data-acao="nota-editar"]'); await A.waitForTimeout(200);
  await A.fill('#ne-cb', '00000009999'); await A.click('#drawer [data-acao="nota-salvar-edicao"]'); await A.waitForTimeout(400);
  out.c.cbSalvo = await A.evaluate(() => JSON.parse(localStorage.getItem('mock-sb-db')).docs['pagar/np-a1'].data.codBarras);
  ok(out.c.cbSalvo === '00000009999', 'editar salva o código de barras do papel', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  /* ---------- 8) pagar as parcelas do aviso: ele some ---------- */
  for (const id of ['np-a1', 'np-b1']) {
    await A.evaluate(i => window.__api.abrirNota('pagar', i), id); await A.waitForTimeout(250);
    await A.click('#drawer [data-acao="parc-abrir"]'); await A.waitForTimeout(150);
    await A.click('#drawer [data-acao="parc-ok"]'); await A.waitForTimeout(400);
    await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  }
  out.c.depois = await aviso();
  ok(!out.c.depois.visivel, 'depois de pagar, o aviso some', out);
  out.c.semMargem = await A.evaluate(() => !document.body.classList.contains('tem-aviso'));
  ok(out.c.semMargem, 'sem aviso, o topo volta ao normal', out);
  /* ---------- 9) celular: aviso cabe na tela, sem rolagem lateral ---------- */
  const M = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })).newPage();
  await prep(M.context());
  M.on('pageerror', e => out.errors.push('celular: ' + e.message));
  await M.goto('http://127.0.0.1:8779/'); await M.waitForTimeout(700);
  await M.fill('#lc-nome', 'Bernardo'); await M.fill('#lc-email', 'loja@pneusbr.com'); await M.fill('#lc-senha', 'senha-forte-1'); await M.fill('#lc-senha2', 'senha-forte-1');
  await M.click('#f-criar button[type=submit]'); await M.waitForTimeout(3000);
  out.c.cel = await M.evaluate(() => { const c = document.querySelector('.aviso-card')?.getBoundingClientRect(); return { card: c && [Math.round(c.left), Math.round(c.right)], vw: innerWidth, rolaLado: document.documentElement.scrollWidth > innerWidth }; });
  ok(out.c.cel.card && out.c.cel.card[0] >= 0 && out.c.cel.card[1] <= out.c.cel.vw, 'no celular o aviso cabe na tela', out);
  ok(!out.c.cel.rolaLado, 'no celular não há rolagem lateral', out);
  await M.screenshot({ path: path.join(SP, 'teste/av4-celular.png') });
  await M.click('#aviso [data-acao="aviso-min"]'); await M.waitForTimeout(200);
  await M.screenshot({ path: path.join(SP, 'teste/av5-celular-bolinha.png') });
  out.c.celGeo = await M.evaluate(() => { const r = e => e.getBoundingClientRect(); const bo = r(document.querySelector('.aviso-bola')), st = r(document.querySelector('.topo .status')); return !(bo.right <= st.left || bo.left >= st.right || bo.bottom <= st.top || bo.top >= st.bottom); });
  ok(!out.c.celGeo, 'no celular a bolinha não cobre o status', out);
  ok(!out.errors.length, 'sem erros no console', out);
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
  process.exit(out.falhas.length ? 1 : 0);
})().catch(e => { console.error(e); console.log(JSON.stringify(globalThis.__out, null, 1)); process.exit(2); });
