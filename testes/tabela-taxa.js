// Teste (13/11/2026): Tabela de preços como cadastro principal (colunas Tipo e Código de identificação),
// código de barras na lista de produtos, busca pelo código do fabricante e taxa da maquininha
// descontada do caixa nas vendas no cartão. Dados fictícios.
// Uso: ./testes/preparar-site.sh <rascunho> && (cd <rascunho> && python3 /caminho/testes/mkprecos3.py) && node testes/tabela-taxa.js <rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos3.xlsx.b64'), 'utf8');
const migr = {
  'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'centavo', ajusteMercado: 0, margem: 30, markupCat: {}, variaveis: [] } },
  'servicos/s1': { path: 'servicos/s1', colecao: 'servicos', doc_id: 's1', data: { ativo: true, cod: 'S01', nome: 'Serviço Teste', preco: 100 } },
  'integrantes/i1': { path: 'integrantes/i1', colecao: 'integrantes', doc_id: 'i1', data: { nome: 'Mecânico Teste', ativo: true } }
};
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
const r2 = v => Math.round(v * 100) / 100;
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8783', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} }; globalThis.__out = out;
  const prep = async ctx => {
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await prep(ctx);
  const A = await ctx.newPage();
  A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) out.errors.push(m.text()); });
  await A.goto('http://127.0.0.1:8783/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);

  // 1) planilha: Tabela como principal, markup em F3, taxas da maquininha da aba Custos Fixos
  out.c.meta = await A.evaluate(() => { const S = window.__api.S, m = S.planilha.meta; const ach = n => [...S.produtos.values()].find(p => p.nome.startsWith(n) || (p.nome + ' ' + p.modelo).includes(n));
    const mec = [...S.produtos.values()].find(p => /MEC[AÂ]NICA UNO/.test(p.nome)), novo = [...S.produtos.values()].find(p => /TESTE NOVO/.test(p.nome));
    return { aba: m.abaPrecos, markupMes: m.markupMes, taxas: m.taxasCartao, total: S.produtos.size, mec: mec && { tipo: mec.tipo, codId: mec.codId, ean: mec.eanPl, preco: mec.preco }, novo: novo && { tipo: novo.tipo, codId: novo.codId, preco: novo.preco },
      idx8003: S.indice.get('BA8003') === mec?.k && S.indice.get('BA-8003') === mec?.k, idxPneu: S.indice.has('205/65R16') }; });
  const m = out.c.meta;
  ok(m.aba === 'Tabela de preços', 'aba de preços lida', out);
  ok(m.markupMes === 1.43, 'markup do mês lido em F3', out);
  ok(m.taxas && m.taxas.credito === 4.1 && m.taxas.debito === 2.5, 'taxas da maquininha lidas da aba Custos Fixos', out);
  ok(m.mec && m.mec.tipo === 'Peça' && m.mec.codId === 'BA-8003' && m.mec.ean === '7898435680699' && m.mec.preco === 54.85, 'tipo, código e código de barras do produto vindos da Tabela', out);
  ok(m.novo && m.novo.tipo === 'Pneu' && m.novo.codId === '205/65R16' && m.novo.preco === 429, 'produto só da Tabela entra no sistema', out);
  ok(m.idx8003, 'código do fabricante acha o produto (com e sem hífen)', out);
  ok(!m.idxPneu, 'medida de pneu não vira código de leitura', out);

  // 2) lista de produtos: coluna Código de barras e linha com tipo + código
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(300);
  await A.fill('#p-q', 'ba8003'); await A.dispatchEvent('#p-q', 'input'); await A.waitForTimeout(300);
  out.c.lista = await A.evaluate(() => ({ th: document.querySelectorAll('#p-tab thead th')[1].textContent, n: document.querySelectorAll('#p-tab tbody tr.click').length, cod: document.querySelector('#p-tab tbody tr td:nth-child(2)')?.innerText, sub: document.querySelector('#p-tab tbody tr .sub')?.innerText }));
  ok(out.c.lista.th === 'Código de barras', 'cabeçalho Código de barras', out);
  ok(out.c.lista.n === 1 && out.c.lista.cod === '7898435680699', 'lista mostra o código de barras da planilha', out);
  ok(/^Peça · BA-8003/.test(out.c.lista.sub || ''), 'lista mostra tipo e código de identificação', out);
  await A.fill('#p-q', '205/65r16'); await A.dispatchEvent('#p-q', 'input'); await A.waitForTimeout(300);
  out.c.pneu = await A.evaluate(() => [...document.querySelectorAll('#p-tab tbody tr.click')].map(r => r.innerText.replace(/\s+/g, ' ')));
  ok(out.c.pneu.some(t => /TESTE NOVO/.test(t) && /Pneu · 205\/65R16/.test(t)), 'busca pela medida acha o pneu novo', out);
  await A.screenshot({ path: path.join(SP, 'teste/tt1-produtos.png') });

  // 3) vendas no cartão: o caixa recebe o valor menos a taxa
  await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(300);
  await A.keyboard.press('F4'); await A.waitForTimeout(150);
  const scan = async v => { await A.fill('#scan', v); await A.press('#scan', 'Enter'); await A.waitForTimeout(350); };
  const ultimo = () => A.evaluate(() => { const S = window.__api.S; let it = null; for (const L of S.ledgers.values()) for (const x of L.itens || []) if (!it || x.t >= it.t) it = x; return it && { nome: it.nome, total: it.total, caixa: it.caixa, taxa: it.taxa ?? null, taxaPct: it.taxaPct ?? null, pg: it.pg }; });
  await A.click('[data-pg="credito"]'); await A.waitForTimeout(150);
  await scan('BA8003');
  out.c.credito = await ultimo();
  out.c.creditoTela = await A.evaluate(() => document.querySelector('#ultimo .u-meta')?.innerText.replace(/\s+/g, ' '));
  ok(out.c.credito && /MEC[AÂ]NICA/.test(out.c.credito.nome) && out.c.credito.total === 54.85, 'digitar BA8003 vende a articulação mecânica', out);
  ok(out.c.credito && out.c.credito.taxa === r2(54.85 * 0.041) && out.c.credito.caixa === r2(54.85 - r2(54.85 * 0.041)) && out.c.credito.taxaPct === 4.1, 'crédito: caixa = venda − 4,1%', out);
  ok(/taxa da maquininha 4,1%/.test(out.c.creditoTela || ''), 'tela mostra a taxa descontada', out);
  await A.click('[data-pg="debito"]'); await A.waitForTimeout(150);
  await scan('7898435680699');
  out.c.debito = await ultimo();
  ok(out.c.debito && out.c.debito.taxa === r2(54.85 * 0.025) && out.c.debito.caixa === r2(54.85 - r2(54.85 * 0.025)), 'débito: caixa = venda − 2,5%', out);
  await A.click('[data-pg="dinheiro"]'); await A.waitForTimeout(150);
  await scan('BA-8003');
  out.c.dinheiro = await ultimo();
  ok(out.c.dinheiro && out.c.dinheiro.caixa === 54.85 && out.c.dinheiro.taxa == null, 'dinheiro: entra o valor cheio', out);
  // serviço no crédito também desconta
  await A.click('[data-pg="credito"]'); await A.waitForTimeout(150);
  await scan('S01'); await A.waitForTimeout(200);
  if (await A.$('.pede-quem .btn')) { await A.click('.pede-quem .btn'); await A.waitForTimeout(300); }
  out.c.servico = await ultimo();
  ok(out.c.servico && out.c.servico.total === 100 && out.c.servico.caixa === 95.9 && out.c.servico.taxa === 4.1, 'serviço no crédito: entra 95,90 de 100,00', out);
  await A.screenshot({ path: path.join(SP, 'teste/tt2-registrar.png') });

  // 4) taxa própria do sistema vence a da planilha
  await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(400);
  if (await A.$('#trava-senha')) { const trav = await A.evaluate(() => !document.querySelector('[data-view="trava"]').hidden); if (trav) { await A.fill('#trava-senha', 'trepniayks'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(400); } }
  out.c.cfgTexto = await A.evaluate(() => document.querySelector('#taxas-cartao')?.nextElementSibling?.innerText || '');
  ok(/débito 2,5%, crédito 4,1%/.test(out.c.cfgTexto), 'Configurações mostram as taxas da planilha', out);
  await A.fill('[data-cfg="taxaCredito"]', '3'); await A.dispatchEvent('[data-cfg="taxaCredito"]', 'input'); await A.dispatchEvent('[data-cfg="taxaCredito"]', 'change'); await A.waitForTimeout(800);
  out.c.cfg = await A.evaluate(() => window.__api.S.config.taxaCredito);
  ok(out.c.cfg === 3, 'taxa de crédito própria salva', out);
  await A.screenshot({ path: path.join(SP, 'teste/tt3-config.png') });
  await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(300);
  await A.click('[data-pg="credito"]'); await A.waitForTimeout(150);
  await scan('BA8003');
  out.c.credito3 = await ultimo();
  ok(out.c.credito3 && out.c.credito3.taxaPct === 3 && out.c.credito3.caixa === r2(54.85 - r2(54.85 * 0.03)), 'crédito com a taxa própria (3%)', out);

  // 5) caixa e faturamento mostram as taxas
  await A.evaluate(() => { location.hash = '#caixa'; }); await A.waitForTimeout(400);
  if (await A.evaluate(() => !document.querySelector('[data-view="trava"]').hidden)) { await A.fill('#trava-senha', 'trepniayks'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(400); }
  out.c.caixa = await A.evaluate(() => ({ kpi: document.querySelector('#c-kpis .kpi')?.innerText.replace(/\s+/g, ' '), linhaTaxa: [...document.querySelectorAll('#c-tab tbody tr')].some(r => /taxa R\$/.test(r.innerText)) }));
  const taxasTot = r2(r2(54.85 * 0.041) + r2(54.85 * 0.025) + 4.1 + r2(54.85 * 0.03));
  ok(new RegExp('já sem as taxas da maquininha \\(R\\$\\s?' + taxasTot.toFixed(2).replace('.', ',') + '\\)').test(out.c.caixa.kpi || ''), 'KPI do caixa mostra o total das taxas', out);
  ok(out.c.caixa.linhaTaxa, 'linha do caixa mostra a taxa', out);
  await A.evaluate(() => { location.hash = '#faturamento'; }); await A.waitForTimeout(500);
  out.c.dre = await A.evaluate(() => document.querySelector('#f-dre')?.innerText.replace(/\s+/g, ' '));
  ok(/Taxas da maquininha/.test(out.c.dre || ''), 'resultado do mês desconta as taxas', out);
  await A.screenshot({ path: path.join(SP, 'teste/tt4-faturamento.png'), fullPage: true });

  // 6) celular
  const ctxM = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' }); await prep(ctxM);
  const lsCopia = await A.evaluate(() => Object.entries(localStorage));
  await ctxM.addInitScript(l => { if (!sessionStorage.getItem('copiado')) { for (const [k, v] of l) localStorage.setItem(k, v); sessionStorage.setItem('copiado', '1'); } }, lsCopia);
  const M = await ctxM.newPage(); M.on('pageerror', e => out.errors.push(e.message));
  await M.goto('http://127.0.0.1:8783/#produtos'); await M.waitForTimeout(2000);
  out.c.cel = await M.evaluate(() => ({ rola: document.documentElement.scrollWidth > innerWidth }));
  ok(!out.c.cel.rola, 'celular sem rolagem lateral', out);
  await M.screenshot({ path: path.join(SP, 'teste/tt5-celular.png') });
  ok(!out.errors.length, 'sem erros no console', out);
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
  process.exit(out.falhas.length ? 1 : 0);
})().catch(e => { console.error(e); console.log(JSON.stringify(globalThis.__out, null, 1)); process.exit(2); });
