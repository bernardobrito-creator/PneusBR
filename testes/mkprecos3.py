# Planilha de teste no formato de 13/11/2026: "Tabela de preços" é a 1ª aba e o cadastro principal,
# com as colunas Código de barras | Produto | Tipo | Código de identificação | Preço de custo | Preço de venda,
# markup do mês em E3/F3 e as taxas da maquininha anotadas na aba Custos Fixos.
# Uso (dentro da pasta de rascunho): python3 /caminho/testes/mkprecos3.py
import base64, io, json, re, openpyxl
wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(open('teste/planilha.xlsx.b64').read())))
cf = wb['Custos Fixos']
for row in cf.iter_rows(min_row=5):
    if row[1].value and 'maquininha' in str(row[1].value).lower():
        row[3].value = '4,1% credito, 2,5% debito'
ws = wb.create_sheet('Tabela de preços', 0)
ws.append(['TABELA DE PREÇOS'])
ws.append(['Cadastro principal da loja: todo produto novo entra aqui.'])
ws.append([None, None, None, None, 'Markup do mês', 1.43])
ws.append([])
ws.append(['Código de barras', 'Produto', 'Tipo', 'Código de identificação', 'Preço de custo (R$)', 'Preço de venda (R$)'])
barras = {'ARTICULAÇÃO AXIAL MECÂNICA UNO/FIORINO APÓS 93': '7898435680699', 'CHAVE P/ FILTRO DE ÓLEO 66,3MM 101035': '7890000000031'}
cods = {'ARTICULAÇÃO AXIAL MECÂNICA UNO/FIORINO APÓS 93': 'BA-8003', 'ARTICULAÇÃO AXIAL HIDRÁULICA UNO/FIORINO APÓS 93': 'BA-8037', 'CHAVE P/ FILTRO DE ÓLEO 66,3MM 101035': '101035'}
TIRE = re.compile(r'P?(\d{3})/(\d{2})R(\d{2})')
for nome, custo, cod, aba in json.load(open('teste/tabela-precos.json')):
    m = TIRE.search(nome)
    tipo = 'Pneu' if nome.startswith('PNEU') else 'Produto' if re.search(r'Lubrificante|Fluido|CHAVE', nome) else 'Peça'
    ws.append([barras.get(nome), nome, tipo, f'{m.group(1)}/{m.group(2)}R{m.group(3)}' if m else cods.get(nome), custo, round(custo * 1.43, 2) if custo else ''])
# produto novo só na Tabela (não está nas abas Produtos/Não encontrados)
ws.append([None, 'PNEU TESTE NOVO 205/65R16 95H MARCA TESTE', 'Pneu', '205/65R16', 300, 429])
out = io.BytesIO(); wb.save(out)
open('teste/planilha-precos3.xlsx.b64', 'w').write(base64.b64encode(out.getvalue()).decode())
print(wb.sheetnames, ws.max_row)
