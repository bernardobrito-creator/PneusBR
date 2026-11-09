"""Gera o site independente (GitHub Pages + Supabase) a partir do código do sistema.

Uso: python3 build_site.py <arquivo_do_app.html> <shim.html> <pasta_saida>
O app (bipa-estoque.html) é a fonte única da lógica; o shim troca o banco do Claude pelo Supabase
e acrescenta login, equipe, downloads e instalação no Chrome.
"""
import sys, pathlib, re, hashlib, base64

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
    <section><h3>Senha das telas</h3><div id="a-trava" style="display:grid;gap:8px"></div></section>
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

# 3) cabeçalhos de segurança (o GitHub Pages não deixa configurar cabeçalhos HTTP, então vão em <meta>)
SUPABASE = 'mjojodmrckyzfhrbaswt.supabase.co'
CSP = '; '.join([
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval' __HASHES__",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    f"connect-src 'self' https://{SUPABASE} wss://{SUPABASE} https://brasilapi.com.br https://cdn.jsdelivr.net",
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
])
# esconde a página se alguém tentar abri-la dentro de outro site (moldura invisível para enganar cliques)
ANTI_MOLDURA = """<style id="sem-moldura">html{display:none!important}</style>
<script>if (window.top === window.self) document.getElementById('sem-moldura').remove();</script>"""

html = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="__CSP__">
<meta name="referrer" content="no-referrer">
{ANTI_MOLDURA}
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
# hashes de todos os scripts embutidos: só eles podem rodar (um script injetado por XSS seria bloqueado)
inline = re.findall(r'<script>(.*?)</script>', html, flags=re.S)
if not inline or re.search(r'<script(?![^>]*\bsrc=)[^>]+>', html):
    raise SystemExit('Script embutido com atributos inesperados: confira o CSP.')
if re.search(r'\son[a-z]+\s*=\s*["\']', re.sub(r'<script>.*?</script>', '', html, flags=re.S)):
    raise SystemExit('Há manipulador de evento embutido (onclick=...): o CSP vai bloquear.')
hashes = ' '.join("'sha256-" + base64.b64encode(hashlib.sha256(s.encode('utf-8')).digest()).decode() + "'" for s in inline)
html = html.replace('__CSP__', CSP.replace('__HASHES__', hashes), 1)
(out / 'index.html').write_text(html, encoding='utf-8')
print('scripts embutidos com hash:', len(inline))
print('index.html', len(html), 'bytes')
