// Teste (16/11/2026): tela de início com o carro. Abre no início, o carro chega pela esquerda e para; ao ir para
// outra aba ele arranca para a direita e a tela some; menu, sino e números ficam platinados só no início;
// o leitor continua indo para Registrar; a animação pode ser desligada; celular sem rolagem lateral. Dados fictícios.
// Uso: ./testes/preparar-site.sh <rascunho> && node testes/inicio.js <rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos3.xlsx.b64'), 'utf8');
const dia = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toLocaleDateString('sv'); };
const HOJE = dia(0), ONTEM = dia(-1);
const migr = {
  'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'centavo', ajusteMercado: 0, margem: 30, markupCat: {}, variaveis: [] } },
  'pagar/np-teste-1': { path: 'pagar/np-teste-1', colecao: 'pagar', doc_id: 'np-teste-1', data: { parte: 'Fornecedor Teste', doc: '', numero: '1', descricao: 'peças', emissao: ONTEM, itens: [], total: 70, parcelas: [{ n: 1, venc: HOJE, valor: 70 }], categoria: 'Peças', criadoEm: 1, por: null, movimentou: false, movs: [] } }
};
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8786', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} };
  const prep = async ctx => {
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  };
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await prep(ctx);
  const A = await ctx.newPage();
  A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) out.errors.push(m.text()); });
  await A.goto('http://127.0.0.1:8786/#produtos'); await A.waitForTimeout(700);
  out.c.antesLogin = await A.evaluate(() => ({ hash: location.hash, tab: window.__api.S.tab, anims: document.getAnimations().filter(a => a.playState === 'running' && a.effect?.target?.closest?.('#inicio')).length }));
  ok(out.c.antesLogin.hash === '#inicio' && out.c.antesLogin.tab === 'inicio', 'abre no início mesmo com outro endereço', out);
  ok(out.c.antesLogin.anims === 0, 'carro espera a tela de login sair', out);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]');
  await A.waitForFunction(() => document.getElementById('login').hidden, null, { timeout: 8000 });
  await A.waitForTimeout(450);
  out.c.chegando = await A.evaluate(() => { const r = document.querySelector('#inicio svg.cp').getBoundingClientRect(); return { x: Math.round(r.left), anims: document.querySelector('#inicio svg.cp').getAnimations().length }; });
  await A.screenshot({ path: path.join(SP, 'teste/in1-chegando.png') });
  await A.waitForTimeout(2000);
  out.c.parado = await A.evaluate(() => {
    const el = document.getElementById('inicio'), svg = el.querySelector('svg.cp'), r = svg.getBoundingClientRect(), cs = getComputedStyle(document.querySelector('.rail'));
    return { visivel: !el.hidden, x: Math.round(r.left), w: Math.round(r.width), corpoBranco: document.body.classList.contains('em-inicio'), rail: cs.backgroundColor, marcaAtual: document.querySelector('.rail .marca').getAttribute('aria-current'), idle: document.getAnimations().filter(a => a.playState === 'running').length, atalhos: [...el.querySelectorAll('.in-atalhos a')].map(a => a.textContent.trim()), bola: getComputedStyle(document.querySelector('#aviso .aviso-bola') || document.body).backgroundColor, cubo: getComputedStyle(document.querySelector('.rail .marca .cubo')).fill };
  });
  ok(out.c.chegando.x < out.c.parado.x - 200 && out.c.chegando.anims > 0, 'carro chega vindo da esquerda', out);
  ok(out.c.parado.visivel && out.c.parado.corpoBranco && out.c.parado.marcaAtual === 'page', 'início aberto e marcado no menu', out);
  ok(out.c.parado.rail === 'rgb(52, 55, 59)', 'menu cinza-escuro no início', out);
  ok(out.c.parado.atalhos.join('|') === 'Registrar|Produtos|Serviços|Movimentações|Notas a pagar|Notas a receber|Clientes', 'sete atalhos', out);
  ok(out.c.parado.bola === 'rgba(0, 0, 0, 0)', 'aviso sem a bola vermelha no início', out);
  ok(out.c.parado.cubo === 'rgb(229, 228, 226)', 'roda do menu platinada no início', out);
  ok(out.c.parado.idle >= 2, 'carro parado com motor ligado e brilho', out);
  await A.mouse.move(800, 10);
  await A.screenshot({ path: path.join(SP, 'teste/in2-inicio.png') });

  // sair para Produtos: o carro arranca para a direita, a tela nova aparece e o menu volta ao normal
  await A.click('.rail a[data-tab="produtos"]'); await A.waitForTimeout(520);
  out.c.saindo = await A.evaluate(() => { const el = document.getElementById('inicio'), r = el.querySelector('svg.cp').getBoundingClientRect(); return { saindo: el.classList.contains('saindo'), x: Math.round(r.left), tab: window.__api.S.tab, prod: !document.querySelector('[data-view="produtos"]').hidden, corpo: document.body.classList.contains('em-inicio'), cubo: getComputedStyle(document.querySelector('.rail .marca .cubo')).fill }; });
  await A.screenshot({ path: path.join(SP, 'teste/in3-saindo.png') });
  await A.waitForTimeout(900);
  out.c.saiu = await A.evaluate(() => ({ escondido: document.getElementById('inicio').hidden, sobra: document.getAnimations().filter(a => a.effect?.target?.closest?.('#inicio')).length, bola: getComputedStyle(document.querySelector('#aviso .aviso-bola, #aviso .aviso-card') || document.body).borderTopColor }));
  ok(out.c.saindo.saindo && out.c.saindo.x > out.c.parado.x + 60 && out.c.saindo.tab === 'produtos' && out.c.saindo.prod, 'carro arranca para a direita e Produtos aparece', out);
  ok(!out.c.saindo.corpo && out.c.saindo.cubo === 'rgb(180, 57, 62)', 'menu e roda voltam às cores de sempre', out);
  ok(out.c.saiu.escondido && out.c.saiu.sobra === 0, 'início some depois que o carro sai', out);
  await A.screenshot({ path: path.join(SP, 'teste/in4-produtos.png') });

  // voltar pela roda: o carro chega de novo
  await A.click('.rail .marca'); await A.waitForTimeout(300);
  out.c.volta = await A.evaluate(() => ({ tab: window.__api.S.tab, visivel: !document.getElementById('inicio').hidden, anims: document.querySelector('#inicio svg.cp').getAnimations().length }));
  ok(out.c.volta.tab === 'inicio' && out.c.volta.visivel && out.c.volta.anims > 0, 'roda volta ao início e o carro chega', out);
  await A.waitForTimeout(1900);

  // leitor no início: vai para Registrar
  const t0 = await A.evaluate(() => Date.now());
  await A.keyboard.type('BA8003', { delay: 8 }); await A.keyboard.press('Enter'); await A.waitForTimeout(700);
  out.c.leitor = await A.evaluate(t0 => { const S = window.__api.S; let it = null; for (const L of S.ledgers.values()) for (const x of L.itens || []) if (x.k === 'mov' && x.t >= t0) it = x; return { tab: S.tab, item: it && it.nome }; }, t0);
  ok(out.c.leitor.tab === 'registrar' && out.c.leitor.item, 'leitura no início vai para Registrar', out);
  await A.waitForTimeout(900);

  // desligar a animação nas Configurações
  await A.click('#btn-ajustes'); await A.waitForTimeout(300);
  await A.uncheck('#a-anim'); await A.click('[data-acao="salvar-ajustes"]'); await A.waitForTimeout(300);
  await A.click('.rail .marca'); await A.waitForTimeout(80);
  out.c.semAnim = await A.evaluate(() => ({ visivel: !document.getElementById('inicio').hidden, anims: document.querySelector('#inicio svg.cp').getAnimations().length }));
  await A.click('.rail a[data-tab="servicos"]'); await A.waitForTimeout(300);
  out.c.semAnimSai = await A.evaluate(() => document.getElementById('inicio').hidden);
  ok(out.c.semAnim.visivel && out.c.semAnim.anims === 0 && out.c.semAnimSai, 'sem animação: início aparece e some sem o carro andar', out);

  // celular: sem rolagem lateral, com tema noturno
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  await prep(ctx2);
  await ctx2.addInitScript(db => { localStorage.setItem('mock-sb-db', db); }, await A.evaluate(() => localStorage.getItem('mock-sb-db')));
  const M = await ctx2.newPage(); M.on('pageerror', e => out.errors.push('celular: ' + e.message));
  await M.goto('http://127.0.0.1:8786/'); await M.waitForTimeout(600);
  if (await M.evaluate(() => !document.getElementById('login').hidden && !document.getElementById('f-entrar').hidden)) { await M.fill('#le-email', 'loja@pneusbr.com').catch(() => { }); await M.fill('#le-senha', 'senha-forte-1').catch(() => { }); await M.click('#f-entrar button[type=submit]').catch(() => { }); }
  await M.waitForTimeout(2800);
  out.c.cel = await M.evaluate(() => ({ login: !document.getElementById('login').hidden, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tab: window.__api && window.__api.S.tab, atalhosFora: [...document.querySelectorAll('.in-atalhos a')].filter(a => { const r = a.getBoundingClientRect(); return r.right > innerWidth + 1 || r.bottom > innerHeight + 1; }).length }));
  ok(out.c.cel.sw <= out.c.cel.cw, 'celular sem rolagem lateral', out);
  ok(out.c.cel.atalhosFora === 0, 'atalhos cabem na tela do celular', out);
  await M.screenshot({ path: path.join(SP, 'teste/in5-celular.png') });

  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
  process.exit(out.falhas.length || out.errors.length ? 1 : 0);
})();
