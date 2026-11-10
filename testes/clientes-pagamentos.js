// Teste (10/11/2026): aba Clientes com serviços ligados ao cliente (com ou sem retorno), serviços de suspensão sem
// preço, Colaboradores com nomes completos, pagamentos semanais, vales e retiradas do Brito saindo do caixa.
// Uso: ./testes/preparar-site.sh <rascunho> && node testes/clientes-pagamentos.js <rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const pad = n => String(n).padStart(2, '0');
const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = dk(new Date());
const addDias = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dk(new Date(y, m - 1, d + n)); };
const addMeses = (k, n) => { const [y, m, d] = k.split('-').map(Number); const a = new Date(y, m - 1 + n, 1), f = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate(); return dk(new Date(a.getFullYear(), a.getMonth(), Math.min(d, f))); };
const iniSem = k => { const [y, m, d] = k.split('-').map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return dk(x); };
const doc = (col, id, data) => ({ [col + '/' + id]: { path: col + '/' + id, colecao: col, doc_id: id, data } });
const migr = {
  ...doc('config', 'geral', { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'inteiro', ajusteMercado: 30, margem: 30, markupCat: {}, variaveis: [] }),
  ...doc('servicos', 'sv1', { nome: 'Alinhamento', cod: 'S01', preco: 80, ativo: true, criadoEm: 1 }),
  ...doc('servicos', 'sv2', { nome: 'Montagem de pneu', cod: 'S02', preco: 20, ativo: true, criadoEm: 2 }),
  ...doc('servicos', 'sv3', { nome: 'Troca do pivô', cod: 'S16', preco: 0, ativo: true, grupo: 'Suspensão', criadoEm: 3 }),
  ...doc('servicos', 'sv4', { nome: 'Troca do amortecedor', cod: 'S21', preco: 0, ativo: true, grupo: 'Suspensão', criadoEm: 4 })
};
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8778', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.route(/fonts\./, r => r.abort());
  await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
  await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await ctx.addInitScript(([x, m]) => {
    window.__xlsxB64 = x; window.__abertos = []; window.open = u => { window.__abertos.push(u); return null; };
    if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} }));
    window.__pbrTeste = api => { window.__api = api; };
  }, [xlsx, migr]);
  const A = await ctx.newPage(); globalThis.__out = out;
  A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|404/.test(m.text())) out.errors.push(m.text()); });
  const txt = sel => A.evaluate(s => [...document.querySelectorAll(s)].map(e => e.innerText.replace(/\s+/g, ' ').trim()), sel);
  const db = () => A.evaluate(() => JSON.parse(localStorage.getItem('mock-sb-db')).docs);
  const col = async c => Object.values(await db()).filter(d => d.colecao === c).map(d => ({ id: d.doc_id, ...d.data }));
  const caixaItens = async () => (await col('lancamentos')).flatMap(L => L.itens.map(it => ({ ...it, _d: L.data })));
  await A.goto('http://127.0.0.1:8778/'); await A.waitForTimeout(700);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);

  /* ---------- 1) Serviços de suspensão sem preço ---------- */
  await A.evaluate(() => { location.hash = '#servicos'; }); await A.waitForTimeout(400);
  out.c.servPivo = (await txt('#s-tab tbody tr')).find(t => /Troca do pivô/.test(t));
  ok(/Sem preço/.test(out.c.servPivo || ''), 'serviço de suspensão aparece sem preço', out);
  await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(300);
  await A.keyboard.press('F4'); await A.click('#quem-chips [data-quem="lucas"]'); await A.waitForTimeout(100);
  await A.fill('#scan', 'S16'); await A.press('#scan', 'Enter'); await A.waitForTimeout(300);
  out.c.pedePreco = await A.evaluate(() => !!document.querySelector('#sp-preco'));
  ok(out.c.pedePreco, 'serviço sem preço pede o valor na hora', out);
  await A.fill('#sp-preco', '120'); await A.press('#sp-preco', 'Enter'); await A.waitForTimeout(400);

  /* ---------- 2) Clientes: cadastrar serviços com e sem retorno ---------- */
  await A.evaluate(() => { location.hash = '#retornos'; }); await A.waitForTimeout(400);
  out.c.menu = await A.evaluate(() => document.querySelector('.rail a[data-tab="retornos"]').getAttribute('data-tip'));
  ok(out.c.menu === 'Clientes', 'menu chama Clientes', out);
  ok((await txt('[data-view="retornos"] h1'))[0] === 'Clientes', 'título Clientes', out);
  await A.click('[data-acao="rt-novo"]'); await A.waitForTimeout(250);
  await A.fill('#rt-nome', 'João Silva'); await A.fill('#rt-tel', '(33) 99999-8888'); await A.fill('#rt-veic', 'Gol'); await A.fill('#rt-placa', 'abc1d23');
  const feito = addDias(hoje, -10); await A.fill('#rt-feito', feito);
  out.c.catalogo = await A.evaluate(() => [...document.querySelectorAll('#rt-cat option')].map(o => o.value));
  ok(out.c.catalogo.includes('Troca do pivô') && out.c.catalogo.includes('Troca do amortecedor'), 'lista de serviços no cadastro do cliente', out);
  await A.fill('#rt-outro', 'Troca do pivô'); await A.click('[data-acao="rt-salvar-novo"]'); await A.waitForTimeout(150);
  out.c.erroDigitado = await A.evaluate(() => document.querySelector('#rt-erro').textContent);
  ok(/Adicionar/.test(out.c.erroDigitado), 'avisa serviço digitado sem adicionar', out);
  await A.click('[data-acao="rt-outro-add"]'); await A.waitForTimeout(100);
  await A.fill('#rt-outro', 'Troca do amortecedor'); await A.press('#rt-outro', 'Enter'); await A.waitForTimeout(100);
  await A.selectOption('[data-rtom="1"]', '12');
  out.c.outros = await txt('#rt-outros .rt-outro b');
  await A.screenshot({ path: path.join(SP, 'teste/cp1-cadastro.png') });
  await A.click('[data-acao="rt-salvar-novo"]'); await A.waitForTimeout(500);
  let R = await col('retornos');
  const pivo = R.find(r => r.servico === 'Troca do pivô'), amort = R.find(r => r.servico === 'Troca do amortecedor');
  out.c.cad = R.map(r => `${r.servico}|${r.feito}|${r.volta}|${r.status}|${r.servCat}`);
  ok(pivo && pivo.volta === null && pivo.status === 'feito' && pivo.servCat === 'sv3', 'serviço sem retorno guardado', out);
  ok(amort && amort.volta === addMeses(feito, 12) && amort.status === 'aberto' && amort.meses === 12, 'serviço com retorno em 12 meses', out);
  out.c.kpis = await txt('#rt-kpis .kpi');
  const nMes = feito >= hoje.slice(0, 8) + '01' ? 2 : 0;
  ok(/^CLIENTES 1/i.test(out.c.kpis[0]) && new RegExp(nMes + ' serviços cadastrados no mês').test(out.c.kpis[0]), 'kpi de clientes', out);
  out.c.badge = await A.evaluate(() => document.querySelector('#badge-retornos').hidden ? '' : document.querySelector('#badge-retornos').textContent);
  ok(out.c.badge === '', 'serviço sem retorno não conta para chamar', out);
  out.c.linhas = await txt('#cl-tab tbody tr');
  ok(out.c.linhas.length === 1 && /João Silva/.test(out.c.linhas[0]) && /Gol ABC1D23/.test(out.c.linhas[0]) && / 2 /.test(' ' + out.c.linhas[0] + ' '), 'lista de clientes', out);
  await A.screenshot({ path: path.join(SP, 'teste/cp2-clientes.png') });
  // visão Retornos: só o que tem prazo
  await A.click('[data-acao="rt-visao"][data-v="retornos"]'); await A.click('[data-acao="rt-filtro"][data-v="todos"]'); await A.waitForTimeout(150);
  out.c.retornos = await txt('#rt-tab tbody tr');
  ok(out.c.retornos.length === 1 && /amortecedor/.test(out.c.retornos[0]), 'visão Retornos só com prazo', out);
  await A.click('[data-acao="rt-visao"][data-v="clientes"]'); await A.waitForTimeout(150);

  /* ---------- 3) Registrar: ligar serviço sem prazo ao cliente ---------- */
  await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(300);
  await A.fill('#scan', 'S02'); await A.press('#scan', 'Enter'); await A.waitForTimeout(400);
  out.c.uret = (await txt('#ultimo .u-ret'))[0];
  ok(/Ligue este serviço a um cliente/.test(out.c.uret || ''), 'atalho Ligar ao cliente', out);
  await A.click('[data-acao="rt-de-item"]'); await A.waitForTimeout(250);
  out.c.preOutro = await txt('#rt-outros .rt-outro b');
  ok(out.c.preOutro.join() === 'Montagem de pneu', 'serviço do Registrar já vem na lista', out);
  await A.fill('#rt-nome', 'João Silva'); await A.dispatchEvent('#rt-nome', 'input'); await A.waitForTimeout(100);
  await A.click('[data-acao="rt-salvar-novo"]'); await A.waitForTimeout(500);
  out.c.uret2 = (await txt('#ultimo .u-ret'))[0];
  ok(/ligado ao cliente João Silva/.test(out.c.uret2 || ''), 'mostra o cliente ligado', out);
  R = await col('retornos'); const mont = R.find(r => r.servico === 'Montagem de pneu');
  ok(mont && mont.origem?.item && mont.valor === 20 && mont.quem === 'lucas' && mont.tel === '(33) 99999-8888' && mont.status === 'feito', 'registro ligado guarda valor, quem fez e WhatsApp', out);

  /* ---------- 4) Ficha do cliente ---------- */
  await A.evaluate(() => { location.hash = '#retornos'; }); await A.waitForTimeout(400);
  await A.click('#cl-tab tbody tr'); await A.waitForTimeout(300);
  out.c.hist = await txt('#cl-hist tbody tr');
  ok(out.c.hist.length === 3 && out.c.hist.some(t => /Montagem de pneu.*feito por Lucas.*Sem retorno/.test(t)) && out.c.hist.some(t => /amortecedor.*Volta em/.test(t)), 'histórico do cliente', out);
  await A.screenshot({ path: path.join(SP, 'teste/cp3-ficha-cliente.png') });
  await A.fill('#cl-tel', '33 98888-7777'); await A.click('[data-acao="cl-salvar"]'); await A.waitForTimeout(400);
  R = await col('retornos');
  ok(R.length === 3 && R.every(r => r.tel === '33 98888-7777'), 'WhatsApp trocado em todos os serviços do cliente', out);
  // lembrar de chamar um serviço que estava sem retorno
  await A.click(`#cl-hist tr[data-id="${pivo.id}"]`); await A.waitForTimeout(300);
  await A.selectOption('#rt-lm', '6'); await A.click('[data-acao="rt-lembrar"]'); await A.waitForTimeout(300);
  R = await col('retornos');
  ok(R.find(r => r.id === pivo.id).volta === addMeses(feito, 6) && R.find(r => r.id === pivo.id).status === 'aberto', 'lembrar de chamar depois', out);
  await A.click('[data-acao="fechar-drawer"].primary'); await A.waitForTimeout(150);

  /* ---------- 5) Colaboradores: nomes e senha das telas ---------- */
  await A.evaluate(() => { location.hash = '#integrantes'; }); await A.waitForTimeout(500);
  ok((await txt('[data-view="integrantes"] h1'))[0] === 'Colaboradores', 'título Colaboradores', out);
  out.c.cards = (await txt('#i-cards .int-card')).map(t => t.slice(0, 70));
  ok(out.c.cards.length === 6 && /Brito Sócio José Aparecido de Brito/.test(out.c.cards[0]) && /Vinícius.*Fábio Vinícius Oliveira de Souza/.test(out.c.cards[5]), 'seis colaboradores com nome completo', out);
  out.c.travado = await A.evaluate(() => !!document.querySelector('#pag-trava-form') && !document.querySelector('#pag-tab'));
  ok(out.c.travado, 'pagamentos pedem a senha das telas', out);
  await A.fill('#pag-senha', 'errada'); await A.press('#pag-senha', 'Enter'); await A.waitForTimeout(300);
  out.c.erroSenha = (await txt('#pag-trava-erro'))[0];
  ok(/incorreta/.test(out.c.erroSenha || ''), 'senha errada recusada', out);
  await A.fill('#pag-senha', 'trepniayks'); await A.press('#pag-senha', 'Enter'); await A.waitForTimeout(500);
  out.c.linhasPag = (await txt('#pag-tab tbody tr')).map(t => t.split(' ')[0]);
  ok(out.c.linhasPag.join() === 'Brenda,Cláudio,Lucas,Bernardo,Vinícius', 'semana com os colaboradores (sem o sócio)', out);
  ok((await txt('#socio-brito h2'))[0] === 'Retiradas do Brito', 'quadro das retiradas do Brito', out);
  out.c.servLucas = (await txt('#pag-tab tr[data-colab="lucas"] td'))[0];
  ok(/2 serviços na semana · R\$ 140,00/.test(out.c.servLucas || ''), 'serviços do colaborador na semana', out);

  /* ---------- 6) Vales + pagamento do fim de semana ---------- */
  const novo = async (tipo, quem, valor, data, extra) => {
    await A.click(`#pag-tab [data-acao="pag-novo"][data-tipo="${tipo}"][data-colab="${quem}"], #socio-${quem} [data-acao="pag-novo"]`); await A.waitForTimeout(250);
    await A.fill('#pg-valor', valor); if (data) await A.fill('#pg-data', data); if (extra) await extra();
    await A.dispatchEvent('#pg-valor', 'input'); await A.waitForTimeout(80);
    const info = (await txt('#pg-info'))[0];
    await A.click('[data-acao="pag-salvar"]'); await A.waitForTimeout(400);
    return info;
  };
  await novo('vale', 'lucas', '50');
  out.c.info2 = await novo('vale', 'lucas', '30', null, async () => { await A.selectOption('#pg-forma', 'pix'); await A.fill('#pg-obs', 'gasolina'); });
  out.c.infoPag = await novo('pagamento', 'lucas', '400');
  ok(/2 vales \(R\$ 80,00\).*recebe R\$ 480,00 na semana/.test(out.c.infoPag || ''), 'aviso soma vales com o pagamento', out);
  out.c.linhaLucas = (await txt('#pag-tab tr[data-colab="lucas"]'))[0];
  ok(/R\$ 80,00/.test(out.c.linhaLucas) && /R\$ 400,00/.test(out.c.linhaLucas) && /R\$ 480,00/.test(out.c.linhaLucas), 'semana do Lucas: vales + pagamento', out);
  let P = await col('pagamentos'), CX = await caixaItens();
  const semAtual = iniSem(hoje);
  ok(P.length === 3 && P.every(p => p.quem === 'lucas' && p.semana === semAtual && p.item), 'pagamentos guardados com a semana', out);
  ok(P.every(p => CX.find(it => it.id === p.item && it.k === 'caixa' && it.tipo === 'despesa' && it.caixa === -p.valor && it.pag === p.id)), 'cada um saiu do caixa como despesa', out);
  out.c.catCaixa = CX.filter(it => it.pag).map(it => `${it.cat}|${it.desc}|${it.pg}`);
  ok(out.c.catCaixa.some(t => /^Vale de colaborador\|Vale: Lucas · gasolina\|pix$/.test(t)) && out.c.catCaixa.some(t => /^Pagamento de colaborador\|Pagamento da semana .*: Lucas\|dinheiro$/.test(t)), 'categoria e descrição no caixa', out);
  await A.screenshot({ path: path.join(SP, 'teste/cp4-semana.png') });
  // semana passada: pagamento do Cláudio com a data do sábado dela
  await A.click('[data-acao="pag-sem-ant"]'); await A.waitForTimeout(250);
  const semAnt = addDias(semAtual, -7);
  ok((await txt('#pag-semana'))[0] === `${semAnt.slice(8)}/${semAnt.slice(5, 7)} a ${addDias(semAnt, 6).slice(8)}/${addDias(semAnt, 6).slice(5, 7)}`, 'navega para a semana anterior', out);
  await A.click('#pag-tab [data-acao="pag-novo"][data-tipo="pagamento"][data-colab="claudio"]'); await A.waitForTimeout(250);
  out.c.dataSab = await A.evaluate(() => document.querySelector('#pg-data').value);
  ok(out.c.dataSab === addDias(semAnt, 5), 'semana passada sugere o sábado', out);
  await A.fill('#pg-valor', '300'); await A.click('[data-acao="pag-salvar"]'); await A.waitForTimeout(400);
  P = await col('pagamentos');
  ok(P.find(p => p.quem === 'claudio')?.semana === semAnt && P.find(p => p.quem === 'claudio')?.data === addDias(semAnt, 5), 'pagamento na semana certa', out);
  await A.click('[data-acao="pag-sem-hoje"]'); await A.waitForTimeout(200);

  /* ---------- 7) Retiradas do Brito, somando com a data ---------- */
  const d1 = addDias(hoje, -9);
  await novo('retirada', 'brito', '100', d1);
  out.c.infoRet = await novo('retirada', 'brito', '250');
  ok(/já retirou R\$ 100,00 no total; com esta, fica R\$ 350,00/.test(out.c.infoRet || ''), 'aviso do total do Brito', out);
  out.c.socio = await txt('#socio-brito .kpi');
  ok(/TOTAL RETIRADO R\$ 350,00/i.test(out.c.socio[0]), 'total retirado do Brito', out);
  out.c.somando = await txt('#socio-brito .socio-tab tbody tr');
  ok(out.c.somando.length === 2 && /R\$ 250,00 R\$ 350,00/.test(out.c.somando[0]) && /R\$ 100,00 R\$ 100,00/.test(out.c.somando[1]) && out.c.somando[1].startsWith(`${d1.slice(8)}/${d1.slice(5, 7)}/${d1.slice(0, 4)}`), 'retiradas somando, com a data', out);
  CX = await caixaItens();
  ok(CX.filter(it => it.cat === 'Retirada do sócio').map(it => it._d).sort().join() === [d1, hoje].sort().join(), 'retiradas saíram do caixa do dia de cada uma', out);
  await A.screenshot({ path: path.join(SP, 'teste/cp5-brito.png') });

  /* ---------- 8) Desfazer: pelo histórico e pelas Movimentações ---------- */
  await A.click('#pag-tab [data-acao="pag-hist"][data-id="lucas"]'); await A.waitForTimeout(300);
  P = await col('pagamentos'); const vale30 = P.find(p => p.valor === 30);
  await A.click(`[data-acao="pag-desfazer"][data-id="${vale30.id}"]`); await A.click(`[data-acao="pag-desfazer"][data-id="${vale30.id}"]`); await A.waitForTimeout(400);
  P = await col('pagamentos'); CX = await caixaItens();
  ok(P.find(p => p.id === vale30.id).desfeito && CX.some(it => it.k === 'estorno' && it.ref === vale30.item), 'desfazer marca e estorna o caixa', out);
  out.c.histLucas = await txt('#drawer-pn .pag-sem-h');
  ok(/recebeu R\$ 450,00/.test(out.c.histLucas[0] || ''), 'histórico recalcula a semana', out);
  await A.click('[data-acao="fechar-drawer"].primary'); await A.waitForTimeout(150);
  ok(/R\$ 450,00/.test((await txt('#pag-tab tr[data-colab="lucas"]'))[0]), 'semana do Lucas sem o vale desfeito', out);
  // pelas Movimentações (onde fica o botão de desfazer de cada lançamento): desfazer a retirada de hoje do Brito
  P = await col('pagamentos'); const ret250 = P.find(p => p.valor === 250);
  await A.evaluate(() => { location.hash = '#movimentacoes'; }); await A.waitForTimeout(500);
  out.c.movRetirada = (await txt('#m-tab tbody tr')).find(t => /Retirada: Brito/.test(t));
  ok(/Despesa Retirada do sócio/.test(out.c.movRetirada || ''), 'retirada aparece nas movimentações', out);
  await A.click(`[data-acao="desfazer"][data-id="${ret250.item}"]`); await A.click(`[data-acao="desfazer"][data-id="${ret250.item}"]`); await A.waitForTimeout(400);
  P = await col('pagamentos');
  ok(P.find(p => p.id === ret250.id).desfeito, 'desfazer nas Movimentações também desfaz a retirada', out);
  await A.evaluate(() => { location.hash = '#integrantes'; }); await A.waitForTimeout(400);
  ok(/TOTAL RETIRADO R\$ 100,00/i.test((await txt('#socio-brito .kpi'))[0]), 'total do Brito sem a retirada desfeita', out);

  /* ---------- 9) Cadastro do colaborador: nome completo e sócio ---------- */
  await A.click('[data-acao="abrir-integrante"][data-id="bernardo"]'); await A.waitForTimeout(250);
  out.c.cadBernardo = await A.evaluate(() => ({ completo: document.querySelector('#ig-completo').value, socio: document.querySelector('#ig-socio').checked, cnpj: document.querySelector('#ig-cnpj').value }));
  ok(out.c.cadBernardo.completo === 'Bernardo Pereira de Brito' && !out.c.cadBernardo.socio && !out.c.cadBernardo.cnpj, 'cadastro do Bernardo', out);
  await A.screenshot({ path: path.join(SP, 'teste/cp6-cadastro-colab.png') });
  await A.click('#drawer-pn [data-acao="fechar-drawer"].ghost'); await A.waitForTimeout(150);

  /* ---------- 10) celular ---------- */
  await A.setViewportSize({ width: 390, height: 844 }); await A.waitForTimeout(400);
  out.c.rolaColab = await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await A.screenshot({ path: path.join(SP, 'teste/cp7-celular-colab.png'), fullPage: false });
  await A.evaluate(() => { location.hash = '#retornos'; }); await A.waitForTimeout(400);
  out.c.rolaCli = await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await A.click('[data-acao="rt-novo"]'); await A.waitForTimeout(250);
  await A.fill('#rt-outro', 'Troca do pivô'); await A.click('[data-acao="rt-outro-add"]'); await A.waitForTimeout(100);
  out.c.rolaForm = await A.evaluate(() => { const p = document.querySelector('#drawer-pn'); return p.scrollWidth > p.clientWidth + 1; });
  await A.screenshot({ path: path.join(SP, 'teste/cp8-celular-form.png') });
  ok(!out.c.rolaColab && !out.c.rolaCli && !out.c.rolaForm, 'sem rolagem lateral em 390px', out);

  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FALHOU', e); console.error(JSON.stringify(globalThis.__out || {}, null, 1).slice(0, 6000)); process.exit(1); });
