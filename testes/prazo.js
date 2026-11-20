// Teste (19/11/2026): preço a prazo. Coluna G "Preço a prazo" e célula "Acréscimo a prazo" da Tabela de preços,
// botão Parcelado no Registrar (pergunta 2x a 6x, preço a prazo, taxa do crédito ou a própria), fiado (nota a receber)
// com o preço a prazo, produto sem preço no parcelado (não vira preço à vista) e as telas Produtos, Preços, ficha e CSV.
// Também confere a planilha sem a célula e sem a coluna (vale à vista + 12,6%). Dados fictícios.
// Uso: ./testes/preparar-site.sh <rascunho> && (cd <rascunho> && python3 /caminho/testes/mkprecos5.py) && node testes/prazo.js <rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsxPrazo = fs.readFileSync(path.join(SP, 'teste/planilha-prazo.xlsx.b64'), 'utf8');
const xlsxSem = fs.readFileSync(path.join(SP, 'teste/planilha-prazo-sem.xlsx.b64'), 'utf8');
const cfg = { path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'centavo', margem: 30, markupCat: { Avulsos: 1.5 }, variaveis: [], taxaDebito: 2.5, taxaCredito: 4.1 } };
const migr = {
  'config/geral': cfg,
  'produtos/a1teste': { path: 'produtos/a1teste', colecao: 'produtos', doc_id: 'a1teste', data: { nome: 'ITEM AVULSO TESTE', modelo: '', marca: '', cod: 'AV1', avulso: true, custoManual: 10, estoque: 5, codigos: ['7890000000999'] } },
  'produtos/a2manual': { path: 'produtos/a2manual', colecao: 'produtos', doc_id: 'a2manual', data: { nome: 'ITEM MANUAL TESTE', modelo: '', marca: '', cod: 'AV2', avulso: true, custoManual: 10, precoManual: 50, estoque: 5, codigos: ['7890000000888'] } },
  'servicos/salinh': { path: 'servicos/salinh', colecao: 'servicos', doc_id: 'salinh', data: { ativo: true, cod: 'S02', nome: 'Alinhamento P', preco: 60 } }
};
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8793', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} };
  const abrir = async (xlsx, m, vp) => {
    const ctx = await b.newContext({ viewport: vp || { width: 1360, height: 900 }, acceptDownloads: true });
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, mm]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: mm, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, m]);
    const A = await ctx.newPage();
    A.on('pageerror', e => out.errors.push(e.message)); A.on('console', mm => { if (mm.type() === 'error' && !/ERR_FAILED|net::/.test(mm.text())) out.errors.push(mm.text()); });
    await A.goto('http://127.0.0.1:8793/'); await A.waitForTimeout(600);
    await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
    await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000); await A.evaluate(() => { location.hash = '#registrar'; });
    await A.waitForFunction(() => window.__api && window.__api.S.planilha && window.__api.S.planilha.meta, null, { timeout: 60000 }).catch(() => out.falhas.push('planilha não carregou'));
    await A.waitForTimeout(800);
    return { ctx, A };
  };
  const destravar = async A => { if (await A.evaluate(() => !document.querySelector('[data-view="trava"]').hidden)) { await A.fill('#trava-senha', 'trepniayks'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(400); } };
  const prod = (A, re) => A.evaluate(re => { const p = [...window.__api.S.produtos.values()].find(x => new RegExp(re).test(x.nome)); return p && { preco: p.preco, prazo: p.prazo, prazoDe: p.prazoDe, prazoPl: p.prazoPl, precoManual: p.precoManual }; }, re);
  const ultimoItem = A => A.evaluate(() => { const S = window.__api.S; const its = [...S.ledgers.values()].flatMap(L => L.itens || []); const it = its.sort((a, b) => a.t - b.t).pop(); return it && { nome: it.nome, k: it.k, vu: it.vu, total: it.total, caixa: it.caixa, pg: it.pg, parc: it.parc, taxa: it.taxa, taxaPct: it.taxaPct }; });
  const ler = async (A, cod) => { await A.fill('#scan', cod); await A.press('#scan', 'Enter'); await A.waitForTimeout(450); };
  const textoUltimo = A => A.evaluate(() => document.querySelector('#ultimo')?.innerText.replace(/\s+/g, ' '));

  // 1) planilha com a coluna Preço a prazo e a célula Acréscimo a prazo
  {
    const { ctx, A } = await abrir(xlsxPrazo, migr);
    out.c.meta = await A.evaluate(() => { const m = window.__api.S.planilha.meta; return { acrescimoPrazo: m.acrescimoPrazo, contagem: m.contagem }; });
    ok(out.c.meta.acrescimoPrazo === 12.6, 'acréscimo a prazo lido da célula J3 (12,6%)', out);
    ok(out.c.meta.contagem && out.c.meta.contagem.prazo === 25, 'contagem de produtos com preço a prazo (25)', out);
    const mec = await prod(A, '^ARTICULAÇÃO AXIAL MECÂNICA'), hid = await prod(A, '^ARTICULAÇÃO AXIAL HIDRÁULICA'), cal = await prod(A, '^CALOTA TESTE'),
      pneu = await prod(A, '^PNEU TESTE NOVO'), fil = await prod(A, '^FILTRO TESTE PRAZO'), sem = await prod(A, '^PEÇA TESTE SEM PREÇO'),
      av = await prod(A, '^ITEM AVULSO TESTE'), man = await prod(A, '^ITEM MANUAL TESTE');
    out.c.precos = { mec, hid, cal, pneu, fil, sem, av, man };
    ok(mec && mec.preco === 70 && mec.prazo === 80 && mec.prazoDe === 'planilha', 'a prazo da planilha (70 → 80)', out);
    ok(hid && hid.preco === 81.74 && hid.prazo === 92.04 && hid.prazoDe === 'calculado', 'sem a prazo na planilha: à vista + 12,6% (81,74 → 92,04)', out);
    ok(cal && cal.preco === 30.6 && cal.prazo === 34.46, 'calota: 30,60 → 34,46', out);
    ok(pneu && pneu.preco === 460 && pneu.prazo === 520, 'pneu arredondado de 10 em 10 na planilha (460 → 520)', out);
    ok(fil && fil.preco === 20 && fil.prazo === 30, 'a prazo digitado por cima na planilha vale como está', out);
    ok(sem && sem.preco == null && sem.prazo == null && sem.prazoDe === 'sem', 'sem preço nenhum: sem a prazo', out);
    ok(av && av.preco === 15 && av.prazo === 16.89, 'avulso: 15 → 16,89', out);
    ok(man && man.preco === 50 && man.prazo === 56.3 && man.prazoDe === 'manual', 'preço manual + 12,6% (50 → 56,30)', out);

    // Registrar: Parcelado pergunta as parcelas
    await A.click('.modo button[data-m="saida"]'); await A.waitForTimeout(200);
    await A.click('#pagamentos [data-pg="dinheiro"]'); await A.waitForTimeout(150);
    await A.click('#pagamentos [data-acao="pg-parcelado"]'); await A.waitForTimeout(200);
    out.c.escolha = await A.evaluate(() => ({ pg: window.__api.S.pg, ops: [...document.querySelectorAll('#pagamentos [data-parc]')].map(b => b.textContent), foco: document.activeElement?.dataset?.parc || null }));
    ok(out.c.escolha.pg === 'dinheiro' && out.c.escolha.ops.join(',') === '2x,3x,4x,5x,6x', 'ao marcar Parcelado aparece 2x a 6x (e ainda não muda a forma)', out);
    ok(out.c.escolha.foco === '3', 'foco vai para a parcela já escolhida (3x)', out);
    await A.screenshot({ path: path.join(SP, 'teste/pz1-escolha.png') });
    await A.click('#pagamentos [data-parc="4"]'); await A.waitForTimeout(200);
    out.c.chip = await A.evaluate(() => ({ pg: window.__api.S.pg, parc: window.__api.S.parc, txt: document.querySelector('#pagamentos [data-acao="pg-parcelado"]').textContent, ops: document.querySelectorAll('#pagamentos [data-parc]').length, dica: document.querySelector('#pagamentos .dica-quem')?.textContent, ls: [localStorage.getItem('pbr.pg'), localStorage.getItem('pbr.parc')] }));
    ok(out.c.chip.pg === 'parcelado' && out.c.chip.parc === 4 && out.c.chip.txt === 'Parcelado 4x' && out.c.chip.ops === 0, 'botão fica "Parcelado 4x"', out);
    ok(/preço a prazo · taxa 4,1%/.test(out.c.chip.dica || ''), 'dica mostra o preço a prazo e a taxa do crédito', out);
    await ler(A, '7898435680699');
    out.c.vendaParc = await ultimoItem(A); out.c.ultimoParc = await textoUltimo(A);
    ok(out.c.vendaParc && out.c.vendaParc.vu === 80 && out.c.vendaParc.pg === 'parcelado' && out.c.vendaParc.parc === 4 && out.c.vendaParc.taxa === 3.28 && out.c.vendaParc.caixa === 76.72, 'venda parcelada: preço a prazo 80, taxa 4,1% (3,28), caixa 76,72', out);
    ok(/4x de R\$\s?20,00/.test(out.c.ultimoParc || '') && /Parcelado 4x/.test(out.c.ultimoParc || '') && /Preço a prazo · coluna Preço a prazo da planilha/.test(out.c.ultimoParc || ''), 'último registro mostra 4x de R$ 20,00, a forma e a base', out);
    await A.screenshot({ path: path.join(SP, 'teste/pz2-venda-parcelada.png') });
    // sugestões mostram o preço a prazo
    await A.fill('#scan', 'hidraulica'); await A.waitForTimeout(400);
    out.c.sug = await A.evaluate(() => document.querySelector('#sug')?.innerText.replace(/\s+/g, ' ') || [...document.querySelectorAll('[data-acao="sug"]')].map(x => x.innerText).join(' | '));
    ok(/92,04/.test(out.c.sug || ''), 'sugestão mostra o preço a prazo no parcelado', out);
    await A.fill('#scan', ''); await A.keyboard.press('Escape');
    // à vista no crédito e no dinheiro
    await A.click('#pagamentos [data-pg="credito"]'); await A.waitForTimeout(150);
    await ler(A, '7898435680699'); out.c.vendaCred = await ultimoItem(A);
    ok(out.c.vendaCred && out.c.vendaCred.vu === 70 && out.c.vendaCred.pg === 'credito' && !out.c.vendaCred.parc && out.c.vendaCred.taxa === 2.87, 'crédito à vista: 70 com taxa 4,1%', out);
    await A.click('#pagamentos [data-pg="dinheiro"]'); await A.waitForTimeout(150);
    await ler(A, '7898435680699'); out.c.vendaDin = await ultimoItem(A);
    ok(out.c.vendaDin && out.c.vendaDin.vu === 70 && out.c.vendaDin.pg === 'dinheiro' && !out.c.vendaDin.taxa && out.c.vendaDin.caixa === 70, 'dinheiro: 70 sem taxa', out);
    // serviço no parcelado: mesmo preço, taxa do parcelado
    await A.click('#pagamentos [data-acao="pg-parcelado"]'); await A.waitForTimeout(150); await A.click('#pagamentos [data-parc="3"]'); await A.waitForTimeout(150);
    await A.click('#quem-chips [data-quem]'); await A.waitForTimeout(150);
    await A.click('#serv-chips [data-acao="reg-serv"]'); await A.waitForTimeout(400);
    out.c.serv = await ultimoItem(A);
    ok(out.c.serv && out.c.serv.k === 'serv' && out.c.serv.vu === 60 && out.c.serv.pg === 'parcelado' && out.c.serv.parc === 3 && out.c.serv.taxa === 2.46, 'serviço no parcelado: preço de sempre (60), taxa 2,46', out);
    // produto sem preço no parcelado: o valor digitado vale só para a venda
    await ler(A, 'PEÇA TESTE SEM PREÇO');
    out.c.semPrecoTxt = await textoUltimo(A);
    ok(/Preço a prazo unitário/.test(out.c.semPrecoTxt || '') && /vale só para esta venda/.test(out.c.semPrecoTxt || ''), 'sem preço no parcelado pede o preço a prazo', out);
    await A.fill('#sp-preco', '99'); await A.click('[data-acao="confirmar-sem-preco"]'); await A.waitForTimeout(400);
    out.c.semPrecoVenda = await ultimoItem(A); out.c.semPrecoProd = await prod(A, '^PEÇA TESTE SEM PREÇO');
    ok(out.c.semPrecoVenda && out.c.semPrecoVenda.vu === 99 && out.c.semPrecoVenda.pg === 'parcelado' && out.c.semPrecoVenda.parc === 3, 'venda parcelada com o preço digitado', out);
    ok(out.c.semPrecoProd && out.c.semPrecoProd.precoManual == null && out.c.semPrecoProd.preco == null, 'o preço a prazo digitado não vira preço à vista', out);
    await A.click('#pagamentos [data-pg="pix"]'); await A.waitForTimeout(150);
    await ler(A, 'PEÇA TESTE SEM PREÇO');
    out.c.semPrecoTxt2 = await textoUltimo(A);
    ok(/fica salvo como preço manual/.test(out.c.semPrecoTxt2 || ''), 'à vista sem preço continua salvando o preço manual', out);
    await A.fill('#sp-preco', '88'); await A.click('[data-acao="confirmar-sem-preco"]'); await A.waitForTimeout(500);
    out.c.semPrecoProd2 = await prod(A, '^PEÇA TESTE SEM PREÇO');
    ok(out.c.semPrecoProd2 && out.c.semPrecoProd2.precoManual === 88 && out.c.semPrecoProd2.prazo === 99.09, 'preço manual 88 → a prazo 99,09', out);
    // taxa própria do parcelado (Configurações)
    await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(400); await destravar(A); await A.waitForTimeout(300);
    out.c.cfgTxt = await A.evaluate(() => ({ prazo: [...document.querySelectorAll('#param-card p')].map(p => p.innerText).find(t => /Parcelado/.test(t) && /fiado/.test(t)), ph: document.querySelector('[data-cfg="taxaParcelado"]')?.placeholder, plan: document.querySelector('#plan-card').innerText.replace(/\s+/g, ' ') }));
    ok(/à vista \+ 12,6%/.test(out.c.cfgTxt.prazo || '') && /célula Acréscimo a prazo/.test(out.c.cfgTxt.prazo || ''), 'Preços explica o preço a prazo', out);
    ok(out.c.cfgTxt.ph === '4,1 (= crédito)', 'campo da taxa do parcelado mostra a do crédito', out);
    ok(/Acréscimo a prazo: 12,6%/.test(out.c.cfgTxt.plan) && /Produtos com preço a prazo na planilha: \d+/.test(out.c.cfgTxt.plan), 'cartão da planilha mostra o acréscimo', out);
    await A.fill('[data-cfg="taxaParcelado"]', '5'); await A.waitForTimeout(1200);
    out.c.cfgParc = await A.evaluate(() => window.__api.S.config.taxaParcelado);
    ok(out.c.cfgParc === 5, 'taxa do parcelado salva (5%)', out);
    out.c.colPrecos = await A.evaluate(() => [...document.querySelectorAll('#pr-tab thead th')].map(th => th.textContent));
    ok(out.c.colPrecos.length === 7 && out.c.colPrecos[5] === 'Preço a prazo', 'tabela de preços com a coluna Preço a prazo', out);
    await A.fill('#pr-q', 'hidraulica'); await A.waitForTimeout(300);
    out.c.linhaPr = await A.evaluate(() => document.querySelector('#pr-tab tbody tr')?.innerText.replace(/\s+/g, ' '));
    ok(/92,04 à vista \+ 12,6%/.test(out.c.linhaPr || ''), 'linha mostra o a prazo calculado', out);
    await A.click('#pr-tab tbody tr'); await A.waitForTimeout(400);
    out.c.ficha = await A.evaluate(() => document.querySelector('#d-calc')?.innerText.replace(/\s+/g, ' '));
    ok(/Preço a prazo \(parcelado e fiado\) R\$\s?92,04 \(à vista \+ 12,6%\)/.test(out.c.ficha || ''), 'ficha mostra o preço a prazo', out);
    await A.fill('#d-manual', '100'); await A.waitForTimeout(300);
    out.c.fichaManual = await A.evaluate(() => document.querySelector('#d-calc')?.innerText.replace(/\s+/g, ' '));
    ok(/R\$\s?112,60 \(preço manual \+ 12,6%\)/.test(out.c.fichaManual || ''), 'ficha recalcula o a prazo com o preço manual digitado', out);
    await A.screenshot({ path: path.join(SP, 'teste/pz3-ficha.png') });
    await A.keyboard.press('Escape'); await A.waitForTimeout(200);
    await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(300);
    await A.click('#pagamentos [data-acao="pg-parcelado"]'); await A.waitForTimeout(150); await A.click('#pagamentos [data-parc="2"]'); await A.waitForTimeout(150);
    await ler(A, '7898435680699'); out.c.vendaTaxa5 = await ultimoItem(A);
    ok(out.c.vendaTaxa5 && out.c.vendaTaxa5.taxa === 4 && out.c.vendaTaxa5.taxaPct === 5 && out.c.vendaTaxa5.parc === 2, 'parcelado com a taxa própria (5% de 80 = 4)', out);
    // fiado: nota a receber com o preço a prazo
    await A.evaluate(() => { location.hash = '#receber'; }); await A.waitForTimeout(400);
    await A.click('[data-acao="nova-nota"][data-col="receber"]'); await A.waitForTimeout(400);
    await A.fill('#nd-leitor', '7898435680699'); await A.press('#nd-leitor', 'Enter'); await A.waitForTimeout(300);
    await A.fill('#nd-leitor', 'calota'); await A.waitForTimeout(300);
    out.c.ndBusca = await A.evaluate(() => document.querySelector('#nd-res')?.innerText.replace(/\s+/g, ' '));
    out.c.ndItens = await A.evaluate(() => window.__api.S.nd.itens.map(i => ({ nome: i.nome, vu: i.vu })));
    ok(out.c.ndItens.length === 1 && out.c.ndItens[0].vu === 80, 'fiado usa o preço a prazo (80)', out);
    ok(/34,46/.test(out.c.ndBusca || ''), 'busca da nota a receber mostra o preço a prazo', out);
    await A.keyboard.press('Escape'); await A.waitForTimeout(200);
    // caixa por forma de pagamento
    await A.evaluate(() => { location.hash = '#caixa'; }); await A.waitForTimeout(400); await destravar(A); await A.waitForTimeout(300);
    out.c.caixaPg = await A.evaluate(() => [...document.querySelectorAll('#c-pg tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
    ok(out.c.caixaPg.some(t => /^Parcelado/.test(t)), 'caixa mostra a linha Parcelado', out);
    out.c.caixaLinhas = await A.evaluate(() => [...document.querySelectorAll('#c-tab tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')).filter(t => /Parcelado/.test(t)).length);
    ok(out.c.caixaLinhas >= 3, 'lançamentos do caixa mostram "Parcelado Nx"', out);
    // produtos: coluna e CSV
    await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(400);
    out.c.colProd = await A.evaluate(() => [...document.querySelectorAll('#p-tab thead th')].map(th => th.textContent));
    ok(out.c.colProd.length === 7 && out.c.colProd[5] === 'Preço a prazo', 'Produtos com a coluna Preço a prazo', out);
    await A.fill('#p-q', 'BA-8003'); await A.waitForTimeout(300);
    out.c.linhaProd = await A.evaluate(() => document.querySelector('#p-tab tbody tr')?.innerText.replace(/\s+/g, ' '));
    ok(/R\$\s?80,00 planilha/.test(out.c.linhaProd || ''), 'linha do produto mostra o a prazo da planilha', out);
    await A.fill('#p-q', ''); await A.waitForTimeout(200);
    const [dl] = await Promise.all([A.waitForEvent('download', { timeout: 8000 }), A.click('#p-csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
    out.c.csvCab = csv[0]; out.c.csvMec = csv.find(l => /MECÂNICA UNO/.test(l));
    ok(/;Preço de venda;Base do preço;Preço a prazo;Base do preço a prazo$/.test(out.c.csvCab), 'CSV com as colunas do preço a prazo', out);
    ok(/;70;Preço de venda da planilha;80;coluna Preço a prazo da planilha$/.test(out.c.csvMec || ''), 'CSV traz o a prazo em número', out);
    await A.screenshot({ path: path.join(SP, 'teste/pz4-produtos.png') });
    // a escolha fica guardada ao recarregar
    await A.reload(); await A.waitForTimeout(2500); await A.evaluate(() => { location.hash = '#registrar'; }); await A.waitForTimeout(800);
    out.c.recarregado = await A.evaluate(() => ({ pg: window.__api?.S.pg, parc: window.__api?.S.parc, txt: document.querySelector('#pagamentos [data-acao="pg-parcelado"]')?.textContent }));
    ok(out.c.recarregado.pg === 'parcelado' && out.c.recarregado.parc === 2 && out.c.recarregado.txt === 'Parcelado 2x', 'Parcelado 2x continua depois de recarregar', out);
    // celular: escolha aberta sem rolagem lateral
    await A.setViewportSize({ width: 390, height: 844 }); await A.click('.modo button[data-m="saida"]'); await A.waitForTimeout(200);
    await A.click('#pagamentos [data-acao="pg-parcelado"]'); await A.waitForTimeout(300);
    out.c.largura = await A.evaluate(() => document.documentElement.scrollWidth);
    ok(out.c.largura <= 390, 'sem rolagem lateral no celular', out);
    await A.screenshot({ path: path.join(SP, 'teste/pz5-celular.png'), fullPage: false });
    await A.evaluate(() => document.documentElement.setAttribute('data-tema', 'escuro')); await A.waitForTimeout(200);
    await A.screenshot({ path: path.join(SP, 'teste/pz6-celular-noturno.png'), fullPage: false });
    await ctx.close();
  }
  // 2) planilha sem a célula e sem a coluna: à vista + 12,6%
  {
    const { ctx, A } = await abrir(xlsxSem, { 'config/geral': cfg });
    out.c.semMeta = await A.evaluate(() => window.__api.S.planilha.meta.acrescimoPrazo);
    const mec = await prod(A, '^ARTICULAÇÃO AXIAL MECÂNICA'), fil = await prod(A, '^FILTRO TESTE PRAZO');
    out.c.semPrecos = { mec, fil };
    ok(out.c.semMeta == null, 'sem a célula não há acréscimo lido', out);
    ok(mec && mec.preco === 70 && mec.prazo === 78.82 && mec.prazoDe === 'calculado', 'sem a coluna: 70 + 12,6% = 78,82', out);
    ok(fil && fil.prazo === 22.52, 'sem a coluna: 20 + 12,6% = 22,52', out);
    await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(400); await destravar(A); await A.waitForTimeout(300);
    out.c.semPlan = await A.evaluate(() => document.querySelector('#plan-card').innerText.replace(/\s+/g, ' '));
    ok(/Acréscimo a prazo: célula não encontrada \(vale 12,6%\)/.test(out.c.semPlan), 'cartão avisa que a célula não foi encontrada', out);
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
  process.exit(out.falhas.length || out.errors.length ? 1 : 0);
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
