// Teste de segurança do site (com o CSP e as regras novas):
// - CSP no ar: script injetado e eval() bloqueados, nenhum erro de CSP no uso normal
// - XSS: textos maliciosos em notas, clientes, serviços, produtos e integrantes aparecem como texto, nunca rodam
// - links "javascript:" bloqueados; CSV sem fórmulas
// - funcionário não muda configurações e não apaga notas, mas continua registrando
// - senha das telas conferida no servidor, com limite de tentativas; senha antiga deixa de valer
// - limite de tentativas no login; página não abre dentro de outro site; gancho de teste só no computador local
// Uso: ./testes/preparar-site.sh <rascunho> && node testes/seguranca.js <rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const P = `"><img src=x onerror="window.__xss=(window.__xss||0)+1"><svg onload="window.__xss=1"></svg>'\`\${1}<script>window.__xss=1</script>`;
const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const doc = (col, id, data) => ({ [col + '/' + id]: { path: col + '/' + id, colecao: col, doc_id: id, data } });
const migr = {
  ...doc('config', 'geral', { loja: 'PneusBR', markup: 1.43, markupModo: 'direto', arredondar: 'inteiro', ajusteMercado: 30, margem: 30, markupCat: {}, variaveis: [] }),
  ...doc('config', 'integrantes', { lista: [{ id: 'xss', nome: 'Zé ' + P, ativo: true, mei: true, cnpj: '', linkPecas: 'javascript:window.__xss=1' }], atualizadoEm: 1 }),
  ...doc('servicos', 'sxss', { nome: 'Serviço ' + P, cod: 'S09', preco: 5, ativo: true, criadoEm: 1 }),
  ...doc('produtos', 'sxss01', { avulso: true, nome: '=HYPERLINK("http://exemplo.invalid","clique") ' + P, modelo: P, marca: '@SUM(1+1)', cod: '', codigos: ['7890000000017'], estoque: 1 }),
  ...doc('receber', 'nxss', { parte: 'Cliente ' + P, descricao: P, veiculo: P, emissao: hoje, linhas: [P], total: 10, parcelas: [{ n: 1, venc: hoje, valor: 10 }], conferir: [P], criadoEm: 1 }),
  ...doc('pagar', 'pxss', { parte: 'Fornecedor ' + P, descricao: P, emissao: hoje, total: 20, parcelas: [{ n: 1, venc: hoje, valor: 20 }], criadoEm: 1 }),
  ...doc('retornos', 'rxss', { nome: 'Retorno ' + P, tel: '33999998888', servico: P, feito: '2026-05-01', meses: 6, volta: hoje, veiculo: P, obs: P, criadoEm: 1 }),
  ...doc('lancamentos', hoje + '_sxss_1', { data: hoje, sessao: 'sxss', criadoEm: 1, itens: [
    { id: 'm1', t: Date.now() - 60000, k: 'mov', tipo: 'saida', motivo: 'venda', pk: 'sxss01', cod: '', lido: '', nome: 'Venda ' + P, mod: P, qtd: 1, vu: 10, cu: 5, total: 10, caixa: 10, pg: 'dinheiro', u: null },
    { id: 'c1', t: Date.now() - 30000, k: 'caixa', tipo: 'despesa', desc: 'Despesa ' + P, cat: P, valor: 3, caixa: -3, pg: 'dinheiro', u: null }] }),
  ...doc('clientes', '52998224725', { nome: 'Cliente ' + P, doc: '52998224725', tel: P, criadoEm: 1 })
};
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8775', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  const atacante = path.join(SP, 'atacante'); fs.mkdirSync(atacante, { recursive: true });
  fs.writeFileSync(path.join(atacante, 'index.html'), '<!doctype html><title>outro site</title><iframe src="http://127.0.0.1:8775/" width="800" height="600"></iframe>');
  const srv2 = spawn('python3', ['-m', 'http.server', '8776', '--bind', '127.0.0.1'], { cwd: atacante, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch({ args: ['--host-resolver-rules=MAP pneusbr.test 127.0.0.1'] });
  const out = { errors: [], falhas: [], csp: [], c: {} };
  const prep = async ctx => {
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    // script "do CDN" (permitido pelo CSP) que tenta usar eval: tem que ser barrado
    await ctx.route(/teste-eval@/, r => r.fulfill({ body: "try { eval('1 + 1'); window.__ev = 'rodou'; } catch (e) { window.__ev = e.name; } try { new Function('return 2')(); window.__fn = 'rodou'; } catch (e) { window.__fn = e.name; }", contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => {
      window.__xlsxB64 = x; window.__csp = [];
      document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sample || '').slice(0, 40)));
      if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} }));
      window.__pbrTeste = api => { window.__api = api; };
    }, [xlsx, migr]);
  };
  const nova = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => out.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|404|Content Security Policy|Refused to/.test(m.text())) out.errors.push(m.text()); }); return p; };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true }); await prep(ctx);
  const A = await nova(ctx);
  await A.goto('http://127.0.0.1:8775/'); await A.waitForTimeout(700);

  // 1) senha fraca recusada já no primeiro acesso
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'abcdefgh'); await A.fill('#lc-senha2', 'abcdefgh');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(300);
  out.c.senhaFraca = await A.textContent('#lc-erro'); ok(/letras e números/.test(out.c.senhaFraca), 'senha só com letras recusada', out);
  await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);
  ok(await A.evaluate(() => document.querySelector('#login').hidden), 'dono entrou', out);

  // 2) CSP no ar: script injetado e eval bloqueados
  out.c.csp = await A.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
    const s = document.createElement('script'); s.textContent = 'window.__injetado = 1'; document.body.appendChild(s);
    const d = document.createElement('div'); d.id = 'teste-inj'; d.innerHTML = '<img src="x" onerror="window.__injetado2 = 1">'; document.body.appendChild(d);
    const e = document.createElement('script'); e.src = 'https://cdn.jsdelivr.net/npm/teste-eval@1/x.js'; document.head.appendChild(e);
    return { temMeta: /script-src/.test(meta), objectNone: /object-src 'none'/.test(meta), baseNone: /base-uri 'none'/.test(meta), unsafeInlineScript: /script-src[^;]*'unsafe-inline'/.test(meta) };
  });
  await A.waitForTimeout(600);
  out.c.injetado = await A.evaluate(() => [window.__injetado, window.__injetado2]);
  Object.assign(out.c.csp, await A.evaluate(() => ({ ev: window.__ev, fn: window.__fn, violacoes: window.__csp.length })));
  await A.evaluate(() => document.querySelector('#teste-inj').remove());
  ok(out.c.csp.temMeta && out.c.csp.objectNone && out.c.csp.baseNone && !out.c.csp.unsafeInlineScript, 'CSP completo no site', out);
  ok(out.c.injetado[0] === undefined && out.c.injetado[1] === undefined, 'script injetado não rodou', out);
  ok(out.c.csp.ev === 'EvalError' && out.c.csp.fn === 'EvalError', 'eval bloqueado', out);
  await A.evaluate(() => { window.__csp = []; });

  // 3) XSS: passa por todas as telas e painéis com os textos maliciosos
  await A.evaluate(() => { location.hash = '#caixa'; }); await A.waitForTimeout(300);
  await A.fill('#trava-senha', 'TREPNIAYKS'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(600);
  const telas = await A.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => /^#[a-z]+$/.test(h)))]);
  for (const t of ['#caixa', '#faturamento', '#balanco', '#precificacao', '#rotina']) if (!telas.includes(t)) telas.push(t);
  out.c.telas = telas;
  const procurar = () => A.evaluate(() => {
    const ruins = [...document.querySelectorAll('*')].filter(el => [...el.attributes].some(a => /^on/i.test(a.name)) || (el.tagName === 'IMG' && el.getAttribute('src') === 'x') || (el.tagName === 'A' && /^\s*javascript:/i.test(el.getAttribute('href') || '')));
    const scripts = [...document.querySelectorAll('script')].filter(s => /__xss/.test(s.textContent));
    return { ruins: ruins.map(e => e.outerHTML.slice(0, 80)), scripts: scripts.length, xss: window.__xss, texto: document.body.innerText.includes('<img src=x') };
  });
  const achados = [];
  for (const t of telas) {
    await A.evaluate(h => { location.hash = h; }, t); await A.waitForTimeout(350);
    const r = await procurar(); if (r.ruins.length || r.scripts || r.xss) achados.push({ t, ...r });
  }
  // painéis: nota a receber, nota a pagar, retorno, integrante, produto
  const abrir = async (hash, sel) => { await A.evaluate(h => { location.hash = h; }, hash); await A.waitForTimeout(400); const el = await A.$(sel); if (el) { await el.click(); await A.waitForTimeout(400); const r = await procurar(); if (r.ruins.length || r.scripts || r.xss) achados.push({ t: hash + ' ' + sel, ...r }); await A.keyboard.press('Escape'); } return !!el; };
  out.c.paineis = {
    receber: await abrir('#receber', '#nr-tab tbody tr:not(.grupo)'),
    pagar: await abrir('#pagar', '#np-tab tbody tr:not(.grupo)'),
    retorno: await abrir('#retornos', '#rt-tab tbody tr'),
    produto: await abrir('#produtos', '#p-tab tbody tr')
  };
  out.c.textoCaixa = await (async () => { await A.evaluate(() => { location.hash = '#caixa'; }); await A.waitForTimeout(400); return A.evaluate(() => document.body.innerText.includes('Despesa "><img src=x')); })();
  ok(out.c.textoCaixa, 'lançamento malicioso aparece como texto no Caixa', out);
  out.c.textoVisivel = await A.evaluate(() => { location.hash = '#receber'; return true; }) && await (async () => { await A.waitForTimeout(400); return A.evaluate(() => document.body.innerText.includes('<img src=x')); })();
  out.c.xss = { achados, global: await A.evaluate(() => window.__xss), csp: await A.evaluate(() => window.__csp) };
  ok(!achados.length && out.c.xss.global === undefined, 'nenhum texto malicioso virou código', out);
  ok(!out.c.xss.csp.length, 'nenhuma violação de CSP no uso normal', out);
  ok(out.c.textoVisivel, 'texto malicioso aparece como texto', out);

  // 4) link "javascript:" do integrante não vira link; salvar um link assim é recusado
  await A.evaluate(() => { location.hash = '#integrantes'; }); await A.waitForTimeout(400);
  const linhaIg = await A.$('[data-acao="abrir-integrante"][data-id="xss"]'); if (linhaIg) { await linhaIg.click(); await A.waitForTimeout(400); const r = await procurar(); if (r.ruins.length || r.scripts || r.xss) achados.push({ t: 'integrante', ...r }); }
  if (await A.$('#ig-pecas')) {
    await A.fill('#ig-pecas', 'javascript:window.__xss=1'); await A.click('[data-acao="ig-salvar"]').catch(() => { }); await A.waitForTimeout(300);
    out.c.linkRecusado = await A.evaluate(() => document.querySelector('#ig-erro')?.textContent || '');
    ok(/https:\/\//.test(out.c.linkRecusado), 'link javascript: recusado ao salvar integrante', out);
    await A.keyboard.press('Escape');
  } else out.c.linkRecusado = 'painel do integrante não abriu';

  // 5) CSV: texto que parece fórmula sai com apóstrofo (o aviso de notas a pagar fica por cima do botão: minimiza antes)
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(400);
  await A.evaluate(() => document.querySelector('#aviso [data-acao="aviso-min"]')?.click()); await A.waitForTimeout(150);
  const [dl] = await Promise.all([A.waitForEvent('download', { timeout: 5000 }), A.click('#p-csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  const linhasCsv = csv.split('\n').filter(l => /HYPERLINK|SUM\(/.test(l));
  out.c.csv = linhasCsv.map(l => l.slice(0, 40) + ' … ' + (l.match(/;'?@SUM\(1\+1\)/) || [''])[0]);
  ok(linhasCsv.length === 1 && /^\uFEFF?"'=HYPERLINK/.test(linhasCsv[0]) && /;'@SUM\(1\+1\);/.test(linhasCsv[0]), 'CSV com fórmulas neutralizadas', out);

  // 6) senha das telas: dono cria a nova no servidor; a antiga deixa de valer
  await A.evaluate(() => document.querySelector('[data-acao="abrir-config"]')?.click()); await A.waitForTimeout(800);
  out.c.travaAviso = await A.evaluate(() => document.querySelector('#a-trava')?.innerText || '');
  ok(/senha antiga/.test(out.c.travaAviso), 'aviso de senha antiga para o dono', out);
  await A.fill('#a-trava-1', 'novasenha9'); await A.fill('#a-trava-2', 'NOVASENHA9'); await A.click('[data-acao="pbr-trava"]'); await A.waitForTimeout(600);
  out.c.travaDepois = await A.evaluate(() => document.querySelector('#a-trava')?.innerText || '');
  ok(/Senha nova ativa/.test(out.c.travaDepois), 'senha nova ativa', out);
  await A.keyboard.press('Escape');
  const B = await nova(ctx); // nova aba: precisa da senha de novo
  await B.goto('http://127.0.0.1:8775/#caixa'); await B.waitForTimeout(2500);
  await B.fill('#trava-senha', 'TREPNIAYKS'); await B.press('#trava-senha', 'Enter'); await B.waitForTimeout(500);
  out.c.antiga = await B.evaluate(() => ({ travada: !document.querySelector('[data-view="trava"]').hidden, msg: document.querySelector('#trava-erro').textContent }));
  ok(out.c.antiga.travada && /incorreta/.test(out.c.antiga.msg), 'senha antiga não abre mais', out);
  await B.fill('#trava-senha', 'novasenha9'); await B.press('#trava-senha', 'Enter'); await B.waitForTimeout(600);
  out.c.nova = await B.evaluate(() => document.querySelector('[data-view="trava"]').hidden);
  ok(out.c.nova, 'senha nova abre o Caixa', out);
  // limite: 5 erros seguidos bloqueiam neste aparelho sem nem perguntar ao servidor
  const C = await nova(ctx); await C.goto('http://127.0.0.1:8775/#faturamento'); await C.waitForTimeout(2500);
  for (let i = 0; i < 5; i++) { await C.fill('#trava-senha', 'errada' + i); await C.press('#trava-senha', 'Enter'); await C.waitForTimeout(250); }
  const antes = await C.evaluate(() => window.__mockSb.chamadas.filter(x => x === 'fn:acesso:').length);
  await C.fill('#trava-senha', 'novasenha9'); await C.press('#trava-senha', 'Enter'); await C.waitForTimeout(300);
  out.c.limiteTrava = await C.evaluate(() => ({ msg: document.querySelector('#trava-erro').textContent, travada: !document.querySelector('[data-view="trava"]').hidden }));
  ok(/Muitas tentativas/.test(out.c.limiteTrava.msg) && out.c.limiteTrava.travada, 'limite de tentativas na senha das telas', out);
  await C.evaluate(() => localStorage.removeItem('pbr.trava.tent')); await C.close(); await B.close();

  // 7) funcionário: cria Ana, entra como ela
  await A.evaluate(() => document.querySelector('[data-acao="abrir-config"]')?.click()); await A.waitForTimeout(700);
  await A.fill('#a-p-nome', 'Ana'); await A.fill('#a-p-email', 'ana@pneusbr.com'); await A.fill('#a-p-senha', 'ana-12345');
  await A.click('[data-acao="pbr-add"]'); await A.waitForTimeout(500);
  await Promise.all([A.waitForNavigation({ timeout: 5000 }).catch(() => null), A.click('[data-acao="pbr-sair"]')]); await A.waitForTimeout(900);
  // limite de tentativas no login
  for (let i = 0; i < 5; i++) { await A.fill('#le-email', 'ana@pneusbr.com'); await A.fill('#le-senha', 'errada' + i); await A.click('#f-entrar button[type=submit]'); await A.waitForTimeout(200); }
  await A.fill('#le-senha', 'ana-12345'); await A.click('#f-entrar button[type=submit]'); await A.waitForTimeout(300);
  out.c.limiteLogin = await A.textContent('#le-erro');
  ok(/Muitas tentativas/.test(out.c.limiteLogin), 'limite de tentativas no login', out);
  await A.evaluate(() => localStorage.removeItem('pbr.login.tent'));
  await A.fill('#le-senha', 'ana-12345'); await A.click('#f-entrar button[type=submit]'); await A.waitForTimeout(3000);
  ok(await A.evaluate(() => document.querySelector('#login').hidden), 'Ana entrou', out);
  await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(400);
  out.c.travadaAposTrocarPessoa = await A.evaluate(() => !document.querySelector('[data-view="trava"]').hidden);
  ok(out.c.travadaAposTrocarPessoa, 'telas voltam a pedir senha depois de sair', out);
  await A.fill('#trava-senha', 'novasenha9'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(800);
  out.c.func = await A.evaluate(async () => {
    const S = window.__api.S, dis = [...document.querySelectorAll('#param-card [data-cfg], #param-card [data-mkcat]')].map(e => e.disabled);
    const cfgAntes = JSON.stringify(JSON.parse(localStorage.getItem('mock-sb-db')).docs['config/geral'].data);
    let direto = null; try { await S.db.doc('config/geral').set({ markup: 99 }); direto = 'gravou'; } catch (e) { direto = e.code; }
    let apagar = null; try { await S.db.doc('receber/nxss').delete(); apagar = 'apagou'; } catch (e) { apagar = e.code; }
    const cfgDepois = JSON.stringify(JSON.parse(localStorage.getItem('mock-sb-db')).docs['config/geral'].data);
    return { dono: S.dono, todosDesabilitados: dis.length > 0 && dis.every(Boolean), n: dis.length, direto, apagar, cfgIgual: cfgAntes === cfgDepois, podeEscrever: S.podeEscrever, receberExiste: !!JSON.parse(localStorage.getItem('mock-sb-db')).docs['receber/nxss'] };
  });
  ok(out.c.func.dono === false && out.c.func.todosDesabilitados, 'campos de configuração travados para o funcionário', out);
  ok(out.c.func.direto === 'invalid_argument' && out.c.func.cfgIgual, 'banco recusa configuração gravada pelo funcionário', out);
  ok(out.c.func.apagar === 'invalid_argument' && out.c.func.receberExiste, 'banco recusa apagar nota', out);
  // continua registrando venda normalmente
  await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(300);
  await A.keyboard.press('F2'); await A.fill('#qtd', '1'); await A.fill('#scan', '12077'); await A.press('#scan', 'Enter'); await A.waitForTimeout(1500);
  out.c.funcVende = await A.evaluate(() => ({ podeEscrever: window.__api.S.podeEscrever, lanc: Object.keys(JSON.parse(localStorage.getItem('mock-sb-db')).docs).filter(k => k.startsWith('lancamentos/')).length }));
  ok(out.c.funcVende.podeEscrever && out.c.funcVende.lanc > 0, 'funcionário continua registrando', out);

  // 8) dentro de outro site (moldura): a página fica escondida
  const F = await nova(ctx); await F.goto('http://127.0.0.1:8776/'); await F.waitForTimeout(1500);
  const fr = F.frames().find(f => f.url().startsWith('http://127.0.0.1:8775'));
  out.c.moldura = fr ? await fr.evaluate(() => getComputedStyle(document.documentElement).display) : 'sem frame';
  ok(out.c.moldura === 'none', 'página escondida dentro de outro site', out);
  await F.close();

  // 9) gancho de teste não funciona fora do computador local
  const ctx2 = await b.newContext(); await prep(ctx2);
  const G = await ctx2.newPage(); await G.goto('http://pneusbr.test:8775/'); await G.waitForTimeout(1200);
  out.c.ganchoForaDoLocal = await G.evaluate(() => typeof window.__api);
  ok(out.c.ganchoForaDoLocal === 'undefined', 'gancho de teste desligado fora do computador local', out);

  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill(); srv2.kill();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
