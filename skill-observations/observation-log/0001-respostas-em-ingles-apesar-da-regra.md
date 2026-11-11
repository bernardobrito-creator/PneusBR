---
id: 1
title: "Respostas saíram em inglês apesar da regra escrita de responder em português"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: [AGENTS.md]
siblings_checked: "none — no family registry; target is an instructions file, not a skill"
area: "idioma das respostas ao dono"
date: 2026-11-11
session_context: "pesquisa de temas para vídeo do Instagram e instalação de plugins, em sessão longa com instruções e ferramentas em inglês"
parked_until:
resolved:
resolution:
reference:
commands_verified: none
next_actor: review
use_evidence:
escalated:
---

**Issue:** O dono pediu, no próprio prompt da tarefa, "fale sempre em português do Brasil", e o `AGENTS.md` já dizia "conversa concisa em português". Mesmo assim, várias respostas da sessão saíram em inglês, incluindo a entrega do passo 1 (os 3 temas). O dono teve de corrigir e pedir a tradução. A proteção em jogo era só texto: escrita no arquivo de instruções e carregada no contexto, sem nenhuma checagem. O contexto da sessão estava cheio de instruções, saídas de ferramenta e skills em inglês, e a língua das respostas acompanhou esse contexto, não a regra.

**Suggested improvement:** Em `AGENTS.md`, a regra de idioma passou para o topo, como regra própria e explícita, cobrindo todo tipo de mensagem (feito nesta sessão, a pedido do dono). Se a falha voltar, não reescrever o texto: pôr uma barreira, por exemplo um hook `Stop` que verifica se a última resposta ao usuário está em português e bloqueia uma vez com a instrução de reescrever.

**Principle:** Uma regra de idioma escrita só no arquivo de instruções perde para o idioma dominante do contexto (instruções do sistema, ferramentas e documentos em outra língua). A regra precisa ficar no topo, separada e cobrindo todo tipo de mensagem. Na segunda falha, ela pede uma checagem automática no fim do turno, não um texto novo.
