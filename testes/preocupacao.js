// Teste: medidor de preocupação em Notas a receber (tempo desde a data da nota, no lugar de "vencida").
// Precisa de nr/notas-todas.json (dados reais dos clientes, fora do repositório).
// Uso: node testes/preocupacao.js <pasta-de-rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const notas = JSON.parse(fs.readFileSync(path.join(SP, 'nr/notas-todas.json'), 'utf8'));
const migr = { 'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'inteiro', ajusteMercado: 30, margem: 30, markupCat: {}, variaveis: [] } } };
for (const n of notas) migr['receber/' + n.id] = { path: 'receber/' + n.id, colecao: 'receber', doc_id: n.id, data: n.data };
// esperado: níveis pelo tempo desde a data da nota (padrão 30 / 90 / 180 / 365 dias)
const hojeK = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const dias = e => Math.round((new Date(hojeK + 'T12:00') - new Date(e + 'T12:00')) / 864e5);
const nivel = d => d <= 30 ? 1 : d <= 90 ? 2 : d <= 180 ? 3 : d <= 365 ? 4 : 5;
const esperado = [0, 0, 0, 0, 0]; for (const n of notas) esperado[nivel(dias(n.data.emissao)) - 1]++;
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8771', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: { esperado } };
  const prep = async ctx => {
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  };
  const nova = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => out.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|404/.test(m.text())) out.errors.push(m.text()); }); return p; };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 }); await prep(ctx);
  const A = await nova(ctx);
  await A.goto('http://127.0.0.1:8771/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);
  await A.evaluate(() => { location.hash = '#receber'; }); await A.waitForTimeout(700);
  const txt = sel => A.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText.replace(/\s+/g, ' ').trim()), sel);
  out.c.cab = await txt('#nr-tab thead th');
  ok(/^data da nota$/i.test(out.c.cab[0]) && /^preocupação$/i.test(out.c.cab[5]), 'cabeçalho da tabela', out);
  out.c.kpis = await txt('#nr-kpis .kpi');
  ok(!out.c.kpis.join(' ').includes('Vencid'), 'sem "vencida" nos totais', out);
  out.c.filtros = await txt('#nr-filtro button');
  ok(!out.c.filtros.includes('Vencidas'), 'sem filtro Vencidas', out);
  out.c.niveis = await txt('#nr-medidor .med-niveis button');
  const qt = out.c.niveis.map(t => Number((t.match(/(\d+) notas?$/) || [])[1]));
  ok(JSON.stringify(qt) === JSON.stringify(esperado), `níveis ${qt} = esperado ${esperado}`, out);
  out.c.pills = await A.evaluate(() => document.querySelectorAll('#nr-tab tbody .pill').length);
  out.c.preoc = await A.evaluate(() => document.querySelectorAll('#nr-tab tbody .preoc').length);
  ok(out.c.preoc === notas.length, 'um medidor por nota em aberto', out);
  out.c.primeiras = await A.evaluate(() => [...document.querySelectorAll('#nr-tab tbody tr')].slice(0, 3).map(r => r.innerText.replace(/\s+/g, ' ')));
  out.c.ultimas = await A.evaluate(() => [...document.querySelectorAll('#nr-tab tbody tr')].slice(-2).map(r => r.innerText.replace(/\s+/g, ' ')));
  out.c.badge = await A.evaluate(() => document.querySelector('#badge-receber').textContent);
  ok(Number(out.c.badge) === esperado[3] + esperado[4], 'contador do menu = muito preocupantes + críticas', out);
  await A.screenshot({ path: path.join(SP, 'teste/p1-receber.png') });
  // clicar no nível "Crítica" filtra; clicar de novo volta
  await A.click('#nr-medidor [data-v="5"]'); await A.waitForTimeout(200);
  out.c.critLinhas = await A.evaluate(() => document.querySelectorAll('#nr-tab tbody tr').length);
  ok(out.c.critLinhas === esperado[4], 'filtro do nível crítico', out);
  out.c.critTodas = await A.evaluate(() => [...document.querySelectorAll('#nr-tab tbody .preoc b')].every(b => b.textContent === 'Crítica'));
  ok(out.c.critTodas, 'só críticas no filtro', out);
  await A.click('#nr-medidor [data-v="5"]'); await A.waitForTimeout(200);
  ok(await A.evaluate(() => document.querySelectorAll('#nr-tab tbody tr').length) === notas.length, 'desfaz o filtro do nível', out);
  // por comprador: cabeçalho do grupo com o medidor da nota mais antiga
  await A.click('#nr-ordem [data-v="parte"]'); await A.waitForTimeout(300);
  out.c.grupoElias = await A.evaluate(() => { const g = [...document.querySelectorAll('#nr-tab tr.grupo')].find(r => r.innerText.startsWith('Elias')); return g && g.innerText.replace(/\s+/g, ' '); });
  ok(/Elias.*Crítica/.test(out.c.grupoElias || ''), 'grupo do Elias mostra Crítica (nota de 2024)', out);
  await A.screenshot({ path: path.join(SP, 'teste/p2-comprador.png') });
  await A.click('#nr-ordem [data-v="data"]'); await A.waitForTimeout(200);
  // ficha da nota: linha Preocupação, parcela "Em aberto", sem "Vencimento"
  const idAly = notas.find(n => n.data.parte === 'Alysson').id;
  await A.evaluate(id => document.querySelector(`[data-acao="abrir-nota"][data-id="${id}"]`).click(), idAly); await A.waitForTimeout(300);
  out.c.ficha = await A.evaluate(() => document.querySelector('#drawer-pn').innerText.replace(/\s+/g, ' ').slice(0, 700));
  ok(/Preocupação Crítica há 1 ano/.test(out.c.ficha), 'ficha mostra o medidor', out);
  ok(!/Vencid|Vencimento/.test(out.c.ficha), 'ficha sem vencimento', out);
  await A.screenshot({ path: path.join(SP, 'teste/p3-ficha.png') });
  // editar: sem campo de vencimento; mudar a data da nota leva a data da parcela junto
  await A.click('[data-acao="nota-editar"]'); await A.waitForTimeout(200);
  out.c.temVenc = await A.evaluate(() => !!document.querySelector('#ne-venc'));
  ok(!out.c.temVenc, 'sem campo de vencimento na edição', out);
  await A.fill('#ne-emissao', '2025-12-10'); await A.click('[data-acao="nota-salvar-edicao"]'); await A.waitForTimeout(400);
  out.c.depois = await A.evaluate(id => { const d = JSON.parse(localStorage.getItem('mock-sb-db')).docs['receber/' + id].data; return { em: d.emissao, venc: d.parcelas[0].venc }; }, idAly);
  ok(out.c.depois.em === '2025-12-10' && out.c.depois.venc === '2025-12-10', 'data da parcela acompanha a data da nota', out);
  await A.click('#drawer-pn .pn-acoes [data-acao="fechar-drawer"]'); await A.waitForTimeout(300);
  // ajustar faixas: 15 / 60 / 120 / 300
  await A.click('[data-acao="med-ajustar"]'); await A.waitForTimeout(200);
  await A.fill('#med-l1', '20'); await A.click('[data-acao="med-salvar"]'); await A.waitForTimeout(200);
  out.c.erroFaixa = await A.evaluate(() => document.querySelector('#med-erro')?.textContent);
  ok(/mais dias/.test(out.c.erroFaixa || ''), 'valida faixas crescentes', out);
  for (const [i, v] of [[0, 15], [1, 60], [2, 120], [3, 300]]) await A.fill('#med-l' + i, String(v));
  await A.screenshot({ path: path.join(SP, 'teste/p4-ajuste.png') });
  await A.click('[data-acao="med-salvar"]'); await A.waitForTimeout(1200);
  out.c.faixas = await txt('#nr-medidor .med-niveis .fx');
  ok(out.c.faixas[0] === 'até 15 dias' && out.c.faixas[4] === 'mais de 300 dias', 'faixas novas aparecem', out);
  out.c.cfg = await A.evaluate(() => JSON.parse(localStorage.getItem('mock-sb-db')).docs['config/geral'].data.preocupacao);
  ok(JSON.stringify(out.c.cfg) === '[15,60,120,300]', 'faixas salvas na config', out);
  // voltar ao padrão
  await A.click('[data-acao="med-ajustar"]'); await A.waitForTimeout(200); await A.click('[data-acao="med-padrao"]'); await A.click('[data-acao="med-salvar"]'); await A.waitForTimeout(1200);
  out.c.cfg2 = await A.evaluate(() => JSON.parse(localStorage.getItem('mock-sb-db')).docs['config/geral'].data.preocupacao ?? null);
  ok(out.c.cfg2 === null, 'padrão remove a faixa salva', out);
  // balanço: contas da semana
  await A.evaluate(() => { location.hash = '#balanco'; }); await A.waitForTimeout(600);
  if (await A.evaluate(() => { const f = document.querySelector('#trava-senha'); return !!(f && f.offsetParent); })) { await A.fill('#trava-senha', 'TREPNIAYKS'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(600); }
  out.c.balanco = await A.evaluate(() => document.querySelector('#b-contas')?.innerText.replace(/\s+/g, ' '));
  ok(/A receber de notas da semana.*A receber preocupante \(notas com mais de 90 dias\)/.test(out.c.balanco || ''), 'balanço usa o medidor', out);
  // notas a pagar continuam com vencimento
  await A.evaluate(() => { location.hash = '#pagar'; }); await A.waitForTimeout(400);
  out.c.pagarCab = await txt('#np-tab thead th'); out.c.pagarFiltros = await txt('#np-filtro button');
  ok(/^vencimento$/i.test(out.c.pagarCab[0]) && out.c.pagarFiltros.includes('Vencidas'), 'a pagar sem mudança', out);
  // celular 390px e tema noturno
  await A.evaluate(() => { location.hash = '#receber'; }); await A.setViewportSize({ width: 390, height: 844 }); await A.waitForTimeout(500);
  out.c.rolaLado = await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!out.c.rolaLado, 'sem rolagem lateral em 390px', out);
  await A.screenshot({ path: path.join(SP, 'teste/p5-celular.png'), fullPage: false });
  await A.evaluate(() => document.documentElement.setAttribute('data-tema', 'escuro')); await A.setViewportSize({ width: 1360, height: 900 }); await A.waitForTimeout(300);
  await A.screenshot({ path: path.join(SP, 'teste/p6-noturno.png') });
  await b.close(); srv.kill();
  fs.writeFileSync(path.join(SP, 'out-preocupacao.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ falhas: out.falhas, errors: out.errors, esperado, niveis: out.c.niveis, kpis: out.c.kpis, badge: out.c.badge, grupoElias: out.c.grupoElias, balanco: out.c.balanco, primeiras: out.c.primeiras, ultimas: out.c.ultimas }, null, 1));
})();
