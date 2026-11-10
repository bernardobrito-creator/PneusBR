// Teste: integrantes, vínculo obrigatório nos serviços, balanço por integrante e nota fiscal (NFS-e e peças)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const migr = {
  'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { ajusteMercado: 30, arredondar: 'inteiro', faturamento: 0, loja: 'PneusBR', margem: 30, markup: 1.43, markupCat: {}, markupModo: 'planilha', metaMensal: 0, variaveis: [] } },
  'servicos/sw51sxzso': { path: 'servicos/sw51sxzso', colecao: 'servicos', doc_id: 'sw51sxzso', data: { ativo: true, cod: 'S01', nome: 'Montagem de pneu P', preco: 15 } },
  'servicos/salinh': { path: 'servicos/salinh', colecao: 'servicos', doc_id: 'salinh', data: { ativo: true, cod: 'S02', nome: 'Alinhamento P', preco: 60 } }
};
const ok = (cond, msg, out) => { if (!cond) out.falhas.push(msg); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8768', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} };
  const prep = async (ctx, lsCopia) => {
    if (lsCopia) await ctx.addInitScript(l => { if (!sessionStorage.getItem('copiado')) { for (const [k, v] of l) localStorage.setItem(k, v); sessionStorage.setItem('copiado', '1'); } }, lsCopia);
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/nfse\.gov\.br|fazenda\.mg\.gov\.br/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>emissor</h1>' }));
    await ctx.route(/brasilapi\.com\.br\/api\/cnpj\/v1\/(\d+)/, r => {
      const c = r.request().url().split('/').pop();
      if (c === '11222333000181') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ razao_social: 'CLAUDIO SOUZA 01234567890', municipio: 'DIAMANTINA', uf: 'MG', opcao_pelo_mei: true, descricao_situacao_cadastral: 'ATIVA', email: 'CLAUDIO@EXEMPLO.COM', ddd_telefone_1: '3835310000' }) });
      if (c === '06990590000123') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ razao_social: 'TRANSPORTES SERRA LTDA', municipio: 'CURVELO', uf: 'MG', opcao_pelo_mei: false, descricao_situacao_cadastral: 'ATIVA' }) });
      return r.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"CNPJ não encontrado"}' });
    });
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  };
  const nova = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => out.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|404/.test(m.text())) out.errors.push(m.text()); }); return p; };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await prep(ctx);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8768' });
  const A = await nova(ctx);
  await A.goto('http://127.0.0.1:8768/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);
  const db = () => A.evaluate(() => JSON.parse(localStorage.getItem('mock-sb-db')).docs);
  const scan = async v => { await A.fill('#scan', v); await A.press('#scan', 'Enter'); await A.waitForTimeout(250); };
  const ultimoItem = () => A.evaluate(() => { const S = window.__api.S; const f = [...S.ledgers.values()].flatMap(L => L.itens).filter(i => i.k !== 'estorno').sort((a, b) => b.t - a.t)[0]; return f && { k: f.k, nome: f.nome, quem: f.quem || null, id: f.id }; });

  // 1) Registrar: botões de quem fez no modo Saída
  await A.keyboard.press('F4'); await A.waitForTimeout(200);
  out.c.chips = await A.evaluate(() => ({ visivel: !document.querySelector('#linha-quem').hidden, nomes: [...document.querySelectorAll('#quem-chips [data-quem]')].map(b => b.textContent) }));
  ok(out.c.chips.visivel && out.c.chips.nomes.join(',') === 'Brito,Brenda,Cláudio,Lucas,Bernardo,Vinícius', 'chips de quem fez', out);
  // serviço sem escolher: pergunta
  await scan('S01');
  out.c.pergunta = await A.evaluate(() => ({ card: !!document.querySelector('.pede-quem'), botoes: [...document.querySelectorAll('.pede-quem .btn')].map(b => b.textContent), titulo: document.querySelector('#ultimo .u-nome')?.textContent }));
  ok(out.c.pergunta.card && out.c.pergunta.botoes.length === 6, 'pergunta quem fez', out);
  const antes = await ultimoItem(); ok(!antes, 'não registrou antes de escolher', out);
  await A.screenshot({ path: path.join(SP, 'teste/i1-pergunta.png') });
  await A.click('.pede-quem .btn:has-text("Cláudio")'); await A.waitForTimeout(300);
  out.c.s1 = await ultimoItem(); ok(out.c.s1?.k === 'serv' && out.c.s1.quem === 'claudio', 'serviço com Cláudio', out);
  out.c.ultimoQuem = await A.evaluate(() => document.querySelector('#u-quem')?.value);
  ok(out.c.ultimoQuem === 'claudio', 'select no último', out);
  // escolher Lucas antes: registra direto
  await A.click('#quem-chips [data-quem="lucas"]'); await A.waitForTimeout(150);
  out.c.dica = await A.evaluate(() => document.querySelector('#quem-chips .dica-quem').textContent);
  await scan('S02'); out.c.s2 = await ultimoItem(); ok(out.c.s2?.quem === 'lucas' && out.c.s2.nome === 'Alinhamento P', 'serviço direto com Lucas', out);
  await scan('S01'); out.c.s3 = await ultimoItem(); ok(out.c.s3?.quem === 'lucas', 'segundo serviço com Lucas', out);
  // peça vendida com Lucas escolhido
  await scan('7891234567895'); out.c.p1 = await ultimoItem(); ok(out.c.p1?.k === 'mov' && out.c.p1.quem === 'lucas', 'peça com Lucas', out);
  // tirar a escolha: peça sem quem (opcional)
  await A.click('#quem-chips [data-quem="lucas"]'); await A.waitForTimeout(150);
  await scan('7890000000031'); out.c.p2 = await ultimoItem(); ok(out.c.p2?.k === 'mov' && !out.c.p2.quem, 'peça sem quem', out);
  // trocar quem fez no último registro (a peça): vira Brenda
  await A.selectOption('#u-quem', 'brenda'); await A.waitForTimeout(300);
  out.c.vinculo = (await db())['vinculos/' + out.c.p2.id]?.data;
  ok(out.c.vinculo?.quem === 'brenda', 'vínculo salvo', out);
  out.c.fita = await A.evaluate(() => [...document.querySelectorAll('#fita-lista .f-desc small')].map(e => e.textContent));
  ok(out.c.fita.some(t => /Cláudio/.test(t)) && out.c.fita.some(t => /Brenda/.test(t)), 'fita mostra quem', out);
  await A.screenshot({ path: path.join(SP, 'teste/i2-registrar.png') });

  // 2) Cadastro do CNPJ do Cláudio (busca na Receita)
  await A.evaluate(() => { location.hash = '#integrantes'; }); await A.waitForTimeout(400);
  out.c.cards = await A.evaluate(() => [...document.querySelectorAll('#i-cards .int-card')].map(c => c.innerText.replace(/\s+/g, ' ')));
  ok(out.c.cards.length === 6, '6 cards', out);
  await A.click('#i-cards [data-acao="abrir-integrante"][data-id="claudio"]'); await A.waitForTimeout(300);
  await A.fill('#ig-cnpj', '11.222.333/0001-81'); await A.waitForTimeout(800);
  out.c.cad = await A.evaluate(() => ({ razao: document.querySelector('#ig-razao').value, mun: document.querySelector('#ig-mun').value, uf: document.querySelector('#ig-uf').value, mei: document.querySelector('#ig-mei').checked, st: document.querySelector('#ig-st').textContent }));
  ok(out.c.cad.razao === 'CLAUDIO SOUZA 01234567890' && out.c.cad.mun === 'Diamantina' && out.c.cad.uf === 'MG', 'busca do CNPJ', out);
  await A.screenshot({ path: path.join(SP, 'teste/i3-cadastro.png') });
  await A.click('[data-acao="ig-salvar"]'); await A.waitForTimeout(400);
  out.c.integDoc = (await db())['config/integrantes']?.data?.lista?.find(x => x.id === 'claudio');
  ok(out.c.integDoc?.cnpj === '11222333000181' && out.c.integDoc.cTrib === '140101', 'integrante salvo', out);
  // CNPJ inválido não salva
  await A.click('#i-cards [data-acao="abrir-integrante"][data-id="lucas"]'); await A.waitForTimeout(300);
  await A.fill('#ig-cnpj', '11.222.333/0001-82'); await A.click('[data-acao="ig-salvar"]'); await A.waitForTimeout(200);
  out.c.cnpjErrado = await A.evaluate(() => document.querySelector('#ig-erro').textContent);
  ok(/não confere/.test(out.c.cnpjErrado), 'CNPJ inválido', out);
  await A.keyboard.press('Escape');

  // serviço antigo sem quem fez (registro de antes do vínculo)
  await A.evaluate(() => { const S = window.__api.S, h = new Date(); const d = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`; S.ledgers.set(d + '_velho_0', { id: d + '_velho_0', data: d, sessao: 'velho', criadoEm: Date.now() - 9e6, itens: [{ id: 'legado01', t: Date.now() - 9e6, k: 'serv', sid: 'sw51sxzso', nome: 'Montagem de pneu P', cod: 'S01', qtd: 2, vu: 15, total: 30, caixa: 30, pg: 'dinheiro' }] }); location.hash = '#registrar'; });
  await A.waitForTimeout(200); await A.evaluate(() => { location.hash = '#integrantes'; }); await A.waitForTimeout(400);
  out.c.semCard = await A.evaluate(() => document.querySelector('#i-cards .int-card.sem')?.innerText.replace(/\s+/g, ' '));
  ok(!!out.c.semCard, 'card sem quem fez', out);
  await A.click('#i-cards .int-card.sem [data-acao="int-filtro"]'); await A.waitForTimeout(200);
  out.c.linhasSem = await A.evaluate(() => [...document.querySelectorAll('#i-tab tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
  await A.selectOption('#i-tab select[data-atrib="legado01"]', 'fabio'); await A.waitForTimeout(400);
  out.c.semDepois = await A.evaluate(() => !!document.querySelector('#i-cards .int-card.sem'));
  ok(!out.c.semDepois, 'atribuído ao Fábio', out);
  await A.click('#i-filtro [data-v="todos"]'); await A.waitForTimeout(200);
  out.c.cardsDepois = await A.evaluate(() => [...document.querySelectorAll('#i-cards .int-card')].map(c => c.querySelector('h2').textContent + ' | ' + c.querySelector('dl').innerText.replace(/\s+/g, ' ')));
  await A.screenshot({ path: path.join(SP, 'teste/i4-integrantes.png'), fullPage: true });

  // 3) NFS-e pelo Cláudio, cliente CPF
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(200);
  await A.click('#btn-ajustes'); await A.waitForTimeout(300);
  out.c.icones = await A.evaluate(() => [...document.querySelectorAll('.cfg-icones a')].map(a => a.getAttribute('href') + ' ' + a.dataset.tip));
  ok(out.c.icones.some(t => t.startsWith('#nfse Gerar nota fiscal')) && out.c.icones.some(t => t.startsWith('#integrantes')), 'ícones em Configurações', out);
  await A.click('.cfg-icones a[href="#nfse"]'); await A.waitForTimeout(400);
  out.c.nfInicio = await A.evaluate(() => ({ visivel: !document.querySelector('[data-view="nfse"]').hidden, quem: [...document.querySelectorAll('#nf-quem .chip')].map(c => c.textContent), itens: document.querySelectorAll('#nf-itens input[type=checkbox]').length, falta: [...document.querySelectorAll('#nf-previa .nf-falta li')].map(l => l.textContent.trim()) }));
  await A.click('#nf-quem [data-id="claudio"]'); await A.waitForTimeout(200);
  out.c.nfItensClaudio = await A.evaluate(() => [...document.querySelectorAll('#nf-itens label')].map(l => l.innerText.replace(/\s+/g, ' ')));
  ok(out.c.nfItensClaudio.length === 1 && /Montagem/.test(out.c.nfItensClaudio[0]), 'só serviço do Cláudio (e sem quem)', out);
  await A.check('#nf-itens input[data-nfsel]'); await A.waitForTimeout(150);
  await A.fill('#nf-doc', '52998224725'); await A.waitForTimeout(200);
  out.c.cpfSt = await A.evaluate(() => document.querySelector('#nf-doc-st').textContent);
  await A.fill('#nf-nome', 'João da Silva'); await A.fill('#nf-placa', 'abc1d23'); await A.waitForTimeout(150);
  out.c.previa = await A.evaluate(() => ({ dl: [...document.querySelectorAll('#nf-previa .nf-dl > div')].map(d => d.querySelector('dt').textContent + ': ' + d.querySelector('dd').textContent.replace(/\n/g, ' / ')), falta: document.querySelectorAll('#nf-previa .nf-falta li').length, total: document.querySelector('#nf-previa .nf-total b').textContent, desc: document.querySelector('#nf-desc').value }));
  ok(out.c.previa.falta === 0 && /15,00/.test(out.c.previa.total) && /placa ABC1D23/.test(out.c.previa.desc), 'prévia completa', out);
  await A.screenshot({ path: path.join(SP, 'teste/i5-nfse.png'), fullPage: true });
  const [pop] = await Promise.all([ctx.waitForEvent('page'), A.click('#nf-previa [data-acao="nf-abrir"]')]);
  await A.waitForTimeout(400);
  out.c.popup = pop.url(); await pop.close();
  ok(/nfse\.gov\.br\/EmissorNacional/.test(out.c.popup), 'abriu o Emissor Nacional', out);
  out.c.clip = await A.evaluate(() => navigator.clipboard.readText());
  ok(/11\.222\.333\/0001-81/.test(out.c.clip) && /14\.01\.01/.test(out.c.clip) && /15,00/.test(out.c.clip), 'copiou os dados', out);
  out.c.nfSalva = Object.values(await db()).filter(r => r.colecao === 'notasfiscais').map(r => ({ status: r.data.status, quem: r.data.quem, valor: r.data.valor, tomador: r.data.tomador, itens: r.data.itens.length, cnpj: r.data.prestador.cnpj }));
  ok(out.c.nfSalva.length === 1 && out.c.nfSalva[0].status === 'preparada', 'nota preparada salva', out);
  out.c.cliente = (await db())['clientes/52998224725']?.data;
  out.c.legadoVinculo = (await db())['vinculos/legado01']?.data;
  // marcar como emitida
  await A.fill('#nf-previa input[id^="nf-num-"]', '123'); await A.click('#nf-previa [data-acao="nf-emitida"]'); await A.waitForTimeout(400);
  out.c.emitida = Object.values(await db()).filter(r => r.colecao === 'notasfiscais').map(r => r.data.status + ' ' + r.data.numero);
  ok(out.c.emitida[0] === 'emitida 123', 'marcada como emitida', out);
  out.c.tabelaNf = await A.evaluate(() => [...document.querySelectorAll('#nf-tab tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
  out.c.formLimpo = await A.evaluate(() => ({ doc: document.querySelector('#nf-doc').value, itens: document.querySelectorAll('#nf-itens input[data-nfsel]').length }));
  ok(out.c.formLimpo.doc === '' && out.c.formLimpo.itens === 0, 'formulário limpo e serviço já usado sai da lista', out);

  // 4) Nota de peça pelo Lucas, cliente CNPJ com busca do nome
  await A.click('#nf-tipo [data-v="nfe"]'); await A.waitForTimeout(150);
  await A.click('#nf-quem [data-id="lucas"]'); await A.waitForTimeout(150);
  out.c.pecasLucas = await A.evaluate(() => [...document.querySelectorAll('#nf-itens label')].map(l => l.innerText.replace(/\s+/g, ' ')));
  await A.check('#nf-itens input[data-nfsel]');
  await A.fill('#nf-doc', '06.990.590/0001-23'); await A.waitForTimeout(900);
  out.c.cnpjCliente = await A.evaluate(() => ({ nome: document.querySelector('#nf-nome').value, st: document.querySelector('#nf-doc-st').textContent }));
  ok(out.c.cnpjCliente.nome === 'TRANSPORTES SERRA LTDA', 'nome do cliente pela Receita', out);
  out.c.previaPeca = await A.evaluate(() => ({ dl: [...document.querySelectorAll('#nf-previa .nf-dl dt')].map(d => d.textContent), falta: [...document.querySelectorAll('#nf-previa .nf-falta li')].map(l => l.textContent.trim()), link: document.querySelector('#nf-previa [data-acao="nf-abrir"]').href }));
  ok(/fazenda\.mg\.gov\.br/.test(out.c.previaPeca.link) && out.c.previaPeca.dl.includes('CFOP'), 'prévia da nota de peças', out);
  await A.screenshot({ path: path.join(SP, 'teste/i6-pecas.png'), fullPage: true });
  // falta CNPJ do Lucas: botão abrir emissor não abre
  await A.click('#nf-previa [data-acao="nf-abrir"]'); await A.waitForTimeout(300);
  out.c.semCnpjLucas = Object.values(await db()).filter(r => r.colecao === 'notasfiscais').length;
  ok(out.c.semCnpjLucas === 1, 'não gera sem CNPJ do integrante', out);

  // 5) Nota a receber com serviço: quem fez é obrigatório
  await A.evaluate(() => { location.hash = '#receber'; }); await A.waitForTimeout(300);
  await A.click('[data-acao="nova-nota"][data-col="receber"]'); await A.waitForTimeout(300);
  await A.fill('#nd-leitor', 'S02'); await A.press('#nd-leitor', 'Enter'); await A.waitForTimeout(200);
  await A.fill('[data-nd="parte"]', 'Maria'); await A.dispatchEvent('[data-nd="parte"]', 'input');
  await A.click('[data-acao="nd-salvar"]'); await A.waitForTimeout(200);
  out.c.ndErro = await A.evaluate(() => ({ erro: document.querySelector('#nd-erro').textContent, chips: [...document.querySelectorAll('#nd-quem .chip')].map(c => c.textContent), rot: document.querySelector('#nd-quem .eyebrow')?.textContent }));
  ok(out.c.ndErro.erro === 'Escolha quem fez o serviço.', 'nota a receber pede quem fez', out);
  await A.click('#nd-quem [data-id="brenda"]'); await A.click('[data-acao="nd-salvar"]'); await A.waitForTimeout(400);
  out.c.ndServ = await ultimoItem(); ok(out.c.ndServ?.k === 'serv' && out.c.ndServ.quem === 'brenda', 'serviço da nota com Brenda', out);

  // 6) Balanço com o quadro por integrante (precisa da senha)
  await A.evaluate(() => { location.hash = '#balanco'; }); await A.waitForTimeout(300);
  await A.fill('#trava-senha', 'TREPNIAYKS'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(400);
  out.c.balancoQuem = await A.evaluate(() => [...document.querySelectorAll('#b-quem .rank li')].map(l => l.innerText.replace(/\s+/g, ' ')));
  ok(out.c.balancoQuem.length === 6, 'quadro do balanço', out);
  await A.evaluate(() => { location.hash = '#integrantes'; }); await A.waitForTimeout(300);
  out.c.cardsLiberado = await A.evaluate(() => [...document.querySelectorAll('#i-cards .int-card dl')].map(c => c.innerText.replace(/\s+/g, ' ')));
  out.c.notaNaTabela = await A.evaluate(() => [...document.querySelectorAll('#i-tab tbody td:last-child')].map(td => td.innerText.trim()));
  ok(out.c.notaNaTabela.some(t => /NFS-e nº 123/.test(t)), 'tabela mostra a nota emitida', out);

  // 7) celular e noturno
  const lsCopia = await A.evaluate(() => Object.entries(localStorage));
  const ctxM = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' }); await prep(ctxM, lsCopia);
  const M = await nova(ctxM);
  await M.goto('http://127.0.0.1:8768/#nfse'); await M.waitForTimeout(1800);
  out.c.mobileNf = await M.evaluate(() => document.documentElement.scrollWidth);
  await M.click('#nf-quem [data-id="claudio"]'); await M.waitForTimeout(200);
  await M.screenshot({ path: path.join(SP, 'teste/i7-mobile-nfse.png'), fullPage: true });
  await M.evaluate(() => { location.hash = '#integrantes'; }); await M.waitForTimeout(400);
  out.c.mobileInt = await M.evaluate(() => document.documentElement.scrollWidth);
  await M.screenshot({ path: path.join(SP, 'teste/i8-mobile-integrantes.png'), fullPage: true });
  await M.evaluate(() => { location.hash = '#registrar'; }); await M.waitForTimeout(300); await M.keyboard.press('F4'); await M.waitForTimeout(200);
  out.c.mobileReg = await M.evaluate(() => document.documentElement.scrollWidth);
  await M.screenshot({ path: path.join(SP, 'teste/i9-mobile-registrar.png') });
  ok(out.c.mobileNf <= 390 && out.c.mobileInt <= 390 && out.c.mobileReg <= 390, 'sem rolagem lateral no celular', out);
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
