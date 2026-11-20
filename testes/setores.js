// Teste (17/11/2026): markup por setor lido da aba "Markup por setor" da planilha, coluna Setor da Tabela de preços
// (Óleos e Fluidos separados, Acessórios novo) e a pesquisa de preços na internet (média de mercado) fora do preço e das telas.
// Também confere o caso sem a aba (vale o markup salvo em Configurações, com o antigo "Óleos e fluidos"). Dados fictícios.
// Uso: ./testes/preparar-site.sh <rascunho> && (cd <rascunho> && python3 /caminho/testes/mkprecos4.py) && node testes/setores.js <rascunho>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const SP = process.argv[2];
const xlsxSetores = fs.readFileSync(path.join(SP, 'teste/planilha-setores.xlsx.b64'), 'utf8');
const xlsxSemAba = fs.readFileSync(path.join(SP, 'teste/planilha-semaba.xlsx.b64'), 'utf8');
const cfg = markupCat => ({ path: 'config/geral', colecao: 'config', doc_id: 'geral', data: { loja: 'PneusBR', markup: 1.43, markupModo: 'planilha', arredondar: 'centavo', ajusteMercado: 34.6, margem: 30, markupCat, variaveis: [] } });
const avulso = { path: 'produtos/a1teste', colecao: 'produtos', doc_id: 'a1teste', data: { nome: 'ITEM AVULSO TESTE', modelo: '', marca: '', cod: '', avulso: true, custoManual: 10, estoque: 0, codigos: [] } };
const ok = (c, m, out) => { if (!c) out.falhas.push(m); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8791', '--bind', '127.0.0.1'], { cwd: path.join(SP, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); const out = { errors: [], falhas: [], c: {} };
  const abrir = async (xlsx, migr, vp) => {
    const ctx = await b.newContext({ viewport: vp || { width: 1360, height: 900 }, acceptDownloads: true });
    await ctx.route(/fonts\./, r => r.abort());
    await ctx.route(/supabase-js@/, r => r.fulfill({ path: path.join(SP, 'teste/mock-supabase.js'), contentType: 'application/javascript' }));
    await ctx.route(/xlsx@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));
    await ctx.route(/jsbarcode@/, r => r.fulfill({ path: path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), contentType: 'application/javascript' }));
    await ctx.addInitScript(([x, m]) => { window.__xlsxB64 = x; if (!localStorage.getItem('mock-sb-db')) localStorage.setItem('mock-sb-db', JSON.stringify({ docs: m, membros: {}, users: {} })); window.__pbrTeste = api => { window.__api = api; }; }, [xlsx, migr]);
    const A = await ctx.newPage();
    A.on('pageerror', e => out.errors.push(e.message)); A.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) out.errors.push(m.text()); });
    await A.goto('http://127.0.0.1:8791/'); await A.waitForTimeout(600);
    await A.fill('#lc-nome', 'Bernardo'); await A.fill('#lc-email', 'loja@pneusbr.com'); await A.fill('#lc-senha', 'senha-forte-1'); await A.fill('#lc-senha2', 'senha-forte-1');
    await A.click('#f-criar button[type=submit]'); await A.waitForTimeout(3000); await A.evaluate(() => { location.hash = '#registrar'; });
    await A.waitForFunction(() => window.__api && window.__api.S.planilha && window.__api.S.planilha.meta, null, { timeout: 60000 }).catch(() => out.falhas.push('planilha não carregou'));
    await A.waitForTimeout(800);
    return { ctx, A };
  };
  const destravar = async A => { if (await A.evaluate(() => !document.querySelector('[data-view="trava"]').hidden)) { await A.fill('#trava-senha', 'trepniayks'); await A.press('#trava-senha', 'Enter'); await A.waitForTimeout(400); } };
  const dados = A => A.evaluate(() => {
    const S = window.__api.S, m = S.planilha.meta;
    const ach = re => { const p = [...S.produtos.values()].find(x => new RegExp(re).test(x.nome)); return p && { nome: p.nome, grupo: p.grupo, tipo: p.tipo, preco: p.preco, fonte: p.fonte, mk: p.mk, mkDe: p.mkDe, origem: p.origem, temMercado: 'mercado' in p, anuncios: p.anuncios }; };
    const porGrupo = {}; for (const p of S.produtos.values()) porGrupo[p.grupo] = (porGrupo[p.grupo] || 0) + 1;
    const linhasMercado = [...S.planilha.partes.values()].flatMap(pt => pt.linhas || []).filter(l => 'mercado' in l || 'anuncios' in l || 'busca' in l).length;
    return { markupSetor: m.markupSetor, contagem: m.contagem, porGrupo, linhasMercado,
      hid: ach('^ARTICULAÇÃO AXIAL HIDRÁULICA'), mec: ach('^ARTICULAÇÃO AXIAL MECÂNICA'), calota: ach('^CALOTA TESTE'), aditivo: ach('^ADITIVO TESTE'), lub: ach('^Lubrificante Híbrido Sintético Z'),
      pneuNovo: ach('^PNEU TESTE NOVO'), palheta: ach('^PALHETA TESTE'), amort: S.produtos.get('e12071') && (() => { const p = S.produtos.get('e12071'); return { preco: p.preco, fonte: p.fonte, origem: p.origem, temMercado: 'mercado' in p }; })(),
      avulso: (() => { const p = S.produtos.get('a1teste'); return p && { preco: p.preco, mk: p.mk, mkDe: p.mkDe, grupo: p.grupo }; })(),
      idxPneu: S.indice.has('20565R16') };
  });

  // 1) planilha com a aba Markup por setor (o markup salvo em Configurações não vale para os setores)
  {
    const { ctx, A } = await abrir(xlsxSetores, { 'config/geral': cfg({ Avulsos: 1.5, 'Óleos e fluidos': 1.9, 'Peças': 1.8 }), 'produtos/a1teste': avulso });
    const d = await dados(A); out.c.comAba = d;
    ok(JSON.stringify(d.markupSetor) === JSON.stringify({ Pneus: 1.53, 'Peças': 1.73, Filtros: 1.93, 'Óleos': 1.67, Fluidos: 1.67, Ferramentas: 1.53, 'Acessórios': 1.53 }), 'markup por setor lido da aba', out);
    ok(d.contagem && !('mercado' in d.contagem), 'contagem sem média de mercado', out);
    ok(d.linhasMercado === 0, 'nenhuma linha guardada com média de mercado ou anúncios', out);
    ok(d.hid && d.hid.grupo === 'Peças' && d.hid.preco === 81.74 && d.hid.fonte === 'custo' && d.hid.mk === 1.73 && d.hid.mkDe === 'setor', 'Peças sem venda na planilha: custo × 1,73', out);
    ok(d.mec && d.mec.preco === 70 && d.mec.fonte === 'planilha', 'preço de venda da planilha continua valendo', out);
    ok(d.calota && d.calota.grupo === 'Acessórios' && d.calota.preco === 30.6 && d.calota.mk === 1.53, 'Acessórios: custo × 1,53', out);
    ok(d.aditivo && d.aditivo.grupo === 'Fluidos' && d.aditivo.preco === 20.04 && d.aditivo.mk === 1.67, 'Fluidos: custo × 1,67', out);
    ok(d.lub && d.lub.grupo === 'Óleos' && d.lub.preco === 50.1, 'Óleos: custo × 1,67', out);
    ok(d.pneuNovo && d.pneuNovo.grupo === 'Pneus' && d.pneuNovo.preco === 460, 'setor antigo "Pneu" vira Pneus', out);
    ok(!d.idxPneu, 'medida de pneu não vira código', out);
    ok(d.palheta && d.palheta.grupo === 'Acessórios' && d.palheta.preco === 15.3, 'sem setor na planilha: deduz pelo nome (palheta = Acessórios)', out);
    ok(d.amort && d.amort.preco == null && d.amort.fonte === 'sem' && !d.amort.temMercado && d.amort.origem === '', 'produto só com média de mercado fica sem preço e sem a origem do Mercado Livre', out);
    ok(d.avulso && d.avulso.preco === 15 && d.avulso.mkDe === 'avulsos', 'avulso usa o markup de Avulsos', out);
    // telas
    await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(400); await destravar(A); await A.waitForTimeout(400);
    out.c.precos = await A.evaluate(() => {
      const t = document.querySelector('[data-view="precificacao"]').innerText;
      return { mercado: /m[eé]dia de mercado|mercado livre|pesquisa de mercado/i.test(t), ajuste: !!document.querySelector('[data-cfg="ajusteMercado"]'),
        setoresRO: [...document.querySelectorAll('#param-card .cat-row[data-setor]')].map(r => r.innerText.replace(/\s+/g, ' ').trim()),
        inputsSetor: [...document.querySelectorAll('#param-card [data-mkcat]')].map(i => i.dataset.mkcat), colunas: [...document.querySelectorAll('#pr-tab thead th')].map(th => th.textContent),
        planCard: document.querySelector('#plan-card').innerText.replace(/\s+/g, ' ') };
    });
    const pr = out.c.precos;
    ok(!pr.mercado && !pr.ajuste, 'tela de preços sem média de mercado', out);
    ok(pr.setoresRO.length === 7 && pr.setoresRO.some(s => /^Acessórios.*2 produto.*× 1,53$/.test(s)) && pr.setoresRO.some(s => /^Fluidos.*× 1,67$/.test(s)), 'setores mostrados da planilha', out);
    ok(JSON.stringify(pr.inputsSetor) === '["Avulsos"]', 'só Avulsos editável quando a planilha tem a aba', out);
    ok(pr.colunas.length === 7 && !pr.colunas.some(c => /mercado/i.test(c)), 'tabela de preços sem coluna de média de mercado (com a de preço a prazo)', out);
    ok(/Markup por setor: Pneus × 1,53 · Peças × 1,73/.test(pr.planCard), 'cartão da planilha mostra os markups por setor', out);
    await A.screenshot({ path: path.join(SP, 'teste/st1-precos.png'), fullPage: true });
    await A.fill('#pr-q', 'hidraulica'); await A.waitForTimeout(300);
    out.c.linhaHid = await A.evaluate(() => document.querySelector('#pr-tab tbody tr')?.innerText.replace(/\s+/g, ' '));
    ok(/do setor \(planilha\) · Peças/.test(out.c.linhaHid || ''), 'linha mostra o markup do setor', out);
    await A.click('#pr-tab tbody tr'); await A.waitForTimeout(400);
    out.c.drawer = await A.evaluate(() => document.querySelector('#d-calc')?.innerText.replace(/\s+/g, ' '));
    ok(/do setor Peças, aba Markup por setor da planilha/.test(out.c.drawer || '') && !/mercado/i.test(out.c.drawer || ''), 'ficha do produto mostra o setor', out);
    await A.screenshot({ path: path.join(SP, 'teste/st2-ficha.png') });
    await A.keyboard.press('Escape');
    // produtos: chips dos setores e CSV
    await A.evaluate(() => { location.hash = '#produtos'; }); await A.waitForTimeout(400);
    out.c.chips = await A.evaluate(() => [...document.querySelectorAll('#p-grupos .chip')].map(c => c.textContent));
    ok(JSON.stringify(out.c.chips) === JSON.stringify(['Todos', 'Pneus', 'Peças', 'Filtros', 'Óleos', 'Fluidos', 'Ferramentas', 'Acessórios', 'Avulsos']), 'chips com os setores da planilha', out);
    await A.click('#p-grupos [data-grupo="Acessórios"]'); await A.waitForTimeout(300);
    out.c.acessorios = await A.evaluate(() => [...document.querySelectorAll('#p-tab tbody tr td.nome b')].map(b => b.textContent));
    ok(out.c.acessorios.length === 2 && out.c.acessorios.every(n => /CALOTA TESTE|PALHETA TESTE/.test(n)), 'filtro Acessórios', out);
    out.c.sub = await A.evaluate(() => document.querySelector('#p-tab tbody tr td.nome .sub')?.textContent);
    ok(/^Acessório · /.test(out.c.sub || ''), 'identificação mostra o setor no singular', out);
    const [dl] = await Promise.all([A.waitForEvent('download', { timeout: 8000 }), A.click('#p-csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '');
    out.c.csvCab = csv.split(/\r?\n/)[0];
    ok(/;Setor;/.test(out.c.csvCab) && !/mercado/i.test(out.c.csvCab), 'CSV com a coluna Setor e sem média de mercado', out);
    await A.screenshot({ path: path.join(SP, 'teste/st3-produtos.png') });
    // celular
    await A.setViewportSize({ width: 390, height: 844 }); await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(500);
    out.c.larguraCelular = await A.evaluate(() => document.documentElement.scrollWidth);
    ok(out.c.larguraCelular <= 390, 'sem rolagem lateral no celular', out);
    await A.screenshot({ path: path.join(SP, 'teste/st4-celular.png'), fullPage: true });
    await ctx.close();
  }
  // 2) planilha sem a aba: vale o markup salvo em Configurações (Óleos e Fluidos caem no antigo "Óleos e fluidos")
  {
    const { ctx, A } = await abrir(xlsxSemAba, { 'config/geral': cfg({ 'Óleos e fluidos': 1.9, 'Peças': 1.8 }) });
    const d = await dados(A); out.c.semAba = d;
    ok(d.markupSetor == null, 'sem a aba não há markup por setor', out);
    ok(d.aditivo && d.aditivo.preco === 22.8 && d.aditivo.mkDe === 'categoria', 'Fluidos usa o "Óleos e fluidos" salvo', out);
    ok(d.lub && d.lub.preco === 57, 'Óleos usa o "Óleos e fluidos" salvo', out);
    ok(d.hid && d.hid.preco === 85.05, 'Peças usa o markup salvo', out);
    ok(d.calota && d.calota.preco === 30.6 && d.calota.mkDe === 'geral', 'Acessórios sem markup salvo: geral da planilha (1,53)', out);
    await A.evaluate(() => { location.hash = '#precificacao'; }); await A.waitForTimeout(400); await destravar(A); await A.waitForTimeout(300);
    out.c.cfgSemAba = await A.evaluate(() => ({ mc: window.__api.S.config.markupCat, pronto: document.querySelector('#param-card').dataset.pronto }));
    out.c.inputsSemAba = await A.evaluate(() => [...document.querySelectorAll('#param-card [data-mkcat]')].map(i => i.dataset.mkcat + '=' + (i.value || i.placeholder)));
    ok(out.c.inputsSemAba.length === 8 && out.c.inputsSemAba.includes('Fluidos=1,9') && out.c.inputsSemAba.includes('Peças=1,8'), 'sem a aba, os setores ficam editáveis', out);
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.kill();
  process.exit(out.falhas.length || out.errors.length ? 1 : 0);
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
