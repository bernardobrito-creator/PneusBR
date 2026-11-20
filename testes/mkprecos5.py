# Planilha de teste no formato de 19/11/2026: a "Tabela de preços" ganhou a coluna G "Preço a prazo (R$)"
# (venda × (1 + acréscimo), arredondada para cima em R$ 5) e a célula "Acréscimo a prazo" (I3/J3, 12,6%).
# Observação foi para H e Markup do setor para I. Dados fictícios.
# Uso (dentro da pasta de rascunho): python3 /caminho/testes/mkprecos5.py
#   gera teste/planilha-prazo.xlsx.b64 (com a célula J3) e teste/planilha-prazo-sem.xlsx.b64 (sem a célula e sem a coluna G)
import base64, io, json, re, openpyxl, math

MK = [('Pneus', 1.53), ('Peças', 1.73), ('Filtros', 1.93), ('Óleos', 1.67), ('Fluidos', 1.67), ('Ferramentas', 1.53), ('Acessórios', 1.53)]
MKD = dict(MK)
PZ = 0.126

def setor(nome):
    n = nome.lower()
    if n.startswith('pneu'): return 'Pneus'
    if re.match(r'(chave|extrator|ferramenta)', n): return 'Ferramentas'
    if 'filtro' in n: return 'Filtros'
    if re.match(r'(calota|palheta)', n): return 'Acessórios'
    if re.match(r'(óleo|graxa|proteção superior)', n) or re.match(r'lubrificante (híbrido|multiaditivado|para motor|syntium)', n): return 'Óleos'
    if re.match(r'(aditivo|água|fluido|cola|descarbonizante|limpa|lubrificante)', n): return 'Fluidos'
    return 'Peças'

def teto(v, m): return math.ceil(round(v, 2) / m - 1e-9) * m

def gerar(com_prazo):
    wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(open('teste/planilha.xlsx.b64').read())))
    ws = wb.create_sheet('Tabela de preços', 0)
    ws.append(['TABELA DE PREÇOS'])
    ws.append(['Cadastro principal da loja. G = preço a prazo (venda + acréscimo a prazo da célula J3).'])
    ws.append([None, None, None, None, 'Markup do mês', 1.53, 'Margem bruta', 0.346] + (['Acréscimo a prazo', PZ] if com_prazo else []))
    ws.append(['Pesquisar:', 'ba8003', '1 produto encontrado'])
    ws.append(['Código de barras', 'Produto', 'Setor', 'Código', 'Custo (R$)', 'Venda (R$)', 'A prazo (R$)', 'Na tabela'])
    ws.append(['7898435680699', 'ARTICULAÇÃO AXIAL MECÂNICA UNO/FIORINO APÓS 93', 'Peças', 'BA-8003', 38.36, 70, 80, 'ir para a linha 26'])
    for _ in range(6): ws.append([])
    cab = ['Código de barras', 'Produto', 'Setor', 'Código de identificação', 'Preço de custo (R$)', 'Preço de venda (R$)']
    ws.append(cab + (['Preço a prazo (R$)'] if com_prazo else []) + ['Observação', 'Markup do setor'])
    barras = {'ARTICULAÇÃO AXIAL MECÂNICA UNO/FIORINO APÓS 93': '7898435680699', 'CHAVE P/ FILTRO DE ÓLEO 66,3MM 101035': '7890000000031'}
    cods = {'ARTICULAÇÃO AXIAL MECÂNICA UNO/FIORINO APÓS 93': 'BA-8003', 'ARTICULAÇÃO AXIAL HIDRÁULICA UNO/FIORINO APÓS 93': 'BA-8037', 'CHAVE P/ FILTRO DE ÓLEO 66,3MM 101035': '101035'}
    TIRE = re.compile(r'P?(\d{3})/(\d{2})R(\d{2})')
    def linha(barra, nome, s, cod, custo, venda, prazo):
        return [barra, nome, s, cod, custo, venda] + ([prazo] if com_prazo else []) + [None, MKD.get(s, '')]
    for nome, custo, cod, aba in json.load(open('teste/tabela-precos.json')):
        m = TIRE.search(nome); s = setor(nome)
        venda = teto(custo * MKD[s], 5) if custo else ''
        if nome.startswith('ARTICULAÇÃO AXIAL HIDRÁULICA'): venda = ''  # sem venda: o sistema calcula custo × markup e o a prazo = à vista + 12,6%
        prazo = teto(venda * (1 + PZ), 5) if venda != '' else ''
        ws.append(linha(barras.get(nome), nome, s, f'{m.group(1)}/{m.group(2)}R{m.group(3)}' if m else cods.get(nome), custo, venda, prazo))
    ws.append(linha(None, 'CALOTA TESTE ARO 13 MARCA TESTE', 'Acessórios', 'LC-999', 20, '', ''))
    ws.append(linha(None, 'PNEU TESTE NOVO 205/65R16 95H MARCA TESTE', 'Pneus', '205/65R16', 300, 460, teto(460 * (1 + PZ), 10)))
    ws.append(linha(None, 'FILTRO TESTE PRAZO DIGITADO MARCA TESTE', 'Filtros', 'FT-1', 10, 20, 30))  # o dono digitou por cima do a prazo
    ws.append(linha(None, 'PEÇA TESTE SEM PREÇO MARCA TESTE', 'Peças', 'SP-1', '', '', ''))
    mk = wb.create_sheet('Markup por setor', 1)
    mk.append(['MARKUP POR SETOR']); mk.append(['texto de teste']); mk.append([])
    mk.append(['Setor', 'Markup', 'Margem bruta', 'Produtos na tabela', 'O que entra neste setor'])
    for s, v in MK: mk.append([s, v, round(1 - 1 / v, 4), 0, 'texto de teste'])
    out = io.BytesIO(); wb.save(out)
    nome = 'teste/planilha-prazo.xlsx.b64' if com_prazo else 'teste/planilha-prazo-sem.xlsx.b64'
    open(nome, 'w').write(base64.b64encode(out.getvalue()).decode())
    print(nome, wb.sheetnames, ws.max_row)

gerar(True); gerar(False)
