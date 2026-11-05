// Teste: escanear nota (pasta, arquivo, PDF, XML, IA simulada) em Notas a pagar e a receber
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2], N = path.join(SP, 'teste/notas'), LIB = path.join(SP, 'libs/node_modules');
const xlsx = fs.readFileSync(path.join(SP, 'teste/planilha-precos2.xlsx.b64'), 'utf8');
const migr = { 'config/geral': { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { ajusteMercado: 30, arredondar: 'inteiro', markup: 1.43, markupModo: 'planilha', variaveis: [] } } };
const b64 = f => fs.readFileSync(path.join(N, f)).toString('base64');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8770', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch(); const out = { errors: [], c: {} };
  const prep = async (ctx, semPasta) => {
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(LIB, 'xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(LIB, 'jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/pdfjs-dist@6\.4\.299\/legacy\/build\/pdf\.min\.mjs/, r => r.fulfill({ path: path.join(LIB, 'pdfjs-dist/legacy/build/pdf.min.mjs'), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
    await ctx.route(/pdfjs-dist@6\.4\.299\/legacy\/build\/pdf\.worker\.min\.mjs/, r => r.fulfill({ path: path.join(LIB, 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
    await ctx.route(/zxing-wasm@3\.1\.5\/dist\/iife\/reader\/index\.js/, r => r.fulfill({ path: path.join(LIB, 'zxing-wasm/dist/iife/reader/index.js'), contentType: 'application/javascript' }));
    await ctx.route(/zxing_reader\.wasm/, r => r.fulfill({ path: path.join(LIB, 'zxing-wasm/dist/reader/zxing_reader.wasm'), contentType: 'application/wasm', headers: { 'access-control-allow-origin': '*' } }));
    await ctx.addInitScript(([x, m, sem]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; if (sem) delete window.showDirectoryPicker; }, [xlsx, migr, semPasta]);
  };
  const nova = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => out.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|favicon/.test(m.text())) out.errors.push(m.text()); }); return p; };
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } }); await prep(ctx);
  const A = await nova(ctx);
  await A.goto('http://127.0.0.1:8770/'); await A.waitForTimeout(600);
  await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
  await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(2500);
  await A.evaluate(() => { location.hash = '#pagar'; }); await A.waitForTimeout(300);
  const estado = () => A.evaluate(() => { const nd = window.__api.S.nd; return nd && { parte: nd.parte, doc: nd.doc, numero: nd.numero, emissao: nd.emissao, descricao: nd.descricao, total: nd.total, nParc: nd.nParc, venc1: nd.venc1, parcelas: nd.parcelasLidas, chave: nd.chave, boleto: nd.boleto && { valor: nd.boleto.valor, venc: nd.boleto.venc }, lidos: [...(nd.lidos || [])], msg: document.querySelector('#nd-scan-st')?.innerText.replace(/\s+/g, ' ') }; });
  const esperarLeitura = async () => { await A.waitForFunction(() => window.__api.S.nd && !window.__api.S.nd.lendo && /preenchid|Não consegui|Não foi possível/.test(document.querySelector('#nd-scan-st')?.innerText || ''), null, { timeout: 60000 }); };
  const ler = async (arquivo, campo = '#nd-arquivo') => { await A.setInputFiles(campo, path.join(N, arquivo)); await A.waitForTimeout(300); await esperarLeitura(); return estado(); };
  // 1) DANFE escaneada (PNG), sem IA configurada
  await A.click('[data-acao="nova-nota"][data-col="pagar"]'); await A.waitForTimeout(300);
  out.c.botoes = await A.evaluate(() => [...document.querySelectorAll('.nd-scan-acoes button')].map(x => x.innerText.trim()));
  let t0 = Date.now(); out.c.png = await ler('danfe.png'); out.c.png.ms = Date.now() - t0;
  await A.screenshot({ path: path.join(SP, 'teste/n1-png.png') });
  // 2) PDF só imagem com DANFE + boleto
  await A.keyboard.press('Escape'); await A.click('[data-acao="nova-nota"][data-col="pagar"]'); await A.waitForTimeout(300);
  t0 = Date.now(); out.c.pdf2 = await ler('escaneado-2pag.pdf'); out.c.pdf2.ms = Date.now() - t0;
  // 3) PDF digital (com texto)
  await A.keyboard.press('Escape'); await A.click('[data-acao="nova-nota"][data-col="pagar"]'); await A.waitForTimeout(300);
  out.c.pdfDigital = await ler('danfe-digital.pdf');
  // 4) XML
  await A.keyboard.press('Escape'); await A.click('[data-acao="nova-nota"][data-col="pagar"]'); await A.waitForTimeout(300);
  out.c.xml = await ler('nota.xml');
  await A.screenshot({ path: path.join(SP, 'teste/n2-xml.png') });
  // salvar a nota do XML
  await A.click('[data-acao="nd-salvar"]'); await A.waitForTimeout(400);
  out.c.salva = await A.evaluate(() => { const n = [...window.__api.S.pagar.values()][0]; return n && { parte: n.parte, doc: n.doc, numero: n.numero, total: n.total, parcelas: n.parcelas, escaneado: n.escaneado && n.escaneado.fontes, chave: !!n.chave }; });
  out.c.lista = await A.evaluate(() => [...document.querySelectorAll('#np-tab tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
  // 5) foto com IA simulada
  await A.evaluate(() => { window.__iaResposta = { tipo_documento: 'nota_fiscal', parte_nome: 'Auto Peças Teste Ltda', parte_documento: '12.345.678/0001-95', parte_telefone: null, numero: '000009497', emissao: '2026-11-01', valor_total: 2469.12, parcelas: [{ vencimento: '2026-12-01', valor: 1234.56 }, { vencimento: '2026-12-31', valor: 1234.56 }], chave_nfe: null, linha_digitavel: null, itens_resumo: '2 amortecedores GP30120, 10 filtros LB55', descricao: 'NF-e 9497 · amortecedores e filtros', legivel: true, observacao: null }; });
  await A.click('[data-acao="nova-nota"][data-col="pagar"]'); await A.waitForTimeout(300);
  await A.fill('[data-nd="parte"]', ''); 
  out.c.foto = await ler('danfe-foto.jpg');
  out.c.iaPedido = await A.evaluate(() => window.__iaPedidos);
  await A.screenshot({ path: path.join(SP, 'teste/n3-ia.png') });
  // editar o valor desfaz as parcelas lidas
  await A.fill('#nd-total', '2500,00'); await A.waitForTimeout(200);
  out.c.aposEditar = await A.evaluate(() => ({ parcelas: window.__api.S.nd.parcelasLidas, texto: document.querySelector('#nd-parc').innerText }));
  await A.keyboard.press('Escape');
  // 6) pasta da impressora (simulada) pelo botão do topo
  await A.evaluate(([png, pdf]) => {
    const arq = (nome, b64, tipo, quando) => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); return { kind: 'file', getFile: async () => new File([bin], nome, { type: tipo, lastModified: quando }) }; };
    const sub = { kind: 'directory', async *entries() { yield ['scan-novo.png', arq('scan-novo.png', png, 'image/png', Date.now() - 60000)]; } };
    window.__pasta = { name: 'Digitalizações', kind: 'directory', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      async *entries() { yield ['velho.pdf', arq('velho.pdf', pdf, 'application/pdf', Date.now() - 86400000)]; yield ['leia-me.txt', { kind: 'file', getFile: async () => new File(['x'], 'leia-me.txt') }]; yield ['2026-11', sub]; } };
    window.showDirectoryPicker = async () => window.__pasta;
    window.__iaResposta = null;
  }, [b64('danfe.png'), b64('escaneado-2pag.pdf')]);
  await A.click('[data-acao="scan-nota"][data-col="pagar"]'); await A.waitForTimeout(300); await esperarLeitura();
  out.c.pasta = await estado();
  out.c.pastaBotao = await A.evaluate(() => document.querySelector('#nd-pasta')?.innerText.trim());
  await A.keyboard.press('Escape');
  // 7) notas a receber: notinha à mão (IA simulada)
  await A.evaluate(() => { location.hash = '#receber'; window.__iaResposta = { tipo_documento: 'pedido_ou_notinha', parte_nome: 'João da Silva', parte_documento: null, parte_telefone: '(38) 99876-5432', numero: '152', emissao: '2026-11-04', valor_total: 900, parcelas: [{ vencimento: '2026-12-04', valor: 450 }, { vencimento: '2027-01-04', valor: 450 }], chave_nfe: null, linha_digitavel: null, itens_resumo: '4 pneus 175/70 R13 e alinhamento', descricao: null, legivel: true, observacao: 'Segunda parcela com data difícil de ler.' }; }); await A.waitForTimeout(300);
  await A.click('[data-acao="nova-nota"][data-col="receber"]'); await A.waitForTimeout(300);
  out.c.receber = await ler('danfe-foto.jpg');
  await A.screenshot({ path: path.join(SP, 'teste/n4-receber.png') });
  // celular sem acesso a pastas
  const ls = await A.evaluate(() => Object.entries(localStorage));
  const ctxM = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctxM.addInitScript(l => { if (!sessionStorage.getItem('c')) { for (const [k, v] of l) localStorage.setItem(k, v); sessionStorage.setItem('c', '1'); } }, ls);
  await prep(ctxM, true);
  const M = await nova(ctxM); await M.goto('http://127.0.0.1:8770/#pagar'); await M.waitForTimeout(1800);
  await M.click('[data-acao="nova-nota"][data-col="pagar"]'); await M.waitForTimeout(400);
  out.c.mobile = await M.evaluate(() => ({ largura: document.documentElement.scrollWidth, botoes: [...document.querySelectorAll('.nd-scan-acoes button')].map(x => x.innerText.trim()), captura: document.querySelector('#nd-foto')?.getAttribute('capture') }));
  await M.setInputFiles('#nd-foto', path.join(N, 'danfe.png')); await M.waitForFunction(() => /preenchid|Não/.test(document.querySelector('#nd-scan-st')?.innerText || ''), null, { timeout: 60000 });
  await M.screenshot({ path: path.join(SP, 'teste/n5-mobile.png') });
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
