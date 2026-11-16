// Teste (16/11/2026): tela de início com o carro 3D. Abre no início; o carro (docs/inicio3d.js + docs/carro.glb) carrega
// quando a tela de login sai; no início não há barra lateral, só a engrenagem embaixo à esquerda; "BR" em vermelho rubi;
// sino sem a bola vermelha; ao ir para outra aba o início some e o menu volta; o leitor vai para Registrar; a animação
// pode ser desligada; celular sem rolagem lateral. Dados fictícios.
// Uso: ./testes/preparar-site.sh <rascunho> && cp docs/inicio3d.js docs/carro.glb <rascunho>/site/ && node testes/inicio.js <rascunho>
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
  for (const f of ['inicio3d.js', 'carro.glb']) fs.copyFileSync(path.join(__dirname, '../docs', f), path.join(SP, 'site', f));
  const srv = spawn('python3', ['-m', 'http.server', '8786', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = { errors: [], falhas: [], c: {} };
  const prep = async ctx => {
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); await prep(ctx);
  const A = await ctx.newPage();
  A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) out.errors.push(m.text()); });
  await A.goto('http://127.0.0.1:8786/#produtos'); await A.waitForTimeout(700);
  out.c.antesLogin = await A.evaluate(() => ({ hash: location.hash, tab: window.__api.S.tab }));
  ok(out.c.antesLogin.hash === '#inicio' && out.c.antesLogin.tab === 'inicio', 'abre no início mesmo com outro endereço', out);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]');
  await A.waitForFunction(() => document.getElementById('login').hidden, null, { timeout: 8000 });
  await A.waitForFunction(() => document.querySelector('#in-palco3d canvas.cp3d'), null, { timeout: 30000 }).catch(() => { });
  await A.waitForTimeout(1500);
  out.c.inicio = await A.evaluate(() => {
    const el = document.getElementById('inicio'), cv = document.querySelector('#in-palco3d canvas.cp3d'), vis = s => { const e = document.querySelector(s); return e && getComputedStyle(e).visibility === 'visible'; };
    const r = el.getBoundingClientRect();
    return { visivel: !el.hidden, x: r.left, canvas: !!cv, cw: cv && cv.width, corpo: document.body.classList.contains('em-inicio'),
      menuLinks: vis('.rail a[data-tab="produtos"]'), marca: vis('.rail .marca'), engrenagem: vis('#btn-ajustes'),
      br: getComputedStyle(document.querySelector('.in-marca span')).color, atalhos: [...el.querySelectorAll('.in-atalhos a')].map(a => a.textContent.trim()),
      bola: getComputedStyle(document.querySelector('#aviso .aviso-bola') || document.body).backgroundColor,
      gearX: document.getElementById('btn-ajustes').getBoundingClientRect().left, gearY: document.getElementById('btn-ajustes').getBoundingClientRect().bottom };
  });
  ok(out.c.inicio.visivel && out.c.inicio.corpo && out.c.inicio.x === 0, 'início aberto ocupando a tela toda', out);
  ok(out.c.inicio.canvas && out.c.inicio.cw > 100, 'carro 3D carregado', out);
  ok(!out.c.inicio.menuLinks && !out.c.inicio.marca && out.c.inicio.engrenagem, 'sem barra lateral: só a engrenagem', out);
  ok(out.c.inicio.gearX < 60 && out.c.inicio.gearY > 740, 'engrenagem no canto de baixo à esquerda', out);
  ok(out.c.inicio.br === 'rgb(155, 17, 30)', 'BR em vermelho rubi', out);
  ok(out.c.inicio.atalhos.join('|') === 'Registrar|Produtos|Serviços|Movimentações|Notas a pagar|Notas a receber|Clientes', 'sete atalhos', out);
  ok(out.c.inicio.bola === 'rgba(0, 0, 0, 0)', 'aviso sem a bola vermelha no início', out);
  await A.screenshot({ path: path.join(SP, 'teste/in1-inicio3d.png'), timeout: 120000 });

  // sair para Produtos pelo atalho: o menu volta na hora e o início some
  await A.click('.in-atalhos a[href="#produtos"]'); await A.waitForTimeout(150);
  out.c.saindo = await A.evaluate(() => ({ saindo: document.getElementById('inicio').classList.contains('saindo'), tab: window.__api.S.tab, prod: !document.querySelector('[data-view="produtos"]').hidden, corpo: document.body.classList.contains('em-inicio'), menu: getComputedStyle(document.querySelector('.rail a[data-tab="produtos"]')).visibility }));
  ok(out.c.saindo.saindo && out.c.saindo.tab === 'produtos' && out.c.saindo.prod && !out.c.saindo.corpo && out.c.saindo.menu === 'visible', 'saída: Produtos aparece e o menu volta', out);
  await A.waitForFunction(() => document.getElementById('inicio').hidden, null, { timeout: 30000 }).catch(() => { });
  out.c.saiu = await A.evaluate(() => document.getElementById('inicio').hidden);
  ok(out.c.saiu, 'início some depois que o carro sai', out);
  await A.screenshot({ path: path.join(SP, 'teste/in2-produtos.png'), timeout: 120000 });

  // voltar pela roda do menu
  await A.click('.rail .marca'); await A.waitForTimeout(400);
  out.c.volta = await A.evaluate(() => ({ tab: window.__api.S.tab, visivel: !document.getElementById('inicio').hidden }));
  ok(out.c.volta.tab === 'inicio' && out.c.volta.visivel, 'roda do menu volta ao início', out);
  await A.waitForTimeout(2500);

  // leitor no início: vai para Registrar e registra
  const t0 = await A.evaluate(() => Date.now());
  await A.keyboard.type('BA8003', { delay: 8 }); await A.keyboard.press('Enter'); await A.waitForTimeout(900);
  out.c.leitor = await A.evaluate(t0 => { const S = window.__api.S; let it = null; for (const L of S.ledgers.values()) for (const x of L.itens || []) if (x.k === 'mov' && x.t >= t0) it = x; return { tab: S.tab, item: it && it.nome }; }, t0);
  ok(out.c.leitor.tab === 'registrar' && out.c.leitor.item, 'leitura no início vai para Registrar', out);
  await A.waitForFunction(() => document.getElementById('inicio').hidden, null, { timeout: 30000 }).catch(() => { });

  // desligar a animação nas Configurações: o início aparece e some sem o carro andar
  await A.click('#btn-ajustes'); await A.waitForTimeout(300);
  await A.uncheck('#a-anim'); await A.click('[data-acao="salvar-ajustes"]'); await A.waitForTimeout(300);
  await A.click('.rail .marca'); await A.waitForTimeout(300);
  out.c.semAnim = await A.evaluate(() => !document.getElementById('inicio').hidden);
  await A.click('#btn-ajustes'); await A.waitForTimeout(300);
  await A.evaluate(() => document.querySelector('[data-acao="fechar-drawer"]')?.click()); await A.waitForTimeout(200);
  await A.evaluate(() => { location.hash = '#servicos'; });
  await A.waitForFunction(() => document.getElementById('inicio').hidden, null, { timeout: 15000 }).catch(() => { });
  out.c.semAnimSai = await A.evaluate(() => document.getElementById('inicio').hidden);
  ok(out.c.semAnim && out.c.semAnimSai, 'sem animação: início aparece e some', out);

  // celular: sem rolagem lateral, atalhos na tela, engrenagem não cobre os atalhos
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await prep(ctx2);
  await ctx2.addInitScript(db => { localStorage.setItem('mock-sb-db', db); }, await A.evaluate(() => localStorage.getItem('mock-sb-db')));
  const M = await ctx2.newPage(); M.on('pageerror', e => out.errors.push('celular: ' + e.message));
  await M.goto('http://127.0.0.1:8786/'); await M.waitForTimeout(600);
  if (await M.evaluate(() => !document.getElementById('login').hidden && !document.getElementById('f-entrar').hidden)) { await M.fill('#le-email', 'loja@pneusbr.com'); await M.fill('#le-senha', 'senha-forte-1'); await M.click('#f-entrar button[type=submit]'); }
  await M.waitForTimeout(3000);
  out.c.cel = await M.evaluate(() => {
    const g = document.getElementById('btn-ajustes').getBoundingClientRect();
    const as = [...document.querySelectorAll('.in-atalhos a')].map(a => a.getBoundingClientRect());
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, fora: as.filter(r => r.right > innerWidth + 1 || r.bottom > innerHeight + 1).length, cobre: as.some(r => r.left < g.right && r.right > g.left && r.top < g.bottom && r.bottom > g.top) };
  });
  ok(out.c.cel.sw <= out.c.cel.cw, 'celular sem rolagem lateral', out);
  ok(out.c.cel.fora === 0 && !out.c.cel.cobre, 'atalhos cabem e a engrenagem não cobre nenhum', out);

  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
  process.exit(out.falhas.length || out.errors.length ? 1 : 0);
})();
