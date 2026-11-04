# Planilha de teste igual à aba real "Tabela de preços" (título, markup em C3/D3, cabeçalho na linha 5)
import base64, io, json, openpyxl
wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(open('teste/planilha.xlsx.b64').read())))
ws = wb.create_sheet('Tabela de preços')
ws.append(['TABELA DE PREÇOS'])
ws.append(['Preencha as células amarelas: o markup do mês e o preço de custo de cada produto. O preço de venda é calculado sozinho (preço de custo × markup do mês). O código de barras pode ser lido com o leitor direto na coluna A.'])
ws.append([None, None, 'Markup do mês', 1.43])
ws.append([])
ws.append(['Código de barras', 'Produto', 'Preço de custo (R$)', 'Preço de venda (R$)'])
barras = {'ARTICULAÇÃO AXIAL HIDRÁULICA UNO/FIORINO APÓS 93': '7891234567895', 'CHAVE P/ FILTRO DE ÓLEO 66,3MM 101035': '7890000000031', 'PNEU CF510 175/75R13 4PR 85T TL COMFORSER': '0789000000048'}
for nome, custo, cod, aba in json.load(open('teste/tabela-precos.json')):
    ws.append([barras.get(nome), nome, custo, round(custo * 1.43, 2) if custo else ''])
out = io.BytesIO(); wb.save(out)
open('teste/planilha-precos2.xlsx.b64', 'w').write(base64.b64encode(out.getvalue()).decode())
print(ws.max_row)
