// Teste (14/11/2026): caixa e faturamento parados a pedido do dono (pagamentos ficam só como controle)
// e desconto dos fornecedores nas notas a pagar (valor da nota, desconto e valor a pagar). Dados fictícios.
// Uso: ./testes/preparar-site.sh <rascunho> && (cd <rascunho> && python3 /caminho/testes/mkprecos3.py) && node testes/caixa-parado.js <rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos3.xlsx.b64'), 'utf8');
const dia = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toLocaleDateString('sv'); };
const HOJE = dia(0), ONTEM = dia(-1), AMANHA = dia(1);
const DESCONTOS = [{ nome: 'Bruno', pct: 25, naNota: true }, { nome: 'Trevo', pct: 30 }, { nome: 'Jolupe', pct: 15 }, { nome: 'Dipeças', pct: 20 }, { nome: 'Multivel', pct: 20 }, { nome: 'Lupeças', pct: 20 }, { nome: 'Mucuri', pct: 20 }];
const migr = {
  'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'centavo', ajusteMercado: 0, margem: 30, markupCat: {}, variaveis: [], caixaParado: true, caixaParadoEm: HOJE, caixaInicio: null, descontosFornecedor: DESCONTOS } },
  'integrantes/i1': { path: 'integrantes/i1', colecao: 'integrantes', doc_id: 'i1', data: { nome: 'Mecânico Teste', ativo: true } },
  ['lancamentos/' + ONTEM + '_teste_1']: { path: 'lancamentos/' + ONTEM + '_teste_1', colecao: 'lancamentos', doc_id: ONTEM + '_teste_1', data: { data: ONTEM, sessao: 'teste', criadoEm: 1, itens: [{ id: 'itOntem1', t: new Date(ONTEM + 'T12:00:00').getTime(), k: 'caixa', tipo: 'receita', desc: 'Receita de teste', cat: 'Outros', valor: 80, caixa: 80, pg: 'pix', u: null }] } },
  'pagar/np-trevo-1': { path: 'pagar/np-trevo-1', colecao: 'pagar', doc_id: 'np-trevo-1', data: { parte: 'Trevo Auto Peças', doc: '', numero: '1', descricao: 'peças', emissao: ONTEM, itens: [], total: 70, desconto: { bruto: 100, valor: 30, pct: 30, origem: 'fornecedor' }, parcelas: [{ n: 1, venc: AMANHA, valor: 70 }], categoria: 'Peças', criadoEm: 1, por: null, movimentou: false, movs: [] } },
  'pagar/np-trevo-2': { path: 'pagar/np-trevo-2', colecao: 'pagar', doc_id: 'np-trevo-2', data: { parte: 'Trevo Auto Peças', doc: '', numero: '2', descricao: 'peças', emissao: ONTEM, itens: [], total: 140, desconto: { bruto: 200, valor: 60, pct: 30, origem: 'fornecedor' }, parcelas: [{ n: 1, venc: AMANHA, valor: 140 }], categoria: 'Peças', criadoEm: 2, por: null, movimentou: false, movs: [] } }
};
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
// telas trancadas mostram os números disfarçados (STREPNIAYK); aqui voltam a ser dígitos só nos valores em R$
const dec = s => String(s || '').replace(/R\$(\s?)([STREPNIAYK][STREPNIAYK.,]*)/g, (m, sp, v) => 'R$' + sp + v.replace(/[STREPNIAYK]/g, c => 'STREPNIAYK'.indexOf(c)));
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8784', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} }; globalThis.__out = out;
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.route(/fonts\./, r => r.abort());
  await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
  await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
  await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
  await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  const A = await ctx.newPage();
  A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) out.errors.push(m.text()); });
  await A.goto('http://127.0.0.1:8784/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000); await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(1200);
  const destravar = async () => { if (await A.evaluate(() => !document.querySelector('[data-view="trava"]').hidden)) { await A.fill('#trava-senha', 'trepniayks'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(400); } };
  const itensCaixa = () => A.evaluate(() => { const S = window.__api.S, l = []; for (const L of S.ledgers.values()) for (const x of L.itens || []) if (x.k === 'caixa') l.push({ id: x.id, valor: x.valor, nota: x.nota || null, pag: x.pag || null }); return l; });

  // 1) regra de desconto pelo nome
  out.c.regra = await A.evaluate(() => { const f = window.__api.descontoDoFornecedor; return ['Trevo Auto Peças', 'Dipeças (Dias Auto Peças Ltda-ME)', 'Bruno Auto Peças', 'Jolupe Auto Peças', 'Mucuri Auto Peças', 'Lupeças Distribuidora', 'Fortbras Autopeças S.A.', 'Trevoso Ltda'].map(n => { const d = f(n); return d ? (d.naNota ? d.pct + 'n' : d.pct) : 0; }); });
  ok(JSON.stringify(out.c.regra) === JSON.stringify([30, 20, '25n', 15, 20, 20, 0, 0]), 'desconto certo para cada fornecedor (palavra inteira)', out);

  // 2) venda com caixa parado: estoque anda, caixa não conta
  await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(300);
  await A.keyboard.press('F4'); await A.waitForTimeout(150);
  await A.click('[data-pg="dinheiro"]'); await A.waitForTimeout(150);
  await A.fill('#scan', 'BA8003'); await A.press('#scan', 'Enter'); await A.waitForTimeout(400);
  out.c.venda = await A.evaluate(() => { const S = window.__api.S; let it = null; for (const L of S.ledgers.values()) for (const x of L.itens || []) if (x.k === 'mov' && (!it || x.t >= it.t)) it = x; return it && { total: it.total, caixa: it.caixa }; });
  ok(out.c.venda && out.c.venda.total === 54.85, 'venda registrada com caixa parado', out);
  out.c.so = await A.evaluate(() => { const a = window.__api, h = new Date().toLocaleDateString('sv'); return { tudo: a.itensPeriodo('2026-01-01', h).length, so: a.soCaixa(a.itensPeriodo('2026-01-01', h)).length }; });
  ok(out.c.so.tudo >= 2 && out.c.so.so === 0, 'caixa parado não conta nada', out);

  // 3) telas Caixa, Faturamento, Balanço com o aviso e zeradas
  await A.evaluate(() => { location.hash = '#caixa'; }); await A.waitForTimeout(400); await destravar();
  out.c.caixa = await A.evaluate(() => ({ aviso: document.querySelector('[data-view="caixa"] .banner.parado')?.innerText.replace(/\s+/g, ' ') || '', kpi: document.querySelector('#c-kpis')?.innerText.replace(/\s+/g, ' '), linhas: document.querySelectorAll('#c-tab tbody tr:not(:has(.vazio-t))').length, botao: !!document.querySelector('[data-acao="caixa-comecar"]') }));
  ok(/Caixa e faturamento parados/.test(out.c.caixa.aviso) && out.c.caixa.botao, 'Caixa mostra o aviso e o botão para começar', out);
  ok(!/54,85|80,00/.test(out.c.caixa.kpi || ''), 'KPIs do caixa sem valores', out);
  await A.screenshot({ path: path.join(SP, 'teste/cp1-caixa.png') });
  // lançamento manual bloqueado
  const antes = (await itensCaixa()).length;
  await A.click('#c-novo'); await A.waitForTimeout(150);
  await A.fill('#l-desc', 'Teste manual'); await A.fill('#l-valor', '10'); await A.click('#c-form button[type=submit]'); await A.waitForTimeout(300);
  out.c.manual = { erro: await A.evaluate(() => document.querySelector('#l-erro').textContent), n: (await itensCaixa()).length };
  ok(/caixa está parado/.test(out.c.manual.erro) && out.c.manual.n === antes, 'lançamento manual bloqueado', out);
  await A.evaluate(() => { location.hash = '#faturamento'; }); await A.waitForTimeout(500); await destravar();
  out.c.fat = await A.evaluate(() => ({ aviso: !!document.querySelector('#f-parado .banner.parado'), kpi: document.querySelector('#f-kpis')?.innerText.replace(/\s+/g, ' ') }));
  ok(out.c.fat.aviso && !/54,85/.test(out.c.fat.kpi || ''), 'Faturamento parado e zerado', out);
  await A.screenshot({ path: path.join(SP, 'teste/cp2-faturamento.png') });
  await A.evaluate(() => { location.hash = '#balanco'; }); await A.waitForTimeout(500); await destravar();
  out.c.bal = await A.evaluate(() => !!document.querySelector('#b-parado .banner.parado'));
  ok(out.c.bal, 'Balanço com o aviso', out);

  // 4) nota nova da Trevo: desconto de 30% sozinho
  await A.evaluate(() => { location.hash = '#pagar'; }); await A.waitForTimeout(400);
  out.c.lista = (await A.evaluate(() => [...document.querySelectorAll('#np-tab tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')))).map(dec);
  ok(out.c.lista.some(t => /70,00/.test(t) && /com 30% de desconto/.test(t)), 'lista mostra o valor a pagar e o desconto', out);
  await A.click('[data-acao="nova-nota"][data-col="pagar"]'); await A.waitForTimeout(400);
  await A.fill('[data-nd="parte"]', 'Trevo Auto Peças'); await A.dispatchEvent('[data-nd="parte"]', 'input'); await A.waitForTimeout(100);
  await A.fill('[data-nd="numero"]', '777');
  await A.fill('#nd-total', '1.000,00'); await A.dispatchEvent('#nd-total', 'input'); await A.waitForTimeout(150);
  out.c.nd = await A.evaluate(() => ({ desc: document.querySelector('#nd-desc').value, parc: document.querySelector('#nd-parc').innerText.replace(/\s+/g, ' ') })); out.c.nd.parc = dec(out.c.nd.parc);
  ok(out.c.nd.desc === '30' && /a pagar R\$\s?700,00/.test(out.c.nd.parc) && /− R\$\s?300,00/.test(out.c.nd.parc), 'formulário mostra 30%, desconto e a pagar', out);
  await A.screenshot({ path: path.join(SP, 'teste/cp3-nova-nota.png') });
  await A.click('[data-acao="nd-salvar"]'); await A.waitForTimeout(500);
  out.c.nova = await A.evaluate(() => { const n = [...window.__api.S.pagar.values()].find(x => x.numero === '777'); return n && { total: n.total, desconto: n.desconto && { bruto: n.desconto.bruto, valor: n.desconto.valor, pct: n.desconto.pct, origem: n.desconto.origem }, parc: n.parcelas.map(p => p.valor) }; });
  ok(out.c.nova && out.c.nova.total === 700 && out.c.nova.desconto && out.c.nova.desconto.bruto === 1000 && out.c.nova.desconto.valor === 300 && out.c.nova.desconto.pct === 30 && out.c.nova.desconto.origem === 'fornecedor' && out.c.nova.parc.join() === '700', 'nota da Trevo salva com o desconto', out);
  // fornecedor sem desconto e desconto mudado à mão (3 parcelas)
  await A.click('[data-acao="nova-nota"][data-col="pagar"]'); await A.waitForTimeout(400);
  await A.fill('[data-nd="parte"]', 'Fortbras Autopeças S.A.'); await A.dispatchEvent('[data-nd="parte"]', 'input');
  await A.fill('[data-nd="numero"]', '888'); await A.fill('#nd-total', '300'); await A.dispatchEvent('#nd-total', 'input'); await A.waitForTimeout(100);
  out.c.semDesc = await A.evaluate(() => document.querySelector('#nd-desc').value);
  await A.click('[data-acao="nd-salvar"]'); await A.waitForTimeout(500);
  await A.click('[data-acao="nova-nota"][data-col="pagar"]'); await A.waitForTimeout(400);
  await A.fill('[data-nd="parte"]', 'Jolupe Auto Peças'); await A.dispatchEvent('[data-nd="parte"]', 'input');
  await A.fill('[data-nd="numero"]', '999'); await A.fill('#nd-total', '100'); await A.dispatchEvent('#nd-total', 'input');
  await A.selectOption('[data-nd="nParc"]', '3'); await A.dispatchEvent('[data-nd="nParc"]', 'input');
  await A.fill('#nd-desc', '10'); await A.dispatchEvent('#nd-desc', 'input'); await A.waitForTimeout(100);
  await A.click('[data-acao="nd-salvar"]'); await A.waitForTimeout(500);
  out.c.outras = await A.evaluate(() => { const S = window.__api.S, f = [...S.pagar.values()].find(x => x.numero === '888'), j = [...S.pagar.values()].find(x => x.numero === '999'); return { f: f && { total: f.total, d: !!f.desconto }, j: j && { total: j.total, pct: j.desconto?.pct, origem: j.desconto?.origem, parc: j.parcelas.map(p => p.valor) } }; });
  ok(out.c.semDesc === '' && out.c.outras.f && out.c.outras.f.total === 300 && !out.c.outras.f.d, 'fornecedor sem desconto fica com o valor cheio', out);
  ok(out.c.outras.j && out.c.outras.j.total === 90 && out.c.outras.j.pct === 10 && out.c.outras.j.origem === 'manual' && Math.round(out.c.outras.j.parc.reduce((s, v) => s + v, 0) * 100) === 9000 && out.c.outras.j.parc.length === 3, 'desconto mudado à mão e dividido em 3 parcelas', out);

  // 5) pagar com caixa parado: só controle, sem lançamento; desfazer
  const cx0 = (await itensCaixa()).length;
  await A.evaluate(() => window.__api.abrirNota('pagar', 'np-trevo-1')); await A.waitForTimeout(300);
  out.c.drawer = dec(await A.evaluate(() => document.querySelector('#drawer-pn .dl')?.innerText.replace(/\s+/g, ' ')));
  ok(/Valor da nota R\$\s?100,00/.test(out.c.drawer || '') && /Desconto do fornecedor \(30%\) − R\$\s?30,00/.test(out.c.drawer || '') && /Valor a pagar R\$\s?70,00/.test(out.c.drawer || ''), 'nota mostra valor da nota, desconto e valor a pagar', out);
  await A.click('[data-acao="parc-abrir"][data-i="0"]'); await A.waitForTimeout(100);
  out.c.avisoPag = await A.evaluate(() => /caixa está parado/.test(document.querySelector('#pf-0')?.innerText || ''));
  await A.click('[data-acao="parc-ok"][data-i="0"]'); await A.waitForTimeout(400);
  out.c.pago = await A.evaluate(() => { const pc = window.__api.S.pagar.get('np-trevo-1').parcelas[0]; return pc.pago && { valor: pc.pago.valor, item: pc.pago.item, fora: pc.pago.foraCaixa }; });
  ok(out.c.avisoPag && out.c.pago && out.c.pago.valor === 70 && out.c.pago.item === null && out.c.pago.fora === true && (await itensCaixa()).length === cx0, 'pagamento anotado sem sair do caixa', out);
  await A.screenshot({ path: path.join(SP, 'teste/cp4-nota-paga.png') });
  await A.click('[data-acao="parc-desfazer"][data-i="0"]'); await A.waitForTimeout(100);
  await A.click('[data-acao="parc-desfazer"][data-i="0"]'); await A.waitForTimeout(400);
  out.c.desfeito = await A.evaluate(() => !window.__api.S.pagar.get('np-trevo-1').parcelas[0].pago);
  ok(out.c.desfeito, 'desfazer o pagamento', out);
  // abatimento marcado "entrou no caixa" com caixa parado
  await A.click('[data-acao="abat-abrir"]'); await A.waitForTimeout(150);
  await A.fill('#ab-valor', '20'); await A.check('input[name="ab-caixa"][value="sim"]'); await A.click('[data-acao="abat-ok"]'); await A.waitForTimeout(400);
  out.c.abat = await A.evaluate(() => { const n = window.__api.S.pagar.get('np-trevo-1'), ab = (n.abatimentos || [])[0]; return ab && { valor: ab.valor, caixa: ab.caixa, item: ab.item, fora: ab.foraCaixa, falta: n.parcelas[0].valor - (n.parcelas[0].abatido || 0) }; });
  ok(out.c.abat && out.c.abat.valor === 20 && out.c.abat.caixa === false && out.c.abat.item === null && out.c.abat.fora === true && out.c.abat.falta === 50 && (await itensCaixa()).length === cx0, 'abatimento só como controle', out);

  // 6) editar a nota: mudar o desconto
  await A.evaluate(() => window.__api.abrirNota('pagar', 'np-trevo-2', null, 'editar')); await A.waitForTimeout(300);
  out.c.edVal = await A.evaluate(() => ({ t: document.querySelector('#ne-total')?.value, d: document.querySelector('#ne-dpct')?.value }));
  await A.fill('#ne-dpct', '25'); await A.click('[data-acao="nota-salvar-edicao"]'); await A.waitForTimeout(400);
  out.c.ed = await A.evaluate(() => { const n = window.__api.S.pagar.get('np-trevo-2'); return { total: n.total, pct: n.desconto?.pct, valor: n.desconto?.valor, origem: n.desconto?.origem, parc: n.parcelas[0].valor }; });
  ok(out.c.edVal.t === '200,00' && out.c.edVal.d === '30', 'edição abre com o valor da nota e o desconto', out);
  ok(out.c.ed.total === 150 && out.c.ed.pct === 25 && out.c.ed.valor === 50 && out.c.ed.parc === 150 && out.c.ed.origem === 'manual', 'edição recalcula o valor a pagar', out);

  // 7) lista de descontos
  await A.click('#drawer-pn .pn-h [data-acao="fechar-drawer"]'); await A.waitForTimeout(200);
  await A.evaluate(() => { location.hash = '#pagar'; }); await A.waitForTimeout(300);
  await A.click('[data-acao="dsc-abrir"]'); await A.waitForTimeout(300);
  out.c.dscN = await A.evaluate(() => document.querySelectorAll('[data-dsc][data-campo="nome"]').length);
  await A.click('[data-acao="dsc-add"]'); await A.waitForTimeout(200);
  await A.fill('[data-dsc="7"][data-campo="nome"]', 'Auto Derval'); await A.dispatchEvent('[data-dsc="7"][data-campo="nome"]', 'input');
  await A.fill('[data-dsc="7"][data-campo="pct"]', '12,5'); await A.dispatchEvent('[data-dsc="7"][data-campo="pct"]', 'input');
  await A.screenshot({ path: path.join(SP, 'teste/cp5-descontos.png') });
  await A.click('[data-acao="dsc-salvar"]'); await A.waitForTimeout(900);
  out.c.dsc = await A.evaluate(() => ({ l: window.__api.S.config.descontosFornecedor, d: window.__api.descontoDoFornecedor('Auto Derval') }));
  ok(out.c.dscN === 7 && out.c.dsc.l.length === 8 && out.c.dsc.d && out.c.dsc.d.pct === 12.5 && out.c.dsc.l[0].naNota === true, 'lista de descontos editada e salva', out);

  // 8) começar o caixa hoje: conta só de hoje em diante
  if (await A.evaluate(() => !document.querySelector('#drawer').hidden)) { await A.click('#drawer-pn .pn-h [data-acao="fechar-drawer"]'); await A.waitForTimeout(200); }
  await A.evaluate(() => { location.hash = '#caixa'; }); await A.waitForTimeout(400); await destravar();
  await A.click('[data-acao="caixa-comecar"]'); await A.waitForTimeout(200);
  await A.click('[data-acao="caixa-comecar-sim"]'); await A.waitForTimeout(900);
  out.c.comecou = await A.evaluate(() => { const a = window.__api, S = a.S, h = new Date().toLocaleDateString('sv'); const l = a.soCaixa(a.itensPeriodo('2026-01-01', h)); return { parado: S.config.caixaParado, ini: S.config.caixaInicio, ids: l.map(x => x.id), ontem: l.some(x => x.id === 'itOntem1'), aviso: !!document.querySelector('[data-view="caixa"] .banner.parado') }; });
  ok(out.c.comecou.parado === false && out.c.comecou.ini === HOJE && !out.c.comecou.ontem && out.c.comecou.ids.length === 0 && !out.c.comecou.aviso, 'caixa começado: não conta nada de antes (nem a venda feita hoje com o caixa parado)', out);
  await A.screenshot({ path: path.join(SP, 'teste/cp6-caixa-comecou.png') });
  // depois de começar, pagar volta a lançar no caixa
  const cx1 = (await itensCaixa()).length;
  await A.evaluate(() => window.__api.abrirNota('pagar', 'np-trevo-2')); await A.waitForTimeout(300);
  await A.click('[data-acao="parc-abrir"][data-i="0"]'); await A.click('[data-acao="parc-ok"][data-i="0"]'); await A.waitForTimeout(400);
  out.c.depois = await A.evaluate(() => { const a = window.__api, h = new Date().toLocaleDateString('sv'); return a.soCaixa(a.itensPeriodo('2026-01-01', h)).map(x => ({ valor: x.valor, caixa: x.caixa })); });
  ok((await itensCaixa()).length === cx1 + 1 && out.c.depois.length === 1 && out.c.depois[0].caixa === -150, 'com o caixa começado, o pagamento sai do caixa e conta', out);

  // 9) celular
  const M = await ctx.newPage(); await M.setViewportSize({ width: 390, height: 844 }); M.on('pageerror', e => out.errors.push(e.message));
  await M.goto('http://127.0.0.1:8784/#pagar'); await M.waitForTimeout(2000);
  out.c.cel = await M.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok(!out.c.cel, 'celular sem rolagem lateral', out);
  ok(!out.errors.length, 'sem erros no console', out);
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
  process.exit(out.falhas.length ? 1 : 0);
})().catch(e => { console.error(e); console.log(JSON.stringify(globalThis.__out, null, 1)); process.exit(2); });
