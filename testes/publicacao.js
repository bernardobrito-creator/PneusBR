// Teste (20/11/2026): itens de publicação do site. Página fora das buscas (noindex), prévia do link (Open Graph),
// ícones, fontes no próprio site, carro 3D só depois de entrar, página 404, senha das telas só no servidor
// e termo de uso e sigilo aceito pelo funcionário no primeiro acesso (com data e hora gravadas). Dados fictícios.
// Uso: ./testes/preparar-site.sh <rascunho> && node testes/publicacao.js <rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-prazo.xlsx.b64'), 'utf8');
const migr = { 'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { loja: 'PneusBR', markupModo: 'planilha', arredondar: 'centavo', markupCat: {}, variaveis: [] } } };
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8795', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} };
  const html = fs.readFileSync(path.join(SP, 'site/index.html'), 'utf8');
  // 1) cabeçalho da página
  const meta = (attr, nome) => (html.match(new RegExp(`<meta ${attr}="${nome}" content="([^"]*)"`)) || [])[1];
  out.c.cab = { robots: meta('name', 'robots'), ogTitle: meta('property', 'og:title'), ogImage: meta('property', 'og:image'), ogUrl: meta('property', 'og:url'), twitter: meta('name', 'twitter:card'),
    csp: meta('http-equiv', 'Content-Security-Policy'), google: /fonts\.(googleapis|gstatic)\.com/.test(html), favicon: /<link rel="icon" href="favicon\.ico"/.test(html), apple: /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/.test(html) };
  ok(out.c.cab.robots === 'noindex, nofollow', 'página fora das buscas (noindex)', out);
  ok(out.c.cab.ogTitle && /^https:\/\/.+\/og\.png$/.test(out.c.cab.ogImage || '') && /^https:\/\/.+\/$/.test(out.c.cab.ogUrl || '') && out.c.cab.twitter === 'summary_large_image', 'prévia do link (Open Graph) com imagem e endereço completos', out);
  ok(!out.c.cab.google && !/fonts\.g/.test(out.c.cab.csp || ''), 'sem Google Fonts (nem no CSP)', out);
  ok(out.c.cab.favicon && out.c.cab.apple, 'favicon e ícone do iPhone', out);
  const man = JSON.parse(fs.readFileSync(path.join(SP, 'site/manifest.webmanifest'), 'utf8'));
  ok(man.icons.some(i => i.purpose === 'maskable' && i.src === 'icon-maskable-512.png'), 'ícone maskable próprio no manifest', out);
  for (const f of ['og.png', 'favicon.ico', 'apple-touch-icon.png', 'icon-maskable-512.png', '404.html', 'fonts/instrument-sans-latin.woff2', 'fonts/jetbrains-mono-latin.woff2', 'fonts/LICENCAS-OFL.txt']) ok(fs.existsSync(path.join(SP, 'site', f)), 'arquivo ' + f + ' no site', out);
  const p404 = fs.readFileSync(path.join(SP, 'site/404.html'), 'utf8');
  ok(/noindex/.test(p404) && /Página não encontrada/.test(p404) && /<a class="btn" href="\/[^"]*">Ir para o sistema<\/a>/.test(p404) && !/<script/.test(p404), 'página 404 sem script, fora das buscas e com link para o sistema', out);
  ok(/notafiscalavulsa_mei\.html/.test(html) && !/emitir-nota-fiscal-avulsa-eletronica-nfa-e/.test(html), 'link da nota avulsa de MG atualizado', out);

  const abrir = async (m, vp) => {
    const ctx = await b.newContext({ viewport: vp || { width: 1360, height: 900 } });
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, mm]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify(mm)); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, m]);
    const A = await ctx.newPage(); const pedidos = [];
    A.on('request', r => pedidos.push(r.url()));
    A.on('pageerror', e => out.errors.push(e.message)); A.on('console', mm => { if (mm.type() === 'error' && !/ERR_FAILED|net::/.test(mm.text())) out.errors.push(mm.text()); });
    return { ctx, A, pedidos };
  };
  const db = A => A.evaluate(() => JSON.parse(localStorage.getItem('mock-sb-db')));
  // 2) tela de entrada: nada do carro 3D; fontes do próprio site
  {
    const { ctx, A, pedidos } = await abrir({ docs: migr, membros: {}, users: {}, trava: null });
    await A.goto('http://127.0.0.1:8795/'); await A.waitForTimeout(2500);
    out.c.login = { carro: pedidos.filter(u => /inicio3d\.js|carro\.glb/.test(u)), fontes: pedidos.filter(u => /\.woff2/.test(u)).map(u => u.replace(/^.*\//, '')), fonteOk: await A.evaluate(() => document.fonts.check('16px "Instrument Sans"')), externos: pedidos.filter(u => !u.startsWith('http://127.0.0.1')) };
    ok(out.c.login.carro.length === 0, 'tela de entrada não baixa o carro 3D', out);
    ok(out.c.login.fontes.includes('instrument-sans-latin.woff2') && out.c.login.fonteOk, 'fonte Instrument Sans do próprio site', out);
    ok(out.c.login.externos.every(u => /supabase-js@/.test(u)), 'tela de entrada sem pedidos para outros sites (além do banco)', out);
    await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
    await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3500);
    out.c.depoisEntrar = pedidos.filter(u => /inicio3d\.js|carro\.glb/.test(u)).map(u => u.replace(/^.*\//, ''));
    ok(out.c.depoisEntrar.includes('inicio3d.js'), 'depois de entrar o carro 3D baixa', out);
    // 3) senha das telas ainda não criada: a antiga não abre e o aviso explica
    await A.evaluate(() => { location.hash = '#caixa'; }); await A.waitForTimeout(600);
    await A.fill('#trava-senha', 'TREPNIAYKS'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(600);
    out.c.semTrava = await A.evaluate(() => ({ travada: !document.querySelector('[data-view="trava"]').hidden, msg: document.querySelector('#trava-erro').textContent }));
    ok(out.c.semTrava.travada && /ainda não foi criada/.test(out.c.semTrava.msg), 'sem senha no servidor as telas não abrem (nem com a senha antiga)', out);
    await A.click('#btn-ajustes'); await A.waitForTimeout(900);
    out.c.avisoTrava = await A.evaluate(() => document.querySelector('#a-trava')?.innerText || '');
    ok(/ainda não foi criada/.test(out.c.avisoTrava), 'Configurações avisa que falta criar a senha das telas', out);
    await A.fill('#a-trava-1', 'novasenha9'); await A.fill('#a-trava-2', 'novasenha9'); await A.click('[data-acao="pbr-trava"]'); await A.waitForTimeout(700);
    out.c.avisoTrava2 = await A.evaluate(() => document.querySelector('#a-trava')?.innerText || '');
    ok(/Senha das telas ativa/.test(out.c.avisoTrava2), 'senha das telas criada', out);
    // 4) termo de uso e sigilo: o dono não aceita; a funcionária aceita no primeiro acesso
    out.c.termoDono = await A.evaluate(() => document.querySelector('#a-conta .termo-ver summary')?.textContent || '');
    ok(/Termo de uso e sigilo que a equipe aceita/.test(out.c.termoDono), 'dono vê o termo em Sua conta', out);
    await A.fill('#a-p-nome', 'Ana'); await A.fill('#a-p-email', 'ana@pneusbr.com'); await A.fill('#a-p-senha', 'ana-12345'); await A.click('[data-acao="pbr-add"]'); await A.waitForTimeout(900);
    out.c.equipe1 = await A.evaluate(() => [...document.querySelectorAll('#a-equipe .pessoa')].map(p => p.innerText.replace(/\s+/g, ' ')));
    ok(out.c.equipe1.some(t => /Ana/.test(t) && /ainda não aceitou o termo/.test(t)), 'equipe mostra que a Ana ainda não aceitou', out);
    await Promise.all([A.waitForNavigation({ timeout: 5000 }).catch(() => null), A.click('[data-acao="pbr-sair"]')]); await A.waitForTimeout(1200);
    await A.fill('#le-email', 'ana@pneusbr.com'); await A.fill('#le-senha', 'ana-12345'); await A.click('#f-entrar button[type=submit]'); await A.waitForTimeout(1500);
    out.c.termo = await A.evaluate(() => ({ visivel: !document.querySelector('#f-termo').hidden, login: !document.querySelector('#login').hidden, texto: document.querySelector('#lt-texto').innerText.slice(0, 80), itens: document.querySelectorAll('#lt-texto li').length }));
    ok(out.c.termo.visivel && out.c.termo.login && out.c.termo.itens === 5, 'funcionária vê o termo antes de entrar', out);
    await A.screenshot({ path: path.join(SP, 'teste/pub1-termo.png') });
    await A.click('#f-termo button[type=submit]'); await A.waitForTimeout(400);
    out.c.semMarcar = await A.evaluate(() => ({ erro: document.querySelector('#lt-erro').textContent, termo: (JSON.parse(localStorage.getItem('mock-sb-db')).termo || []).length }));
    ok(/Marque que leu/.test(out.c.semMarcar.erro) && out.c.semMarcar.termo === 0, 'sem marcar não entra e nada é gravado', out);
    await A.check('#lt-ok'); await A.click('#f-termo button[type=submit]'); await A.waitForTimeout(2500);
    const d1 = await db(A); out.c.aceite = d1.termo;
    ok(d1.termo && d1.termo.length === 1 && d1.termo[0].nome === 'Ana' && /^1 · /.test(d1.termo[0].versao) && !isNaN(Date.parse(d1.termo[0].aceito_em)), 'aceite gravado com quem, versão, data e hora', out);
    out.c.entrou = await A.evaluate(() => ({ login: !document.querySelector('#login').hidden, api: !!window.__api }));
    ok(!out.c.entrou.login && out.c.entrou.api, 'depois de aceitar a funcionária entra', out);
    await A.click('#btn-ajustes'); await A.waitForTimeout(800);
    out.c.contaAna = await A.evaluate(() => document.querySelector('#a-conta .termo-ver summary')?.textContent || '');
    ok(/aceito em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/.test(out.c.contaAna), 'funcionária vê quando aceitou', out);
    // sair e entrar de novo: não pede outra vez
    await Promise.all([A.waitForNavigation({ timeout: 5000 }).catch(() => null), A.click('[data-acao="pbr-sair"]')]); await A.waitForTimeout(1200);
    await A.fill('#le-email', 'ana@pneusbr.com'); await A.fill('#le-senha', 'ana-12345'); await A.click('#f-entrar button[type=submit]'); await A.waitForTimeout(2000);
    out.c.segunda = await A.evaluate(() => ({ termo: !document.querySelector('#f-termo').hidden, login: !document.querySelector('#login').hidden }));
    ok(!out.c.segunda.termo && !out.c.segunda.login, 'no segundo acesso não pede o termo de novo', out);
    // dono vê a data do aceite na equipe
    await A.click('#btn-ajustes'); await A.waitForTimeout(500);
    await Promise.all([A.waitForNavigation({ timeout: 5000 }).catch(() => null), A.click('[data-acao="pbr-sair"]')]); await A.waitForTimeout(1200);
    await A.fill('#le-email', 'loja@pneusbr.com'); await A.fill('#le-senha', 'senha-forte-1'); await A.click('#f-entrar button[type=submit]'); await A.waitForTimeout(2500);
    out.c.donoSemTermo = await A.evaluate(() => document.querySelector('#f-termo').hidden && document.querySelector('#login').hidden);
    ok(out.c.donoSemTermo, 'o dono entra sem o termo', out);
    await A.click('#btn-ajustes'); await A.waitForTimeout(1000);
    out.c.equipe2 = await A.evaluate(() => [...document.querySelectorAll('#a-equipe .pessoa')].map(p => p.innerText.replace(/\s+/g, ' ')));
    ok(out.c.equipe2.some(t => /Ana/.test(t) && /aceitou o termo em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/.test(t)), 'equipe mostra a data e a hora do aceite', out);
    await ctx.close();
  }
  // 5) quem não aceita sai; celular sem rolagem lateral no termo
  {
    const { ctx, A } = await abrir({ docs: migr, membros: { u1: { nome: 'Dono', papel: 'dono' }, u2: { nome: 'Beto', papel: 'func' } }, users: { u1: { email: 'loja@pneusbr.com', senha: 'senha-forte-1' }, u2: { email: 'beto@pneusbr.com', senha: 'beto-12345' } } }, { width: 390, height: 844 });
    await A.goto('http://127.0.0.1:8795/'); await A.waitForTimeout(1200);
    await A.fill('#le-email', 'beto@pneusbr.com'); await A.fill('#le-senha', 'beto-12345'); await A.click('#f-entrar button[type=submit]'); await A.waitForTimeout(1500);
    out.c.celTermo = await A.evaluate(() => ({ visivel: !document.querySelector('#f-termo').hidden, largura: document.documentElement.scrollWidth }));
    ok(out.c.celTermo.visivel && out.c.celTermo.largura <= 390, 'termo no celular sem rolagem lateral', out);
    await A.screenshot({ path: path.join(SP, 'teste/pub2-termo-celular.png') });
    await Promise.all([A.waitForNavigation({ timeout: 5000 }).catch(() => null), A.click('#lt-sair')]); await A.waitForTimeout(1500);
    out.c.recusou = await A.evaluate(() => ({ entrar: !document.querySelector('#f-entrar').hidden, sessao: localStorage.getItem('mock-sb-sessao'), termo: (JSON.parse(localStorage.getItem('mock-sb-db')).termo || []).length }));
    ok(out.c.recusou.entrar && !out.c.recusou.sessao && out.c.recusou.termo === 0, 'quem não aceita sai da conta sem registro', out);
    await ctx.close();
  }
  // 6) página 404
  {
    const { ctx, A } = await abrir({ docs: migr, membros: {}, users: {} });
    await A.goto('http://127.0.0.1:8795/404.html'); await A.waitForTimeout(500);
    out.c.p404 = await A.evaluate(() => ({ h1: document.querySelector('h1')?.textContent, largura: document.documentElement.scrollWidth }));
    ok(out.c.p404.h1 === 'Página não encontrada', 'página 404 abre', out);
    await A.screenshot({ path: path.join(SP, 'teste/pub3-404.png') });
    await A.emulateMedia({ colorScheme: 'dark' }); await A.waitForTimeout(200);
    await A.screenshot({ path: path.join(SP, 'teste/pub4-404-noturno.png') });
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
  process.exit(out.falhas.length || out.errors.length ? 1 : 0);
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
