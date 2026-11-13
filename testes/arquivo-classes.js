// Teste (13/11/2026): Arquivo das notas pagas, classes das notas a pagar (com compras online separadas por site)
// e clientes com retorno pendente no aviso (em azul). Dados fictícios.
// Uso: ./testes/preparar-site.sh <rascunho> && node testes/arquivo-classes.js <rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const pad = n => String(n).padStart(2, '0');
const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = dk(new Date());
const addDias = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dk(new Date(y, m - 1, d + n)); };
const fmt = k => k.split('-').reverse().join('/');
const doc = (col, id, data) => ({ [col + '/' + id]: { path: col + '/' + id, colecao: col, doc_id: id, data } });
const base = { itens: [], criadoEm: 1, por: null, movimentou: false, movs: [], obs: '', combinado: '', descricao: '' };
const ontem = addDias(hoje, -1);
const migr = {
  ...doc('config', 'geral', { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'inteiro', ajusteMercado: 30, margem: 30, markupCat: {}, variaveis: [] }),
  ...doc('pagar', 'a', { ...base, parte: 'Loja Teste Um', numero: '101', categoria: 'Peças', emissao: addDias(hoje, -33), total: 100, parcelas: [{ n: 1, venc: addDias(hoje, -3), valor: 100 }], criadoEm: 5 }),
  // paga antes de entrar no sistema: abatimento fora do caixa, sem dia certo ("até ontem")
  ...doc('pagar', 'b', { ...base, parte: 'Loja Teste Dois', numero: '202', categoria: 'Peças', emissao: addDias(hoje, -40), total: 50,
    parcelas: [{ n: 1, venc: addDias(hoje, -10), valor: 50, abatido: 50, pago: { data: null, ate: ontem, pg: 'abatimento', valor: 50, abat: 'ab1', em: 1, por: null } }],
    abatimentos: [{ id: 'ab1', valor: 50, data: null, ate: ontem, caixa: false, obs: 'Paga antes de ser marcada no sistema', parcs: [{ i: 0, valor: 50 }], em: 1, por: null }] }),
  ...doc('pagar', 'c', { ...base, parte: 'Distribuidora Teste', numero: '303', categoria: 'Boletos', emissao: addDias(hoje, -20), total: 80, parcelas: [{ n: 1, venc: addDias(hoje, -5), valor: 80, pago: { data: addDias(hoje, -5), pg: 'banco', valor: 80, item: 'x1', em: 1, por: null } }] }),
  ...doc('pagar', 'd', { ...base, parte: 'Compra Online Um', numero: '404', categoria: 'Compras online', site: 'Site Alfa', emissao: hoje, total: 60, parcelas: [{ n: 1, venc: addDias(hoje, 10), valor: 60 }] }),
  ...doc('pagar', 'e', { ...base, parte: 'Compra Online Dois', numero: '505', categoria: 'Compras online', site: 'Site Beta', emissao: hoje, total: 70, parcelas: [{ n: 1, venc: addDias(hoje, 12), valor: 70 }] }),
  ...doc('pagar', 'f', { ...base, parte: 'Mercadinho Teste', numero: '606', categoria: 'Supermercado', emissao: hoje, total: 40, parcelas: [{ n: 1, venc: addDias(hoje, 3), valor: 40 }] }),
  // sem classe e sem data de emissão (a tela não pode quebrar)
  ...doc('pagar', 'g', { ...base, parte: 'Fornecedor Sem Classe', numero: '707', emissao: null, total: 30, parcelas: [{ n: 1, venc: addDias(hoje, 15), valor: 30 }] }),
  // conta fixa em 2 parcelas, uma paga: continua na lista até pagar a outra
  ...doc('pagar', 'h', { ...base, parte: 'Internet Teste', numero: '808', categoria: 'Contas fixas', emissao: addDias(hoje, -35), total: 200,
    parcelas: [{ n: 1, venc: addDias(hoje, -30), valor: 100, pago: { data: addDias(hoje, -30), pg: 'pix', valor: 100, item: 'x2', em: 1, por: null } }, { n: 2, venc: addDias(hoje, 5), valor: 100 }] }),
  // clientes: um para chamar (prazo vencido), um já avisado, um ainda no prazo
  ...doc('retornos', 'r1', { nome: 'Cliente Chamar', tel: '33999990001', servico: 'Troca de óleo', feito: addDias(hoje, -190), meses: 6, volta: addDias(hoje, -7), veiculo: 'Gol', placa: 'AAA1A11', criadoEm: 1 }),
  ...doc('retornos', 'r2', { nome: 'Cliente Avisado', tel: '33999990002', servico: 'Alinhamento', feito: addDias(hoje, -100), meses: 3, volta: addDias(hoje, -8), avisadoEm: Date.now() - 86400000, veiculo: 'Uno', criadoEm: 1 }),
  ...doc('retornos', 'r3', { nome: 'Cliente Futuro', tel: '33999990003', servico: 'Balanceamento', feito: addDias(hoje, -30), meses: 6, volta: addDias(hoje, 150), veiculo: 'Palio', criadoEm: 1 })
};
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8781', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
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
  const entrar = async P => {
    await P.goto('http://127.0.0.1:8781/'); await P.waitForTimeout(700);
    await P.fill('#lc-nome', 'Bernardo'); await P.fill('#lc-email', 'loja@pneusbr.com'); await P.fill('#lc-senha', 'senha-forte-1'); await P.fill('#lc-senha2', 'senha-forte-1');
    await P.click('#f-criar button[type=submit]'); await P.waitForTimeout(3000);
  };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await prep(ctx);
  const A = await ctx.newPage();
  A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|404/.test(m.text())) out.errors.push(m.text()); });
  const txt = sel => A.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText.replace(/\s+/g, ' ').trim()), sel);
  const db = () => A.evaluate(() => JSON.parse(localStorage.getItem('mock-sb-db')).docs);
  const ir = async h => { await A.evaluate(x => { location.hash = x; }, h); await A.waitForTimeout(350); };
  const aviso = () => A.evaluate(() => { const el = document.querySelector('#aviso'); return { visivel: !!el && !el.hidden, aberto: !!el?.querySelector('.aviso-card'), soCli: !!el?.querySelector('.aviso-card.so-cli'), bolaCli: !!el?.querySelector('.aviso-bola.cli'), num: el?.querySelector('.aviso-bola b')?.textContent || '', numCli: el?.querySelector('.aviso-bola i')?.textContent || '', notas: [...(el?.querySelectorAll('.aviso-l li.nt') || [])].map(x => x.innerText.replace(/\s+/g, ' ')), clientes: [...(el?.querySelectorAll('.aviso-l li.cli') || [])].map(x => x.innerText.replace(/\s+/g, ' ')), corCli: el?.querySelector('.aviso-l li.cli button') ? getComputedStyle(el.querySelector('.aviso-l li.cli button')).boxShadow : '', corNota: el?.querySelector('.aviso-l li.nt button') ? getComputedStyle(el.querySelector('.aviso-l li.nt button')).boxShadow : '', titulo: el?.querySelector('.aviso-h b')?.textContent || '' }; });
  await entrar(A);

  /* ---------- 1) aviso: notas (vermelho) + clientes para chamar (azul) ---------- */
  out.c.aviso = await aviso();
  ok(out.c.aviso.aberto && out.c.aviso.titulo === 'Avisos', 'aviso abre com notas e clientes (título "Avisos")', out);
  ok(out.c.aviso.notas.length === 1 && /Loja Teste Um/.test(out.c.aviso.notas[0]), 'aviso mostra a nota atrasada', out);
  ok(out.c.aviso.clientes.length === 1 && /Cliente Chamar/.test(out.c.aviso.clientes[0]) && /Troca de óleo/.test(out.c.aviso.clientes[0]) && /venceu há 7 dias/.test(out.c.aviso.clientes[0]), 'aviso mostra o cliente com troca de óleo vencida', out);
  ok(!out.c.aviso.clientes.some(t => /Avisado|Futuro/.test(t)), 'cliente já avisado ou no prazo não entra', out);
  ok(out.c.aviso.corCli && out.c.aviso.corNota && out.c.aviso.corCli !== out.c.aviso.corNota, 'cliente com cor diferente da nota', out);
  await A.screenshot({ path: path.join(SP, 'teste/ac1-aviso.png') });
  await A.click('#aviso [data-acao="aviso-min"]'); await A.waitForTimeout(200);
  out.c.bola = await aviso();
  ok(out.c.bola.num === '1' && out.c.bola.numCli === '1', 'bolinha mostra as notas e, em azul, os clientes', out);
  await A.click('#aviso .aviso-bola'); await A.waitForTimeout(200);
  await A.click('#aviso li.cli button'); await A.waitForTimeout(600);
  out.c.cliAberto = await A.evaluate(() => ({ tab: location.hash, txt: document.querySelector('#drawer:not([hidden])')?.innerText.replace(/\s+/g, ' ').slice(0, 120) || '' }));
  ok(out.c.cliAberto.tab === '#retornos' && /Cliente Chamar/.test(out.c.cliAberto.txt), 'clicar no cliente abre o retorno dele', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);

  /* ---------- 2) lista e Arquivo ---------- */
  await ir('#pagar');
  await A.click('[data-acao="nf"][data-v="todas"]'); await A.waitForTimeout(200);
  out.c.lista = await txt('#np-tab tbody tr');
  ok(out.c.lista.length === 7 && !out.c.lista.some(t => /Loja Teste Dois|Distribuidora Teste/.test(t)), 'notas pagas por inteiro saem da lista', out);
  ok(out.c.lista.some(t => /Internet Teste/.test(t)), 'nota com uma parcela ainda aberta continua na lista', out);
  out.c.filtros = await txt('#np-filtro button');
  ok(!out.c.filtros.includes('Pagas'), 'sem o filtro "Pagas" (as pagas ficam no Arquivo)', out);
  out.c.botao = (await txt('#np-arq-btn'))[0];
  ok(/Arquivo \(2\)/.test(out.c.botao || ''), 'botão Arquivo mostra 2 notas', out);
  ok(out.c.lista.some(t => /Peças/.test(t)) && out.c.lista.some(t => /Compras online · Site Alfa/.test(t)), 'a lista mostra a classe e o site', out);
  await A.click('#np-arq-btn'); await A.waitForTimeout(300);
  out.c.arq = await txt('#np-tab tbody tr');
  out.c.arqInfo = (await txt('#np-arq-info'))[0];
  out.c.arqKpi = (await txt('#np-kpis .kpi'))[0];
  ok(out.c.arq.length === 2 && /Arquivo de notas pagas/.test(out.c.arqInfo || ''), 'Arquivo mostra as 2 notas pagas', out);
  ok(out.c.arq.some(t => /Loja Teste Dois/.test(t) && t.includes('até ' + fmt(ontem)) && /fora do caixa/.test(t)), 'paga sem dia certo aparece "até" a data e fora do caixa', out);
  ok(out.c.arq.some(t => /Distribuidora Teste/.test(t) && t.includes(fmt(addDias(hoje, -5)))), 'paga com dia aparece com a data', out);
  ok(/2 nota/.test(out.c.arqKpi || ''), 'números do topo do Arquivo', out);
  ok(await A.evaluate(() => document.querySelector('#np-filtro').hidden), 'no Arquivo o filtro de situação some', out);
  await A.fill('#np-q', '303'); await A.waitForTimeout(200);
  out.c.arqBusca = await txt('#np-tab tbody tr');
  ok(out.c.arqBusca.length === 1 && /Distribuidora/.test(out.c.arqBusca[0]), 'busca no Arquivo', out);
  await A.fill('#np-q', ''); await A.waitForTimeout(150);
  await A.screenshot({ path: path.join(SP, 'teste/ac2-arquivo.png') });
  // abrir a nota paga sem dia: mostra "até" nos abatimentos
  await A.click('#np-tab tbody tr >> text=Loja Teste Dois'); await A.waitForTimeout(300);
  out.c.notaB = (await txt('#drawer:not([hidden])'))[0] || '';
  ok(out.c.notaB.includes('até ' + fmt(ontem)) && /não mexeu no caixa/.test(out.c.notaB), 'na nota, o pagamento antigo aparece "até" a data', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  await A.click('[data-acao="np-arquivo"] >> nth=0'); await A.waitForTimeout(250);
  ok(!(await A.evaluate(() => document.querySelector('#np-arq-btn').getAttribute('aria-pressed') === 'true')), 'volta às notas em aberto', out);

  /* ---------- 3) classes e sites ---------- */
  out.c.classes = await txt('#np-cat button');
  ok(['Todas', 'Peças', 'Boletos', 'Contas fixas', 'Supermercado', 'Compras online', 'Sem classe'].every(c => out.c.classes.some(t => t.startsWith(c))), 'botões das classes', out);
  ok(out.c.classes.some(t => /^Compras online ?2$/.test(t)) && out.c.classes.some(t => /^Sem classe ?1$/.test(t)) && out.c.classes.some(t => /^Boletos ?0$/.test(t)), 'contagem por classe', out);
  await A.click('#np-cat button[data-v="Compras online"]'); await A.waitForTimeout(200);
  out.c.online = await txt('#np-tab tbody tr');
  out.c.sites = await txt('#np-site button');
  ok(out.c.online.length === 2 && out.c.online.every(t => /Compra Online/.test(t)), 'classe Compras online filtra', out);
  ok(out.c.sites.length === 3 && out.c.sites.some(t => /^Site Alfa ?1$/.test(t)), 'compras online separadas por site', out);
  await A.click('#np-site button[data-v="Site Beta"]'); await A.waitForTimeout(200);
  out.c.soBeta = await txt('#np-tab tbody tr');
  ok(out.c.soBeta.length === 1 && /Compra Online Dois/.test(out.c.soBeta[0]), 'filtro por site', out);
  out.c.kpiBeta = (await txt('#np-kpis .kpi'))[0];
  ok(/1 parcela/.test(out.c.kpiBeta || ''), 'números do topo seguem a classe e o site', out);
  await A.screenshot({ path: path.join(SP, 'teste/ac3-classes.png') });
  await A.click('#np-cat button[data-v=""]'); await A.waitForTimeout(200);
  ok(await A.evaluate(() => document.querySelector('#np-site').hidden), 'fora de Compras online os sites somem', out);

  /* ---------- 4) nota sem emissão abre; editar classe e site ---------- */
  await A.evaluate(() => window.__api.abrirNota('pagar', 'g')); await A.waitForTimeout(300);
  out.c.notaG = (await txt('#drawer:not([hidden]) .pn-h'))[0] || '';
  ok(/Fornecedor Sem Classe/.test(out.c.notaG) && /—/.test(out.c.notaG), 'nota sem data de emissão abre sem erro', out);
  await A.click('#drawer [data-acao="nota-editar"]'); await A.waitForTimeout(200);
  await A.selectOption('#ne-cat', 'Compras online'); await A.fill('#ne-site', 'Site Gama');
  await A.click('#drawer [data-acao="nota-salvar-edicao"]'); await A.waitForTimeout(400);
  out.c.gSalvo = (await db())['pagar/g'].data;
  ok(out.c.gSalvo.categoria === 'Compras online' && out.c.gSalvo.site === 'Site Gama', 'editar salva a classe e o site', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  // classe que não é compra online não guarda site
  await A.evaluate(() => window.__api.abrirNota('pagar', 'f')); await A.waitForTimeout(250);
  await A.click('#drawer [data-acao="nota-editar"]'); await A.waitForTimeout(200);
  await A.fill('#ne-site', 'Não deve ficar'); await A.click('#drawer [data-acao="nota-salvar-edicao"]'); await A.waitForTimeout(400);
  out.c.fSalvo = (await db())['pagar/f'].data;
  ok(out.c.fSalvo.categoria === 'Supermercado' && !out.c.fSalvo.site, 'site só fica em compras online', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);

  /* ---------- 5) nota nova: classe automática do fornecedor (o aviso aberto fica por cima do botão: minimiza antes) ---------- */
  await A.evaluate(() => document.querySelector('#aviso [data-acao="aviso-min"]')?.click()); await A.waitForTimeout(150);
  await A.click('[data-acao="nova-nota"][data-col="pagar"]'); await A.waitForTimeout(300);
  await A.fill('#drawer [data-nd="parte"]', 'Loja Teste Um'); await A.fill('#drawer [data-nd="numero"]', '999');
  await A.fill('#drawer [data-nd="total"]', '25,00'); await A.waitForTimeout(100);
  await A.click('#drawer [data-acao="nd-salvar"]'); await A.waitForTimeout(500);
  out.c.nova = Object.values(await db()).find(d => d.colecao === 'pagar' && d.data.numero === '999')?.data;
  ok(out.c.nova && out.c.nova.categoria === 'Peças', 'nota nova pega a classe do fornecedor', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  await A.click('[data-acao="nova-nota"][data-col="pagar"]'); await A.waitForTimeout(300);
  await A.fill('#drawer [data-nd="parte"]', 'Loja Nova Online'); await A.fill('#drawer [data-nd="numero"]', '998');
  await A.selectOption('#drawer [data-nd="categoria"]', 'Compras online'); await A.fill('#drawer [data-nd="site"]', 'Site Delta');
  await A.fill('#drawer [data-nd="total"]', '15,00'); await A.waitForTimeout(100);
  await A.click('#drawer [data-acao="nd-salvar"]'); await A.waitForTimeout(500);
  out.c.nova2 = Object.values(await db()).find(d => d.colecao === 'pagar' && d.data.numero === '998')?.data;
  ok(out.c.nova2 && out.c.nova2.categoria === 'Compras online' && out.c.nova2.site === 'Site Delta', 'nota nova com classe e site escolhidos', out);
  await A.keyboard.press('Escape'); await A.waitForTimeout(150);

  /* ---------- 6) pagar a última parcela leva a nota para o Arquivo; aviso só com clientes fica azul ---------- */
  for (const [id, i] of [['h', 1], ['a', 0]]) {
    await A.evaluate(x => window.__api.abrirNota('pagar', x), id); await A.waitForTimeout(250);
    await A.click(`#drawer [data-acao="parc-abrir"][data-i="${i}"]`); await A.waitForTimeout(150);
    await A.click(`#drawer [data-acao="parc-ok"][data-i="${i}"]`); await A.waitForTimeout(400);
    await A.keyboard.press('Escape'); await A.waitForTimeout(150);
  }
  out.c.botao2 = (await txt('#np-arq-btn'))[0];
  ok(/Arquivo \(4\)/.test(out.c.botao2 || ''), 'notas pagas agora vão para o Arquivo (4)', out);
  out.c.soCli = await aviso();
  ok(out.c.soCli.aberto && out.c.soCli.soCli && out.c.soCli.titulo === 'Clientes para chamar', 'sem notas vencendo, o aviso fica só com os clientes, em azul', out);
  await A.click('#aviso [data-acao="aviso-min"]'); await A.waitForTimeout(200);
  out.c.bolaCli = await aviso();
  ok(out.c.bolaCli.bolaCli && out.c.bolaCli.num === '1', 'bolinha azul só com clientes', out);
  await A.screenshot({ path: path.join(SP, 'teste/ac4-so-clientes.png') });
  // cliente avisado sai do aviso
  await A.evaluate(() => { const api = window.__api; const r = api.S.retornos.get('r1'); api.S.retornos.set('r1', { ...r, avisadoEm: Date.now() }); api.render(); }); await A.waitForTimeout(250);
  ok(!(await aviso()).visivel, 'sem nada pendente, o aviso some', out);

  /* ---------- 7) celular ---------- */
  const M = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await prep(M.context()); M.on('pageerror', e => out.errors.push('celular: ' + e.message));
  await entrar(M);
  await M.evaluate(() => { location.hash = '#pagar'; }); await M.waitForTimeout(500);
  await M.click('#aviso [data-acao="aviso-min"]').catch(() => { }); await M.waitForTimeout(200);
  out.c.cel = await M.evaluate(() => ({ rolaLado: document.documentElement.scrollWidth > innerWidth, cats: document.querySelectorAll('#np-cat button').length }));
  ok(!out.c.cel.rolaLado && out.c.cel.cats >= 6, 'celular: classes sem rolagem lateral', out);
  await M.screenshot({ path: path.join(SP, 'teste/ac5-celular.png') });
  ok(!out.errors.length, 'sem erros no console', out);
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
  process.exit(out.falhas.length ? 1 : 0);
})().catch(e => { console.error(e); console.log(JSON.stringify(globalThis.__out, null, 1)); process.exit(2); });
