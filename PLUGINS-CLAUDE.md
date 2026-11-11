# Plugins do Claude Code neste projeto

Os 5 plugins do guia "5 Plugins do Claude Code" (fabiano.app), instalados na ordem do guia e testados em 11/11/2026.

| # | Plugin | Onde está ligado | Como liga |
|---|--------|------------------|-----------|
| 1 | OmniRoute | Só no seu computador | `omniroute launch` (abaixo) |
| 2 | Claude Mem | No projeto (`.claude/settings.json`) | Sozinho, em toda sessão |
| 3 | Headroom | Só no seu computador | `headroom wrap claude` (abaixo) |
| 4 | Claude Code Setup | No projeto (`.claude/settings.json`) | Peça "recommend automations for this project" |
| 5 | Task Observer (skill) | No projeto (`.claude/skills/task-observer` + `CLAUDE.md`) | Sozinho, em toda sessão |

Na primeira vez que abrir o projeto, o Claude Code pede para confiar nos marketplaces `claude-plugins-official` e `thedotmack`. Responda que sim.

## Por que OmniRoute e Headroom não estão no `.claude/settings.json`

Os dois funcionam como proxy: trocam o `ANTHROPIC_BASE_URL` para um servidor local (`localhost:20128` e `localhost:8787`). Se isso ficasse fixo no projeto, toda sessão sem o proxy ligado (incluindo as sessões na nuvem do claude.ai) ficaria sem resposta. Por isso, eles são ligados por comando, só no seu computador.

## 1) OmniRoute — continuar quando o limite acabar

```bash
npm install -g omniroute
```

```bash
omniroute
```

1. Abra http://localhost:20128, conecte os provedores que você quer usar (assinatura, chaves de API, provedores gratuitos) e monte a ordem de fallback.
2. Em Dashboard → Endpoints, copie a chave.
3. Gere os perfis do Claude Code e abra o Claude por dentro do OmniRoute:

```bash
omniroute setup-claude --api-key SUA_CHAVE
```

```bash
omniroute launch
```

Cuidado: para o Claude Code, o endereço é `http://localhost:20128`, **sem** `/v1`. O `/v1` serve só para ferramentas compatíveis com OpenAI.

Também ao abrir: por padrão o OmniRoute escuta em todas as interfaces e sem chave. Em rede que não seja a sua, inicie com:

```bash
OMNIROUTE_SERVER_HOST=127.0.0.1 REQUIRE_API_KEY=true omniroute
```

Depois de ligar, confira com `/model` qual modelo está ativo. Quando o limite do Claude acaba, você passa a usar outro modelo.

## 2) Claude Mem — memória entre sessões

Já está ativo pelo `.claude/settings.json`. O worker sobe sozinho na porta 37700 e grava a memória em `~/.claude-mem/`.

- Para ver o que ele guardou: `claude-mem status`, ou peça ao Claude "o que fizemos na sessão anterior?".
- Não instale com `npm install -g claude-mem`. Assim os hooks não são registrados.
- Na nuvem, a memória fica no contêiner e zera a cada sessão nova. No seu computador, ela persiste.

## 3) Headroom — menos tokens

```bash
pip install "headroom-ai[all]"
```

```bash
export HEADROOM_TELEMETRY=off
```

```bash
headroom wrap claude
```

O `HEADROOM_TELEMETRY=off` desliga o envio de estatísticas de uso, que vem ligado por padrão. Coloque essa linha no seu `~/.bashrc` ou `~/.zshrc`. Para ver quanto economizou: `headroom savings`.

Para usar com o OmniRoute junto, ligue o OmniRoute primeiro e depois rode o Headroom apontando para ele (veja `headroom wrap claude --help`).

## 4) Claude Code Setup — recomendações para o projeto

Peça ao Claude: "recommend automations for this project" ou "what hooks should I use?". O plugin só lê o projeto e não altera nenhum arquivo.

## 5) Task Observer — aprende com as suas correções

A skill está em `.claude/skills/task-observer/` (de `rebelytics/one-skill-to-rule-them-all`, commit `d61bc31`) e é ativada pelo `CLAUDE.md`. As observações ficam em `skill-observations/`, e as propostas de mudança em `skill-updates/`. Nenhuma skill muda sem a sua aprovação na revisão.

Atenção: o repositório é público e as observações vão para o git. O `CLAUDE.md` proíbe gravar dados de clientes ou segredos nelas.
