"""Genera los íconos de Flix (2B, neón violeta) con Chromium headless.

Pisa favicon.svg, los PNG de la PWA y los mipmaps, banner y splash de tv-app.
Necesita Pillow y `npm install` (usa la fuente Sora de node_modules).

Uso: python3 scripts/flix-icons.py <repo>
     CHROME=/ruta/a/chrome python3 scripts/flix-icons.py .   (otro Chromium)
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image

REPO = sys.argv[1]
CHROME = os.environ.get('CHROME', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
SORA = os.path.join(REPO, 'node_modules/@fontsource/sora/files/sora-latin-700-normal.woff2')
RES = os.path.join(REPO, 'tv-app/android/app/src/main/res')
WORK = tempfile.mkdtemp(prefix='flix-')

DEFS = '''<defs>
<radialGradient id="bg" cx=".5" cy=".42" r=".7"><stop offset="0" stop-color="#2a1d4f"/><stop offset="1" stop-color="#0b0819"/></radialGradient>
<radialGradient id="pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#c4b0ff" stop-opacity=".55"/><stop offset="1" stop-color="#c4b0ff" stop-opacity="0"/></radialGradient>
<filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b1"/><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b2"/><feMerge><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<path id="f" d="M180 140H340V186H230V234H316V278H230V372H180Z" fill="none" stroke-linejoin="round"/>
</defs>'''

ART = '''<ellipse cx="256" cy="420" rx="120" ry="14" fill="url(#pool)"/>
<g filter="url(#glow)" stroke="#c4b0ff"><use href="#f" stroke-width="7"/><use href="#f" stroke-width="3" transform="translate(256 256) scale(.86) translate(-256 -256)" stroke-opacity=".7"/></g>
<g fill="#efe9ff"><circle cx="180" cy="140" r="7"/><circle cx="340" cy="186" r="6"/><circle cx="316" cy="234" r="6"/><circle cx="230" cy="372" r="6"/><circle cx="262" cy="205" r="2.5"/><circle cx="208" cy="318" r="2"/><circle cx="290" cy="120" r="2"/><circle cx="372" cy="300" r="2.5"/></g>'''


def icon_svg(shape='rounded', view='0 0 512 512', background=True):
    """shape: rounded (rx 112), square (a sangre) o circle."""
    if not background:
        bg = ''
    elif shape == 'rounded':
        bg = '<rect width="512" height="512" rx="112" fill="url(#bg)"/>'
    elif shape == 'circle':
        bg = '<circle cx="256" cy="256" r="256" fill="url(#bg)"/>'
    else:
        bg = '<rect width="512" height="512" fill="url(#bg)"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">{DEFS}{bg}{ART}</svg>'


def render(body, w, h, out, background='transparent'):
    html = os.path.join(WORK, 'p.html')
    with open(html, 'w') as f:
        f.write(
            '<!doctype html><meta charset="utf-8"><style>'
            f'@font-face{{font-family:Sora;src:url("file://{SORA}");font-weight:700}}'
            'html{background:transparent}'
            f'body{{margin:0;position:relative;width:{w}px;height:{h}px;overflow:hidden;background:{background}}}'
            'body>svg{display:block;width:100%;height:100%}</style>' + body
        )
    png = os.path.join(WORK, 'shot.png')
    subprocess.run(
        [CHROME, '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
         '--default-background-color=00000000', '--virtual-time-budget=2000', f'--window-size={max(w, 800) + 200},{max(h, 800) + 200}',
         f'--screenshot={png}', f'file://{html}'],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    # Chromium headless recorta la ventana (le resta la barra): se saca grande y se recorta.
    img = Image.open(png).convert('RGBA').crop((0, 0, w, h))
    if background != 'transparent':
        img = img.convert('RGB')
    img.save(out, optimize=True)
    print(out, img.size)


def main():
    # Web: favicon SVG (redondeado) y PNG de la PWA (a sangre: el sistema les pone la forma).
    with open(os.path.join(REPO, 'public/favicon.svg'), 'w') as f:
        f.write(icon_svg('rounded') + '\n')
    for size in (192, 512):
        render(icon_svg('square'), size, size, os.path.join(REPO, f'public/icon-{size}.png'))

    # Android: íconos clásicos, redondos y el frente del adaptativo (108 dp, zona visible de 72 dp).
    dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    for d, k in dens.items():
        base = os.path.join(RES, f'mipmap-{d}')
        render(icon_svg('rounded'), int(48 * k), int(48 * k), os.path.join(base, 'ic_launcher.png'))
        render(icon_svg('circle'), int(48 * k), int(48 * k), os.path.join(base, 'ic_launcher_round.png'))
        render(icon_svg(view='-128 -128 768 768', background=False), int(108 * k), int(108 * k),
               os.path.join(base, 'ic_launcher_foreground.png'))

    # Banner de la fila de apps (320 × 180).
    banner = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">'
        '<defs><radialGradient id="bb" cx=".3" cy=".45" r=".9"><stop offset="0" stop-color="#2a1d4f"/>'
        '<stop offset="1" stop-color="#0b0819"/></radialGradient></defs>'
        '<rect width="320" height="180" fill="url(#bb)"/>'
        f'<svg x="44" y="28" width="96" height="124" viewBox="140 100 240 340">{DEFS}{ART}</svg>'
        '<text x="150" y="108" font-family="Sora, sans-serif" font-weight="700" font-size="52" fill="#efe9ff">Flix</text>'
        '</svg>'
    )
    render(banner, 320, 180, os.path.join(RES, 'drawable-xhdpi/banner.png'), background='#0b0819')

    # Splash (Android 11 o menos): el ícono al centro sobre el fondo de la app.
    splash = {'drawable': (480, 320)}
    for d in dens:
        if d == 'mdpi':
            splash['drawable-land-mdpi'], splash['drawable-port-mdpi'] = (480, 320), (320, 480)
    sizes = {'hdpi': (800, 480), 'xhdpi': (1280, 720), 'xxhdpi': (1600, 960), 'xxxhdpi': (1920, 1280)}
    for d, (w, h) in sizes.items():
        splash[f'drawable-land-{d}'] = (w, h)
        splash[f'drawable-port-{d}'] = (h, w)
    for folder, (w, h) in splash.items():
        s = round(min(w, h) * 0.32)
        body = (
            f'<div style="position:absolute;left:{(w - s) // 2}px;top:{(h - s) // 2}px;width:{s}px;height:{s}px">'
            f'{icon_svg("rounded")}</div><style>div>svg{{width:100%;height:100%;display:block}}</style>'
        )
        render(body, w, h, os.path.join(RES, folder, 'splash.png'), background='#0b0b10')


main()
