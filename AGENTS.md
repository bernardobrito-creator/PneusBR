# PneusBR

Instruções para qualquer agente (Claude Code, Codex e outros). O `CLAUDE.md` importa este arquivo e só acrescenta o que é do Claude.

## Produto e stack

- Produto e escopo: `PRODUCT.md`. Arquitetura e segurança: `README.md`.
- Stack: HTML + JavaScript num único arquivo (`src/app.html`), shim do Supabase (`src/shim.html`), gerador em Python 3 (`src/build_site.py`), funções e regras do Supabase em `supabase/`, testes em Node + Playwright (`testes/`). Sem `package.json` e sem gerenciador de pacotes no projeto.
- O repositório é **público**: nunca grave chaves, `.env`, dados de clientes, planilhas ou o ID da planilha.

## Comandos

- Gerar o site: `python3 src/build_site.py src/app.html src/shim.html docs`. Precisa sair idêntico ao `docs/index.html` versionado quando `src/` não mudou.
- Testes: `./testes/preparar-site.sh <rascunho> && node testes/seguranca.js <rascunho>`. Os demais `testes/*.js` seguem o mesmo padrão. Eles dependem de arquivos de teste que ficam fora do repositório (planilha de preços e tabela); sem eles, os testes não rodam: registre isso, não simule o resultado.
- Lint e tipos: não há (ESLint foi medido e não adotado; ver `PLUGINS-CLAUDE.md`).
- Publicar: commit na `main` e depois `git subtree split --prefix docs -b gh-pages && git push origin gh-pages`. Só com pedido explícito do dono.

## Acordos de trabalho

- Leia o código e as instruções antes de editar. Diga as suposições que mudam o comportamento ou o escopo.
- Mude só `src/`; o `docs/` é gerado e publicado no GitHub Pages. Não coloque documentação de projeto em `docs/`: ela iria para o site.
- Faça a menor mudança completa. Reaproveite o que já existe. Não crie abstrações, opções ou dependências que não foram pedidas.
- Preserve validação, tratamento de erros, segurança (CSP com hash, SRI, regras do banco) e acessibilidade.
- Rode os testes que existem. Não transforme suposição em fato nem integração pendente em resultado.
- Publicar, mandar mensagem a terceiros, gastar dinheiro e ações destrutivas (inclusive no banco do Supabase) exigem autorização. Ter uma ferramenta instalada não autoriza nada.
- Um bloqueio para só o que depende dele; continue o resto. Não repita uma tentativa idêntica sem evidência nova.

## Ferramentas

- **Caveman:** conversa concisa em português, sem perder clareza. Código, documentação e commits com redação normal. "stop caveman" desliga.
- **Ponytail (full):** a solução mais simples que resolve. "stop ponytail" desliga.
- **Superpowers:** use as skills que servirem, na escala do pedido.
- **Context7:** para documentação atual de bibliotecas (supabase-js, Playwright, SheetJS, JsBarcode). Uma pergunta por vez, sem código privado nem segredos. Se o MCP pedir login, use o CLI: `npx -y ctx7@latest library <nome> "<pergunta>"` e depois `npx -y ctx7@latest docs <id> "<pergunta>"`.
- **`supabase-postgres-best-practices`:** carregue antes de mexer em `supabase/seguranca.sql`, tabelas, RLS, índices ou funções do banco. Não aplique migração sem autorização.
- **Revisão de segurança:** `/revisao-seguranca` (base do repositório) ou `/revisao-seguranca <base>..<head>` (diff). Só leitura; o relatório fica fora do repositório. `differential-review` entra no modo diff. "Nenhum achado" não garante segurança.

## Delegação e revisão

- Delegue só quando isolar contexto ou paralelizar compensar. Um arquivo, um escritor; revisores só leem.
- Confira o diff e os testes antes de aceitar o trabalho de outro agente.
- Mudança que não é trivial passa por revisão independente quando houver, com escopo no risco real.
