"""Gera o site independente (GitHub Pages + Supabase) a partir do código do sistema.

Uso: python3 build_site.py <arquivo_do_app.html> <shim.html> <pasta_saida>
O app (bipa-estoque.html) é a fonte única da lógica; o shim troca o banco do Claude pelo Supabase
e acrescenta login, equipe, downloads e instalação no Chrome.
"""
import sys, os, pathlib, re, hashlib, base64
from urllib.parse import urlparse

app_path, shim_path, out_dir = sys.argv[1:4]
app = pathlib.Path(app_path).read_text(encoding='utf-8')
shim = pathlib.Path(shim_path).read_text(encoding='utf-8')
out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
# endereço público do site: vai nas etiquetas da prévia do link (WhatsApp) e na página 404.
# Troca de endereço (pedido do dono, 19/11/2026): bernardobrito-creator.github.io/PneusBR → pneusbr.github.io
SITE_URL = os.environ.get('PBR_SITE_URL', 'https://pneusbr.github.io/')
if not SITE_URL.endswith('/'): SITE_URL += '/'
BASE = urlparse(SITE_URL).path or '/'
for f in ['fonts/instrument-sans-latin.woff2', 'fonts/instrument-sans-latin-ext.woff2', 'fonts/jetbrains-mono-latin.woff2', 'fonts/jetbrains-mono-latin-ext.woff2', 'og.png', 'favicon.ico', 'apple-touch-icon.png', 'icon-maskable-512.png']:
    if not (out / f).exists(): raise SystemExit(f'Falta {f} na pasta do site (veja src/imagens e docs/fonts).')

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
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
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
# fontes no próprio site (antes vinham do Google Fonts): só baixa o latin-ext se a página usar uma letra dele
LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"
def fontes(base):
    css = []
    for fam, arq, pesos in (('Instrument Sans', 'instrument-sans', '400 700'), ('JetBrains Mono', 'jetbrains-mono', '100 800')):
        for sub, rng in (('latin-ext', LATIN_EXT), ('latin', LATIN)):
            css.append(f'@font-face{{font-family:"{fam}";font-style:normal;font-weight:{pesos};font-display:swap;src:url({base}fonts/{arq}-{sub}.woff2) format("woff2");unicode-range:{rng}}}')
    return '<style>' + ''.join(css) + '</style>'

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
<meta name="description" content="Sistema interno da PneusBR: estoque, caixa e notas. Acesso só para a equipe.">
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PneusBR">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="PneusBR · sistema interno">
<meta property="og:description" content="Estoque, caixa e notas da loja. Acesso só para a equipe.">
<meta property="og:url" content="{SITE_URL}">
<meta property="og:image" content="{SITE_URL}og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="PneusBR, sistema interno da loja">
<meta name="twitter:card" content="summary_large_image">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.ico" sizes="32x32">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="preload" href="fonts/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
{fontes('')}
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

# 4) página 404 do GitHub Pages: mesmo visual da tela de entrada, sem script, fora das buscas
PNEU = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle class="pn" cx="16" cy="16" r="12.4" stroke-width="4.4"/><circle class="sulco" cx="16" cy="16" r="14.1" stroke-width="1.3" stroke-dasharray="1.6 2.1"/><circle class="aro" cx="16" cy="16" r="8.2" stroke-width="1.3"/><path class="aro" d="M16 13.4V7.8M18.47 15.2l5.33-1.73M17.53 18.1l3.29 4.53M14.47 18.1l-3.29 4.53M13.53 15.2l-5.33-1.73" stroke-width="1.6" stroke-linecap="round"/><circle class="cubo" cx="16" cy="16" r="2.5"/></svg>'
p404 = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#141112">
<title>Página não encontrada · PneusBR</title>
<link rel="icon" href="{BASE}favicon.ico" sizes="32x32">
<link rel="icon" href="{BASE}icon.svg" type="image/svg+xml">
{fontes(BASE)}
<style>
:root{{--bar:#141112;--surface:#fff;--ink:#161314;--ink-2:#463F3F;--muted:#77706F;--red:#B4393E;--red-ink:#9A2D32;color-scheme:light}}
@media (prefers-color-scheme: dark){{:root{{--bar:#060505;--surface:#171415;--ink:#F2EFEF;--ink-2:#CEC7C7;--muted:#958D8D;--red:#DE575D;--red-ink:#F18D91;color-scheme:dark}}}}
*{{box-sizing:border-box}}
html,body{{margin:0;min-height:100%}}
body{{min-height:100vh;background:var(--bar);font-family:"Instrument Sans","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;display:grid;place-items:center;padding:24px 16px}}
main{{width:min(420px,100%);background:var(--surface);color:var(--ink);border-radius:16px;padding:28px 26px;display:grid;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.4)}}
.marca{{display:flex;align-items:center;gap:12px}}
.marca svg{{width:34px;height:34px;display:block;color:var(--ink)}}
.pn,.aro,.sulco{{fill:none;stroke:currentColor}}
.sulco{{stroke:var(--surface)}}
.cubo{{fill:var(--red)}}
.marca b{{font-size:24px;font-weight:700;letter-spacing:-.03em}}
.marca b span{{color:var(--red)}}
.cod{{font-family:"JetBrains Mono",ui-monospace,Consolas,monospace;font-size:13px;color:var(--muted);letter-spacing:.08em}}
h1{{margin:0;font-size:20px;letter-spacing:-.01em}}
p{{margin:0;font-size:15px;line-height:1.5;color:var(--ink-2)}}
a.btn{{display:inline-flex;justify-content:center;align-items:center;padding:11px 14px;border-radius:10px;background:#B4393E;color:#fff;font-weight:600;text-decoration:none;font-size:15px}}
a.btn:hover{{filter:brightness(1.06)}}
a.btn:focus-visible{{outline:3px solid var(--red-ink);outline-offset:2px}}
</style>
</head>
<body>
<main>
<div class="marca">{PNEU}<b>Pneus<span>BR</span></b></div>
<div class="cod">ERRO 404</div>
<h1>Página não encontrada</h1>
<p>Este endereço não existe no sistema. Confira o link ou volte para a tela de entrada.</p>
<a class="btn" href="{BASE}">Ir para o sistema</a>
</main>
</body>
</html>
"""
(out / '404.html').write_text(p404, encoding='utf-8')
print('404.html', len(p404), 'bytes · endereço', SITE_URL)
