// Gera DANFE e boleto de teste (PNG escaneado, PDF digital e PDF só imagem)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const SP = process.argv[2], D = path.join(SP, 'teste/notas'), dados = JSON.parse(fs.readFileSync(path.join(D, 'dados.json')));
const jsb = fs.readFileSync(path.join(SP, 'libs/node_modules/jsbarcode/dist/JsBarcode.all.min.js'), 'utf8');
const grupos = s => s.match(/.{1,4}/g).join(' ');
const danfe = `<html><body style="margin:0;font:13px Arial;width:794px;padding:30px;box-sizing:border-box">
<div style="border:1px solid #000;padding:10px;display:flex;justify-content:space-between"><div><b style="font-size:16px">AUTO PEÇAS TESTE LTDA</b><br>Rua das Oficinas, 100 - Belo Horizonte - MG<br>CNPJ 12.345.678/0001-95</div>
<div style="text-align:center"><b>DANFE</b><br>Documento Auxiliar da Nota Fiscal Eletrônica<br>Nº 000.009.497<br>SÉRIE 001</div>
<div style="text-align:center"><svg id="b"></svg><br>CHAVE DE ACESSO<br><span style="font-size:11px">${grupos(dados.chave)}</span></div></div>
<div style="border:1px solid #000;border-top:0;padding:8px">DESTINATÁRIO / REMETENTE: PNEUSBR COMERCIO · CNPJ 98.765.432/0001-10 · DATA DA EMISSÃO 01/11/2026</div>
<div style="border:1px solid #000;border-top:0;padding:8px"><b>FATURA / DUPLICATA</b><br>001 01/12/2026 1.234,56 &nbsp;&nbsp; 002 31/12/2026 1.234,56</div>
<div style="border:1px solid #000;border-top:0;padding:8px"><b>CÁLCULO DO IMPOSTO</b><br>VALOR TOTAL DOS PRODUTOS 2.469,12 &nbsp; VALOR TOTAL DA NOTA 2.469,12</div>
<div style="border:1px solid #000;border-top:0;padding:8px;height:420px"><b>DADOS DOS PRODUTOS / SERVIÇOS</b><br>GP30120 AMORTECEDOR DIANTEIRO COFAP 2 UN 300,00 600,00<br>LB55 FILTRO DE OLEO VOX LB55 10 UN 18,50 185,00</div>
<script>${jsb}</script><script>JsBarcode('#b','${dados.chave}',{format:'CODE128C',height:50,width:1.1,displayValue:false,margin:4})</script></body></html>`;
const boleto = `<html><body style="margin:0;font:13px Arial;width:794px;padding:30px;box-sizing:border-box">
<div style="border-bottom:2px solid #000;padding:6px 0;display:flex;gap:20px;align-items:baseline"><b style="font-size:18px">Banco Itaú | 341-7</b><span style="font-size:15px">${dados.l1}</span></div>
<div style="border:1px solid #000;padding:8px">Beneficiário: AUTO PEÇAS TESTE LTDA · CNPJ 12.345.678/0001-95 &nbsp; Vencimento 01/12/2026 &nbsp; Valor do documento 1.234,56</div>
<div style="border:1px solid #000;border-top:0;padding:8px">Pagador: PNEUSBR COMERCIO · Nosso número 1234567 · NF 9497 parcela 1/2</div>
<div style="padding:16px 0"><svg id="b"></svg></div>
<script>${jsb}</script><script>JsBarcode('#b','${dados.b1}',{format:'ITF',height:60,width:1.5,displayValue:false,margin:6})</script></body></html>`;
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2.2 })).newPage();
  await p.setContent(danfe); await p.screenshot({ path: path.join(D, 'danfe.png') }); await p.pdf({ path: path.join(D, 'danfe-digital.pdf'), format: 'A4', printBackground: true });
  await p.setContent(boleto); await p.screenshot({ path: path.join(D, 'boleto.png') });
  // foto torta e escura, como de celular
  await p.setContent(danfe.replace('<body style="', '<body style="transform:rotate(1.5deg);filter:brightness(.9) contrast(.9);'));
  await p.screenshot({ path: path.join(D, 'danfe-foto.jpg'), type: 'jpeg', quality: 70 });
  await b.close();
})();
