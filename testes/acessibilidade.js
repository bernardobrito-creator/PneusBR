// Teste (20/11/2026): acessibilidade com o axe-core nas telas principais (botões e links com nome, campos com rótulo,
// contraste etc.), na tela de entrada, no termo de uso e na página 404. Dados fictícios.
// Uso: node testes/acessibilidade.js <rascunho> <pasta do site> [porta]
//   precisa de <rascunho>/lh/node_modules/axe-core, <rascunho>/teste/planilha-prazo.xlsx.b64 e <pasta do site> com o mock em ../site2-mock.js
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2], SITE = process.argv[3] || path.join(SP, 'site2'), PORTA = process.argv[4] || '8797';
const AXE = fs.readFileSync(path.join(SP, 'lh/node_modules/axe-core/axe.min.js'), 'utf8');
const MOCK = path.join(path.dirname(SITE), path.basename(SITE) === 'site' ? 'teste/mock-supabase.js' : 'site2-mock.js');
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-prazo.xlsx.b64'), 'utf8');
const migr = { 'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { loja: 'PneusBR', markupModo: 'planilha', arredondar: 'centavo', markupCat: {}, variaveis: [], taxaCredito: 4.1 } },
  'servicos/salinh': { path: 'servicos/salinh', colecao: 'servicos', doc_id: 'salinh', data: { ativo: true, cod: 'S02', nome: 'Alinhamento P', preco: 60 } } };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', PORTA, '--bind', '127.0.0.1'], { cwd: SITE, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); const out = { errors: [], telas: {} };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.route(/supabase-js@/, r => r.fulfill({ path: MOCK, contentType: 'application/javascript' }));
  await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
  await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
  await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
  const A = await ctx.newPage();
  A.on('pageerror', e => out.errors.push(e.message));
  const auditar = async (nome, incluir) => {
    await A.evaluate(AXE);
    const r = await A.evaluate(async inc => {
      const res = await window.axe.run(inc ? { include: [inc] } : document, { resultTypes: ['violations'] });
      return res.violations.map(v => ({ id: v.id, impacto: v.impact, ajuda: v.help, n: v.nodes.length, alvos: v.nodes.slice(0, 6).map(n => n.target.join(' ') + ' → ' + (n.failureSummary || '').split('\n').slice(1, 2).join('').trim()) }));
    }, incluir || null);
    out.telas[nome] = r;
  };
  await A.goto(`http://127.0.0.1:${PORTA}/`); await A.waitForTimeout(800);
  await auditar('entrada (primeiro acesso)');
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000);
  await A.waitForFunction(() => window.__api && window.__api.S.planilha && window.__api.S.planilha.meta, null, { timeout: 60000 }).catch(() => out.errors.push('planilha não carregou'));
  await A.waitForTimeout(600);
  for (const tab of ['inicio', 'registrar', 'produtos', 'servicos', 'movimentacoes', 'pagar', 'receber', 'retornos', 'rotina', 'integrantes', 'nfse']) {
    await A.evaluate(t => { location.hash = '#' + t; }, tab); await A.waitForTimeout(700);
    await auditar(tab);
  }
  await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(500);
  await auditar('senha das telas');
  await A.fill('#trava-senha', 'trepniayks'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(700);
  for (const tab of ['precificacao', 'caixa', 'faturamento', 'balanco']) { await A.evaluate(t => { location.hash = '#' + t; }, tab); await A.waitForTimeout(700); await auditar(tab); }
  // painéis
  await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(400);
  await A.click('.modo button[data-m="saida"]'); await A.click('#pagamentos [data-acao="pg-parcelado"]'); await A.waitForTimeout(300);
  await auditar('registrar: parcelado aberto', '#scan-card');
  await A.fill('#scan', '7898435680699'); await A.press('#scan', 'Enter'); await A.waitForTimeout(500);
  await auditar('registrar: último registro', '#ultimo');
  await A.evaluate(() => document.querySelector('[data-acao="abrir-config"]')?.click()); await A.waitForTimeout(900);
  await auditar('configurações', '#drawer');
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);
  await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(400);
  await A.click('#p-tab tbody tr'); await A.waitForTimeout(500);
  await auditar('ficha do produto', '#drawer');
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);
  await A.evaluate(() => { location.hash = '#receber'; }); await A.waitForTimeout(400);
  await A.click('[data-acao="nova-nota"][data-col="receber"]'); await A.waitForTimeout(500);
  await auditar('nova nota a receber', '#drawer');
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);
  // celular (menu de baixo)
  await A.setViewportSize({ width: 390, height: 844 }); await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(600);
  await auditar('registrar no celular');
  // termo de uso (funcionária)
  await A.evaluate(() => document.querySelector('[data-acao="abrir-config"]')?.click()); await A.waitForTimeout(800);
  await A.fill('#a-p-nome', 'Ana'); await A.fill('#a-p-email', 'ana@pneusbr.com'); await A.fill('#a-p-senha', 'ana-12345'); await A.click('[data-acao="pbr-add"]'); await A.waitForTimeout(800);
  await Promise.all([A.waitForNavigation({ timeout: 5000 }).catch(() => null), A.click('[data-acao="pbr-sair"]')]); await A.waitForTimeout(1200);
  await auditar('entrar');
  await A.fill('#le-email', 'ana@pneusbr.com'); await A.fill('#le-senha', 'ana-12345'); await A.click('#f-entrar button[type=submit]'); await A.waitForTimeout(1500);
  await auditar('termo de uso');
  await A.goto(`http://127.0.0.1:${PORTA}/nao-existe`); await A.waitForTimeout(400);
  // o http.server do Python não serve o 404.html sozinho: abre direto
  await A.goto(`http://127.0.0.1:${PORTA}/404.html`); await A.waitForTimeout(400);
  await auditar('página 404');
  const resumo = {}; for (const [t, v] of Object.entries(out.telas)) for (const x of v) { const k = x.id + ' (' + x.impacto + ')'; (resumo[k] = resumo[k] || []).push(t + ': ' + x.n); }
  console.log(JSON.stringify({ resumo, ...out }, null, 1));
  await b.close(); srv.kill();
  const graves = Object.values(out.telas).flat().filter(v => v.impacto === 'critical' || v.impacto === 'serious').length;
  process.exit(graves || out.errors.length ? 1 : 0);
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
