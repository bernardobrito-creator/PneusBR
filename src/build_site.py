"""Gera o site independente (GitHub Pages + Supabase) a partir do código do sistema.

Uso: python3 build_site.py <arquivo_do_app.html> <shim.html> <pasta_saida>
O app (bipa-estoque.html) é a fonte única da lógica; o shim troca o banco do Claude pelo Supabase
e acrescenta login, equipe, downloads e instalação no Chrome.
"""
import sys, pathlib

app_path, shim_path, out_dir = sys.argv[1:4]
app = pathlib.Path(app_path).read_text(encoding='utf-8')
shim = pathlib.Path(shim_path).read_text(encoding='utf-8')
out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)

def troca(texto, velho, novo, nome):
    if texto.count(velho) != 1:
        raise SystemExit(f'Trecho "{nome}" encontrado {texto.count(velho)} vezes (esperado 1).')
    return texto.replace(velho, novo)

# 1) textos que falavam do Claude
app = troca(app,
  """<section><h3>Quem pode usar</h3><p style="margin:0;font-size:13.5px;color:var(--ink-2)">Para alguém registrar movimentos, convide a pessoa pelo e-mail como <b>Editor</b> no botão Share do Claude (ela precisa de uma conta gratuita no Claude). Quem só recebe o link consegue ver, mas não registrar.</p>
      <p style="margin:0;font-size:13.5px">Seu acesso agora: <b>${S.temporario ? 'sem salvar' : S.podeEscrever ? 'pode registrar' : 'só leitura'}</b></p></section>""",
  """<section><h3>Sua conta</h3><div id="a-conta" style="display:grid;gap:10px"></div></section>
    <section><h3>Pessoas com acesso</h3><p style="margin:0;font-size:13.5px;color:var(--ink-2)">Cada pessoa entra com o próprio e-mail e senha. Só o dono vê e muda esta lista.</p><div id="a-equipe"></div></section>""",
  'ajustes-acesso')
app = troca(app,
  """<button class="btn primary" type="button" data-acao="salvar-ajustes">Salvar</button></div>`, { tipo: 'ajustes' });""",
  """<button class="btn primary" type="button" data-acao="salvar-ajustes">Salvar</button></div>`, { tipo: 'ajustes' });
  if (window.PBR) window.PBR.renderConta();""",
  'ajustes-conta')
app = troca(app, 'Automático segue o tema do Claude e do seu aparelho.', 'Automático segue o tema do seu aparelho.', 'tema-auto')
app = troca(app, 'Peça ao dono para te convidar como Editor.', 'Peça ao dono para liberar seu acesso.', 'banner-leitura')

# 2) separa cabeça e corpo
fim_tema = "</script>"  # o primeiro </script> do arquivo é o do tema, logo depois do </style>
i = app.index('</style>')
j = app.index(fim_tema, i) + len(fim_tema)
cabeca, corpo = app[:j], app[j:]
marca_app = "<script>\n(() => {\n'use strict';\n\n/* ================= constantes"
corpo = troca(corpo, marca_app, shim + "\n" + marca_app, 'inicio-app')

html = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#141112">
<meta name="description" content="Sistema de estoque, caixa e gestão da PneusBR">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-192.png">
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{cabeca}
</head>
<body>
{corpo}
</body>
</html>
"""
(out / 'index.html').write_text(html, encoding='utf-8')
print('index.html', len(html), 'bytes')
