# Planilha de teste no formato de 17/11/2026: a coluna C da "Tabela de preços" se chama Setor
# (Pneus, Peças, Filtros, Óleos, Fluidos, Ferramentas, Acessórios), a coluna H traz o markup do setor
# e a aba nova "Markup por setor" tem um markup para cada setor. As abas Produtos (com média de mercado)
# e Pesquisa de Mercado continuam lá, mas o sistema não deve usar os valores da pesquisa. Dados fictícios.
# Uso (dentro da pasta de rascunho): python3 /caminho/testes/mkprecos4.py
#   gera teste/planilha-setores.xlsx.b64 (com a aba Markup por setor) e teste/planilha-semaba.xlsx.b64 (sem ela)
import base64, io, json, re, openpyxl, math

MK = [('Pneus', 1.53), ('Peças', 1.73), ('Filtros', 1.93), ('Óleos', 1.67), ('Fluidos', 1.67), ('Ferramentas', 1.53), ('Acessórios', 1.53)]
MKD = dict(MK)

def setor(nome):
    n = nome.lower()
    if n.startswith('pneu'): return 'Pneus'
    if re.match(r'(chave|extrator|ferramenta)', n): return 'Ferramentas'
    if 'filtro' in n: return 'Filtros'
    if re.match(r'(calota|palheta)', n): return 'Acessórios'
    if re.match(r'(óleo|graxa|proteção superior)', n) or re.match(r'lubrificante (híbrido|multiaditivado|para motor|syntium)', n): return 'Óleos'
    if re.match(r'(aditivo|água|fluido|cola|descarbonizante|limpa|lubrificante)', n): return 'Fluidos'
    return 'Peças'

def gerar(com_aba):
    wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(open('teste/planilha.xlsx.b64').read())))
    ws = wb.create_sheet('Tabela de preços', 0)
    ws.append(['TABELA DE PREÇOS'])
    ws.append(['Cadastro principal da loja. Setor na coluna C; o markup de cada setor fica na aba Markup por setor.'])
    ws.append([None, None, None, None, 'Markup do mês', 1.53, 'Margem bruta', 0.346])
    ws.append(['Pesquisar:', 'ba8003', '1 produto encontrado'])
    ws.append(['Código de barras', 'Produto', 'Setor', 'Código', 'Custo (R$)', 'Venda (R$)', 'Na tabela'])
    ws.append(['7898435680699', 'ARTICULAÇÃO AXIAL MECÂNICA UNO/FIORINO APÓS 93', 'Peças', 'BA-8003', 38.36, 70, 'ir para a linha 26'])
    for _ in range(6): ws.append([])
    ws.append(['Código de barras', 'Produto', 'Setor', 'Código de identificação', 'Preço de custo (R$)', 'Preço de venda (R$)', 'Observação', 'Markup do setor'])
    barras = {'ARTICULAÇÃO AXIAL MECÂNICA UNO/FIORINO APÓS 93': '7898435680699', 'CHAVE P/ FILTRO DE ÓLEO 66,3MM 101035': '7890000000031'}
    cods = {'ARTICULAÇÃO AXIAL MECÂNICA UNO/FIORINO APÓS 93': 'BA-8003', 'ARTICULAÇÃO AXIAL HIDRÁULICA UNO/FIORINO APÓS 93': 'BA-8037', 'CHAVE P/ FILTRO DE ÓLEO 66,3MM 101035': '101035'}
    TIRE = re.compile(r'P?(\d{3})/(\d{2})R(\d{2})')
    for nome, custo, cod, aba in json.load(open('teste/tabela-precos.json')):
        m = TIRE.search(nome); s = setor(nome)
        venda = math.ceil(round(custo * MKD[s], 2) / 5) * 5 if custo else ''
        # a hidráulica fica sem preço de venda na planilha: o sistema calcula custo × markup do setor
        if nome.startswith('ARTICULAÇÃO AXIAL HIDRÁULICA'): venda = ''
        ws.append([barras.get(nome), nome, s, f'{m.group(1)}/{m.group(2)}R{m.group(3)}' if m else cods.get(nome), custo, venda, None, MKD[s]])
    # produtos novos só na Tabela
    ws.append([None, 'CALOTA TESTE ARO 13 MARCA TESTE', 'Acessórios', 'LC-999', 20, '', None, 1.53])
    ws.append([None, 'ADITIVO TESTE PRONTO PARA USO 1L MARCA TESTE', 'Fluidos', '', 12, '', None, 1.67])
    ws.append([None, 'Lubrificante Híbrido Sintético Z 5W-30 MARCA TESTE', 'Óleos', '', 30, '', None, 1.67])
    ws.append([None, 'PNEU TESTE NOVO 205/65R16 95H MARCA TESTE', 'Pneu', '205/65R16', 300, 460, None, 1.53])  # "Pneu" antigo ainda vale
    ws.append([None, 'PALHETA TESTE 18" MARCA TESTE', '', '', 10, '', None, ''])  # sem setor: o sistema deduz pelo nome
    if com_aba:
        mk = wb.create_sheet('Markup por setor', 1)
        mk.append(['MARKUP POR SETOR'])
        mk.append(['Cada setor tem o seu markup. Mude só a coluna Markup; a Tabela de preços usa o markup do setor de cada produto.'])
        mk.append([])
        mk.append(['Setor', 'Markup', 'Margem bruta', 'Produtos na tabela', 'O que entra neste setor'])
        for s, v in MK: mk.append([s, v, round(1 - 1 / v, 4), 0, 'texto de teste'])
        mk.append([])
        mk.append(['Observação: setor novo precisa entrar aqui e na lista da coluna Setor.'])
    out = io.BytesIO(); wb.save(out)
    nome = 'teste/planilha-setores.xlsx.b64' if com_aba else 'teste/planilha-semaba.xlsx.b64'
    open(nome, 'w').write(base64.b64encode(out.getvalue()).decode())
    print(nome, wb.sheetnames, ws.max_row)

gerar(True); gerar(False)
