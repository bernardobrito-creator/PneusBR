# PneusBR — produto

Escrito a partir do `README.md` e das telas de `src/app.html`. O que não está escrito lá aparece em "Suposições e decisões pendentes", não como fato.

## Problema e objetivo

Uma loja de pneus e serviços automotivos precisa controlar estoque, caixa, vendas a prazo, contas a pagar e o retorno de clientes sem planilhas soltas. O sistema junta isso num site só, usando o leitor de código de barras no balcão e os preços da planilha de precificação da loja.

## Público e papéis

- Dono: cria a conta, convida a equipe e é o único que muda as configurações (regras em `supabase/seguranca.sql`).
- Membros da equipe: leem e gravam os dados da loja depois de cadastrados.
- Quem não é membro não lê nem grava nada.

## Funções existentes (telas)

- Registrar: venda de produtos e serviços pelo leitor de código de barras.
- Produtos e estoque: lista vinda da planilha, com estoque e códigos vinculados.
- Serviços: serviços da loja com preço e código.
- Preços e markup: preço de venda = custo × markup do mês (ou média de mercado sem custo).
- Movimentações: tudo que entrou e saiu do estoque e do caixa.
- Caixa, Faturamento e Balanço geral (semana).
- Notas a pagar (com leitura de boleto/nota fiscal) e Notas a receber (vendas a prazo e fiado).
- Clientes: serviços por cliente e lembrete de retorno com mensagem pronta para o WhatsApp.
- Rotina da empresa (tarefas diárias a anuais) e Colaboradores (pagamentos, vales, retiradas e quem fez cada serviço).

## Requisitos e restrições

- Interface em português, para uso no balcão (desktop) e no celular (PWA).
- Site estático no GitHub Pages; dados e login no Supabase (região São Paulo).
- Repositório público: nenhum segredo, chave privada ou dado de cliente no código.
- Segurança do site: CSP com hash por script, SRI nas bibliotecas, sem abrir em moldura, sem referer.
- A planilha de preços é lida no servidor (função `planilha`); o ID dela não fica no código.

## Suposições e decisões pendentes

- Volume de uso (número de lojas, de usuários, de produtos) não está documentado. Supõe-se uma loja só.
- Não há critérios de aceite escritos para cada tela; hoje os testes em `testes/` fazem esse papel.

## Critérios de aceite

- O build (`src/build_site.py`) gera o `docs/index.html` sem erro, com CSP válida.
- Os testes de `testes/` passam com os arquivos de teste locais.
- Login e permissões seguem `supabase/seguranca.sql`: só membros acessam, só o dono configura.

## Manutenção

Atualize este arquivo quando o objetivo, as telas ou as restrições mudarem. Detalhes técnicos ficam no `README.md` e no `AGENTS.md`.
