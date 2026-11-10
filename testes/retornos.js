// Teste: aba "Clientes" (lembrete de volta com WhatsApp, visão Retornos) e o atalho no Registrar.
// Uso: node testes/retornos.js <pasta-de-rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const migr = {
  'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'inteiro', ajusteMercado: 30, margem: 30, markupCat: {}, variaveis: [] } },
  'servicos/sv1': { path: 'servicos/sv1', colecao: 'servicos', doc_id: 'sv1', data: { nome: 'Alinhamento', cod: 'S01', preco: 80, ativo: true, criadoEm: 1 } },
  'servicos/sv2': { path: 'servicos/sv2', colecao: 'servicos', doc_id: 'sv2', data: { nome: 'Montagem de pneu', cod: 'S02', preco: 20, ativo: true, criadoEm: 2 } },
};
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
const pad = n => String(n).padStart(2, '0');
const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addMeses = (key, n) => { const [y, m, d] = key.split('-').map(Number); const a = new Date(y, m - 1 + n, 1); const fim = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate(); return dk(new Date(a.getFullYear(), a.getMonth(), Math.min(d, fim))); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8772', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route(/fonts\./, r => r.abort());
  await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
  await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
  await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
  await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; window.__abertos = []; window.open = (u) => { window.__abertos.push(u); return null; }; }, [xlsx, migr]);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8772' });
  const A = await ctx.newPage(); A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|404/.test(m.text())) out.errors.push(m.text()); });
  await A.goto('http://127.0.0.1:8772/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);
  const db = () => A.evaluate(() => JSON.parse(localStorage.getItem('mock-sb-db')).docs);
  const rets = async () => Object.values(await db()).filter(d => d.colecao === 'retornos').map(d => ({ id: d.doc_id, ...d.data }));
  const txt = s => A.evaluate(q => [...document.querySelectorAll(q)].map(e => e.innerText.replace(/\s+/g, ' ').trim()), s);
  const hoje = dk(new Date());

  // 1) tela vazia, item no menu
  await A.evaluate(() => { location.hash = '#retornos'; }); await A.waitForTimeout(500);
  out.c.menu = await A.evaluate(() => !!document.querySelector('.rail a[data-tab="retornos"]'));
  ok(out.c.menu, 'item no menu', out);
  out.c.vazio = (await txt('#rt-hoje'))[0];
  ok(/Nenhum cliente cadastrado/.test(out.c.vazio || ''), 'tela vazia explica', out);
  await A.screenshot({ path: path.join(SP, 'teste/r1-vazia.png') });

  // 2) serviços e prazos: 3 do dono + 5 sugestões; usar "Revisão geral"
  await A.click('[data-acao="rt-config"]'); await A.waitForTimeout(300);
  out.c.cfgServ = await A.evaluate(() => [...document.querySelectorAll('[data-rtc="nome"]')].map((e, i) => e.value + ':' + document.querySelectorAll('[data-rtc="meses"]')[i].value));
  ok(out.c.cfgServ.join('|') === 'Troca de óleo:6|Alinhamento:3|Balanceamento:6', 'prazos do dono', out);
  out.c.sugs = await txt('.rt-sug');
  ok(out.c.sugs.length === 5, '5 sugestões', out);
  out.c.exemplo = (await txt('#rt-cfg-ex'))[0];
  ok(out.c.exemplo === 'Olá, João! Aqui é da PneusBR. Já faz 6 meses da troca de óleo do seu Gol: está na hora de fazer de novo. Quer agendar um horário?', 'exemplo da mensagem', out);
  await A.screenshot({ path: path.join(SP, 'teste/r2-config.png') });
  await A.click('[data-acao="rt-cfg-usar"][data-id="revisao"]'); await A.waitForTimeout(200);
  await A.click('[data-acao="rt-cfg-salvar"]'); await A.waitForTimeout(500);
  out.c.cfgDoc = (await db())['config/retornos']?.data?.servicos?.map(s => s.nome + ':' + s.meses);
  ok(JSON.stringify(out.c.cfgDoc) === JSON.stringify(['Troca de óleo:6', 'Alinhamento:3', 'Balanceamento:6', 'Revisão geral:12']), 'config salva com a sugestão aprovada', out);

  // 3) cadastrar cliente: feito há 6 meses, troca de óleo + alinhamento
  const feito = addMeses(hoje, -6);
  await A.click('[data-acao="rt-novo"]'); await A.waitForTimeout(250);
  await A.fill('#rt-nome', 'João Silva'); await A.fill('#rt-tel', '(33) 99999-8888'); await A.fill('#rt-veic', 'Gol'); await A.fill('#rt-placa', 'abc1d23');
  await A.fill('#rt-feito', feito); await A.waitForTimeout(100);
  out.c.voltaOleo = await A.evaluate(() => document.querySelector('[data-rtvolta="oleo"]').textContent);
  await A.click('[data-acao="rt-salvar-novo"]'); await A.waitForTimeout(150);
  out.c.erroSemServ = await A.evaluate(() => document.querySelector('#rt-erro').textContent);
  ok(/Marque/.test(out.c.erroSemServ), 'pede serviço', out);
  await A.check('[data-rtsv="oleo"]'); await A.check('[data-rtsv="alinhamento"]');
  await A.screenshot({ path: path.join(SP, 'teste/r3-cadastro.png') });
  await A.click('[data-acao="rt-salvar-novo"]'); await A.waitForTimeout(500);
  let R = await rets();
  out.c.cad = R.map(r => `${r.servico}|${r.feito}|${r.volta}|${r.placa}`);
  ok(R.length === 2 && R.find(r => r.servico === 'Troca de óleo').volta === hoje && R.find(r => r.servico === 'Alinhamento').volta === addMeses(feito, 3), 'datas de volta', out);
  out.c.hoje = await txt('#rt-hoje .rt-lista li');
  ok(out.c.hoje.length === 2, 'dois para chamar hoje', out);
  out.c.kpis = await txt('#rt-kpis .kpi');
  out.c.badge = await A.evaluate(() => document.querySelector('#badge-retornos').textContent);
  ok(out.c.badge === '2', 'contador no menu', out);
  await A.screenshot({ path: path.join(SP, 'teste/r4-chamar.png') });

  // 4) chamar no WhatsApp: abre wa.me com a mensagem e marca avisado
  const idOleo = R.find(r => r.servico === 'Troca de óleo').id, idAlin = R.find(r => r.servico === 'Alinhamento').id;
  await A.click(`#rt-hoje [data-acao="rt-chamar"][data-id="${idOleo}"]`); await A.waitForTimeout(400);
  out.c.url = await A.evaluate(() => window.__abertos[0]);
  ok(out.c.url === 'https://wa.me/5533999998888?text=' + encodeURIComponent('Olá, João! Aqui é da PneusBR. Já faz 6 meses da troca de óleo do seu Gol: está na hora de fazer de novo. Quer agendar um horário?'), 'link do WhatsApp', out);
  R = await rets(); ok(R.find(r => r.id === idOleo).avisadoEm && R.find(r => r.id === idOleo).avisos.length === 1, 'marcou avisado', out);
  out.c.hoje2 = (await txt('#rt-hoje .rt-lista li')).length;
  ok(out.c.hoje2 === 1, 'saiu da lista de hoje', out);

  // 5) ficha: voltou hoje e lembra a próxima (na visão Retornos)
  await A.click('[data-acao="rt-visao"][data-v="retornos"]'); await A.waitForTimeout(150);
  await A.click('[data-acao="rt-filtro"][data-v="avisado"]'); await A.waitForTimeout(150);
  await A.click(`#rt-tab tr[data-id="${idOleo}"]`); await A.waitForTimeout(250);
  out.c.ficha = (await txt('#drawer-pn'))[0]?.slice(0, 400);
  await A.screenshot({ path: path.join(SP, 'teste/r5-ficha.png') });
  await A.click('[data-acao="rt-voltou"]'); await A.waitForTimeout(400);
  R = await rets();
  const novo = R.find(r => r.origem?.anterior === idOleo);
  ok(R.find(r => r.id === idOleo).status === 'voltou' && novo && novo.volta === addMeses(hoje, 6) && novo.tel === '(33) 99999-8888', 'voltou e criou o próximo', out);
  out.c.voltaramKpi = (await txt('#rt-kpis .kpi'))[3];
  ok(/1 voltaram no mês/i.test(out.c.voltaramKpi), 'voltaram no mês', out);

  // 6) adiar o alinhamento 7 dias
  await A.click(`#rt-hoje [data-acao="rt-abrir"][data-id="${idAlin}"]`); await A.waitForTimeout(250);
  await A.click('[data-acao="rt-adiar"][data-dias="7"]'); await A.waitForTimeout(300);
  R = await rets(); ok(R.find(r => r.id === idAlin).adiadoPara === dk(new Date(Date.now() + 7 * 864e5)), 'adiado 7 dias', out);
  out.c.hoje3 = await txt('#rt-hoje');
  ok(/ninguém hoje/.test(out.c.hoje3[0] || ''), 'ninguém para chamar', out);

  // 7) cadastrar de novo a mesma troca de óleo fecha o lembrete aberto
  await A.click('[data-acao="rt-novo"]'); await A.waitForTimeout(200);
  await A.fill('#rt-nome', 'João Silva'); await A.dispatchEvent('#rt-nome', 'input'); await A.waitForTimeout(100);
  out.c.completou = await A.evaluate(() => [document.querySelector('#rt-tel').value, document.querySelector('#rt-veic').value]);
  ok(out.c.completou[0] === '(33) 99999-8888' && out.c.completou[1] === 'Gol', 'completa dados do cliente', out);
  await A.check('[data-rtsv="oleo"]'); await A.click('[data-acao="rt-salvar-novo"]'); await A.waitForTimeout(400);
  R = await rets(); ok(R.find(r => r.id === novo.id).status === 'voltou' && R.filter(r => r.servico === 'Troca de óleo' && r.status === 'aberto').length === 1, 'novo cadastro fecha o anterior', out);

  // 8) Registrar: depois de um alinhamento aparece "Cadastrar retorno"
  await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(400);
  await A.keyboard.press('F4'); await A.waitForTimeout(200);
  await A.click('#quem-chips [data-quem="lucas"]'); await A.waitForTimeout(150);
  await A.fill('#scan', 'S01'); await A.press('#scan', 'Enter'); await A.waitForTimeout(400);
  out.c.uret = (await txt('#ultimo .u-ret'))[0];
  ok(/Cadastre o cliente/.test(out.c.uret || ''), 'atalho no Registrar', out);
  await A.screenshot({ path: path.join(SP, 'teste/r6-registrar.png') });
  await A.click('[data-acao="rt-de-item"]'); await A.waitForTimeout(250);
  out.c.preAlin = await A.evaluate(() => document.querySelector('[data-rtsv="alinhamento"]').checked && !document.querySelector('[data-rtsv="oleo"]').checked);
  ok(out.c.preAlin, 'alinhamento já marcado', out);
  await A.fill('#rt-nome', 'Maria'); await A.fill('#rt-tel', '999991111'); await A.click('[data-acao="rt-salvar-novo"]'); await A.waitForTimeout(400);
  out.c.uret2 = (await txt('#ultimo .u-ret'))[0];
  ok(/Retorno cadastrado: Maria/.test(out.c.uret2 || ''), 'mostra o retorno cadastrado', out);
  // montagem de pneu não tem prazo: sem atalho
  await A.fill('#scan', 'S02'); await A.press('#scan', 'Enter'); await A.waitForTimeout(400);
  out.c.semAtalho = (await txt('#ultimo .u-ret'))[0];
  ok(/Ligue este serviço a um cliente/.test(out.c.semAtalho || ''), 'serviço sem prazo: atalho para ligar ao cliente', out);
  R = await rets(); const maria = R.find(r => r.nome === 'Maria');
  ok(maria && maria.origem?.item && maria.volta === addMeses(hoje, 3), 'retorno da Maria', out);
  // número sem DDD vira 33
  await A.evaluate(() => { location.hash = '#retornos'; }); await A.waitForTimeout(400);
  await A.click('[data-acao="rt-filtro"][data-v="todos"]'); await A.waitForTimeout(150);
  await A.click(`#rt-tab tr[data-id="${maria.id}"]`); await A.waitForTimeout(250);
  await A.fill('#re-volta', hoje); await A.click('[data-acao="rt-salvar"]'); await A.waitForTimeout(300);
  await A.click('[data-acao="fechar-drawer"].primary'); await A.waitForTimeout(200);
  await A.click(`#rt-hoje [data-acao="rt-chamar"][data-id="${maria.id}"]`); await A.waitForTimeout(300);
  out.c.urlMaria = await A.evaluate(() => window.__abertos[window.__abertos.length - 1]);
  ok(/^https:\/\/wa\.me\/5533999991111\?text=Ol%C3%A1%2C%20Maria!/.test(out.c.urlMaria || ''), 'DDD 33 quando falta', out);
  ok(/do%20alinhamento%20do%20seu%20carro/.test(out.c.urlMaria || ''), 'sem veículo: "do seu carro"', out);

  // 9) celular e tema noturno
  await A.click('[data-acao="rt-filtro"][data-v="todos"]'); await A.waitForTimeout(150);
  await A.setViewportSize({ width: 390, height: 844 }); await A.waitForTimeout(400);
  out.c.rolaLado = await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!out.c.rolaLado, 'sem rolagem lateral em 390px', out);
  await A.screenshot({ path: path.join(SP, 'teste/r7-celular.png') });
  await A.click('[data-acao="rt-novo"]'); await A.waitForTimeout(250);
  await A.screenshot({ path: path.join(SP, 'teste/r8-celular-cadastro.png') });
  await A.click('#drawer-pn [data-acao="fechar-drawer"].ghost'); await A.waitForTimeout(150);
  await A.evaluate(() => document.documentElement.setAttribute('data-tema', 'escuro')); await A.setViewportSize({ width: 1360, height: 900 }); await A.waitForTimeout(300);
  await A.screenshot({ path: path.join(SP, 'teste/r9-noturno.png') });

  await b.close(); srv.kill();
  fs.writeFileSync(path.join(SP, 'out-retornos.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ falhas: out.falhas, errors: out.errors, kpis: out.c.kpis, hoje: out.c.hoje, url: out.c.url, uret: out.c.uret, ficha: out.c.ficha }, null, 1));
})();
