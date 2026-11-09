# PneusBR

Sistema de estoque, caixa e gestão da PneusBR: leitor de código de barras, preços pela planilha de precificação (aba de preços: preço de custo × markup do mês), caixa, faturamento, balanço semanal, notas a pagar e a receber e rotina da empresa.

- Site: https://bernardobrito-creator.github.io/PneusBR/ (GitHub Pages, ramo `gh-pages`, que é uma cópia da pasta `docs/`).
- Dados e login: Supabase (projeto `pneusbr`, São Paulo). Só membros cadastrados leem e gravam; configurações só o dono muda (regras em `supabase/seguranca.sql`).
- Planilha: lida pela função `planilha` do Supabase. O ID fica no servidor, não no código. Com o segredo `GOOGLE_SA_JSON` (conta de serviço do Google com acesso de Leitor) a planilha pode ficar "Restrita"; sem ele, ela precisa continuar "qualquer pessoa com o link".

## Segurança
- O repositório é público: nunca coloque aqui chaves, senhas, `.env` ou dados de clientes (o `.gitignore` bloqueia os casos comuns). A chave `anon` do Supabase no `shim.html` é pública por projeto; o que protege os dados são as regras do banco.
- O site tem CSP (só roda script do próprio site e do jsDelivr, com impressão digital SRI nas bibliotecas), não abre dentro de outros sites e não manda referer.
- As funções do servidor só aceitam chamadas do site, têm limite de tentativas e não devolvem detalhes de erro.
- Teste de segurança: `./testes/preparar-site.sh <rascunho> && node testes/seguranca.js <rascunho>`.

Atualizações são feitas pelo Claude; não edite `index.html` à mão sem avisar, porque ele é gerado.

## Estrutura
- `docs/` — o site gerado. Não editar à mão. Para publicar, faça o commit na `main` e depois: `git subtree split --prefix docs -b gh-pages && git push origin gh-pages`
- `src/app.html` — o sistema (telas e regras). É a fonte única; também roda como artifact no Claude.
- `src/shim.html` — troca o banco do Claude pelo Supabase, tela de login, equipe, downloads.
- `src/build_site.py` — gera `docs/index.html`: `python3 src/build_site.py src/app.html src/shim.html docs`
- `testes/` — testes com banco e leitor simulados (Playwright).
