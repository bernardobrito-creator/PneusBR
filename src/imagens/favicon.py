# Junta os PNG de 16, 32 e 48 px (gerados por gerar-imagens.js) no favicon.ico e apaga os PNG soltos.
# Uso: python3 src/imagens/favicon.py docs
import sys, pathlib
from PIL import Image
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'docs')
imgs = [Image.open(out / f'favicon-{n}.png').convert('RGBA') for n in (16, 32, 48)]
imgs[2].save(out / 'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)], append_images=imgs[:2])
for n in (16, 32, 48): (out / f'favicon-{n}.png').unlink()
# a prévia do link fica menor sem perder qualidade (WhatsApp recusa imagem muito grande)
og = out / 'og.png'
if og.exists():
    Image.open(og).convert('RGB').save(og, optimize=True)
print('favicon.ico pronto;', 'og.png', og.stat().st_size if og.exists() else '-', 'bytes')
