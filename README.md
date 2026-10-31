# PneusBR

Sistema de estoque, caixa e gestão da PneusBR: leitor de código de barras, preços pela planilha de precificação (custo × markup), caixa, faturamento, balanço semanal, notas a pagar e a receber e rotina da empresa.

- Site: publicado pelo GitHub Pages a partir da pasta `docs/`.
- Dados e login: Supabase (projeto `pneusbr`, São Paulo). As regras de acesso deixam só os membros cadastrados lerem e gravarem.
- Planilha: lida pela função `planilha` do Supabase. Ela precisa continuar compartilhada como "qualquer pessoa com o link pode ver".

Atualizações são feitas pelo Claude; não edite `index.html` à mão sem avisar, porque ele é gerado.

## Estrutura
- `docs/` — o site publicado (GitHub Pages: branch `main`, pasta `/docs`). Gerado, não editar à mão.
- `src/app.html` — o sistema (telas e regras). É a fonte única; também roda como artifact no Claude.
- `src/shim.html` — troca o banco do Claude pelo Supabase, tela de login, equipe, downloads.
- `src/build_site.py` — gera `docs/index.html`: `python3 src/build_site.py src/app.html src/shim.html docs`
- `testes/` — testes com banco e leitor simulados (Playwright).
