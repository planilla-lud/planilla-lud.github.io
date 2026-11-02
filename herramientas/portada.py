# Genera los íconos, las pantallas de arranque de la app (para "Agregar a inicio") y og.png (la imagen
# que aparece al compartir el link). Mismo diseño que la página: negro, aro blanco con un hueco
# (el que falta) y Barlow.
# Uso: python herramientas/portada.py
# Usa el Chrome (o Edge) instalado, sin ventana. Si no lo encuentra: NAVEGADOR=ruta/al/chrome.
# Las letras se bajan de Google Fonts, así que necesita internet. Después conviene comprimir los PNG.
import os, shutil, subprocess, tempfile, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
APP = RAIZ / 'app'
FONDO, TEXTO, APAGADO, ACENTO = '#000000', '#f3f3f4', '#9b9ea5', '#ffffff'
LETRAS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@500;600&family=Barlow+Semi+Condensed:wght@700&display=block">'
CSS = """*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}
body{font-family:Barlow,sans-serif;-webkit-font-smoothing:antialiased}"""

def navegador():
    for x in [os.environ.get('NAVEGADOR'), shutil.which('chrome'), shutil.which('google-chrome'), shutil.which('chromium'),
              r'C:\Program Files\Google\Chrome\Application\chrome.exe', r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']:
        if x and os.path.exists(x): return x
    raise SystemExit('No encontré Chrome ni Edge. Poné la ruta en NAVEGADOR.')

def marca(px, escala=1.0):
    # El aro del logo de la página (viewBox 64: radio 15, trazo 6,5, hueco arriba a la derecha).
    k = px / 64 * escala * 1.25
    r, sw = 15 * k, 6.5 * k
    largo = 2 * 3.14159 * r
    return f"""<svg width="{px}" height="{px}" viewBox="0 0 {px} {px}" xmlns="http://www.w3.org/2000/svg">
  <rect width="{px}" height="{px}" fill="#0a0a0a"/>
  <circle cx="{px/2}" cy="{px/2}" r="{r}" fill="none" stroke="{ACENTO}" stroke-width="{sw}" stroke-dasharray="{largo*0.807} {largo*0.193}" stroke-dashoffset="{-largo*0.064}" transform="rotate(-90 {px/2} {px/2})"/>
</svg>"""

def splash(w, h):
    t = min(w, h)
    return f"""<div style="width:{w}px;height:{h}px;background:{FONDO};position:relative;color:{TEXTO}">
  <div style="position:absolute;left:0;right:0;top:{h*0.5 - t*0.28}px;display:flex;flex-direction:column;align-items:center;gap:{t*0.05}px">
    <div style="width:{t*0.26}px;height:{t*0.26}px;border-radius:{t*0.06}px;overflow:hidden;box-shadow:0 0 0 1px rgba(236,239,242,.12)">{marca(int(t*0.26))}</div>
    <div style="font-family:'Barlow Semi Condensed';font-weight:700;font-size:{t*0.12}px;line-height:1">Planilla <span style="opacity:.6">LUD</span></div>
    <div style="font-size:{t*0.042}px;color:{APAGADO};font-weight:500">Bajas · Previas · Once probable</div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:{h*0.06}px;text-align:center;font-size:{t*0.034}px;color:#6e7781;font-weight:500">Liga Universitaria de Deportes</div>
</div>"""

ESCUDOS = ['elf', 'old-christians', 'nacional-u', 'carrasco-polo', 'seminario', 'old-boys']
def og():
    esc = ''.join(f'<img src="{(RAIZ / "escudos" / f"{e}.png").as_uri()}" style="width:72px;height:72px;object-fit:contain;background:#dfe3e7;border-radius:16px;padding:9px">'
                  for e in ESCUDOS if (RAIZ / 'escudos' / f'{e}.png').exists())
    cats = ' · '.join(['Mayores', 'Sub 20', 'Reserva', 'Pre Senior', 'Más 40', 'Sub 18', 'Sub 16'])
    return f'''<div style="width:1200px;height:630px;position:relative;overflow:hidden;color:{TEXTO};background:{FONDO}">
  <div style="position:absolute;left:84px;top:80px;display:flex;align-items:center;gap:22px">
    <div style="width:84px;height:84px;border-radius:20px;overflow:hidden;box-shadow:0 0 0 1px rgba(236,239,242,.12)">{marca(84)}</div>
    <div style="font-family:'Barlow Semi Condensed';font-weight:700;font-size:64px;line-height:1">Planilla <span style="opacity:.6">LUD</span></div>
  </div>
  <div style="position:absolute;left:84px;top:230px;width:980px;font-family:'Barlow Semi Condensed';font-weight:700;font-size:70px;line-height:1.02">Bajas, previas y once probable de cada partido</div>
  <div style="position:absolute;left:84px;top:404px;font-size:26px;font-weight:500;color:{APAGADO}">Liga Universitaria de Deportes · {cats}</div>
  <div style="position:absolute;left:84px;bottom:72px;display:flex;gap:12px">{esc}</div>
</div>'''

def foto(nav, html, w, h, escala, salida, carpeta):
    archivo = pathlib.Path(carpeta) / 'pagina.html'
    archivo.write_text(f'<!doctype html><html><head><meta charset="utf-8">{LETRAS}<style>{CSS}</style></head><body>{html}</body></html>', encoding='utf-8')
    subprocess.run([nav, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
                    f'--force-device-scale-factor={escala}', f'--window-size={w},{h}', '--virtual-time-budget=5000',
                    f'--user-data-dir={pathlib.Path(carpeta) / "perfil"}', f'--screenshot={salida}', archivo.as_uri()], check=True, capture_output=True)
    print('listo', pathlib.Path(salida).relative_to(RAIZ))

# Pantallas de iPhone (puntos CSS, escala)
IPHONES = [(440, 956, 3), (402, 874, 3), (430, 932, 3), (393, 852, 3), (428, 926, 3), (390, 844, 3), (375, 812, 3), (414, 896, 3), (414, 896, 2), (414, 736, 3), (375, 667, 2), (320, 568, 2)]
if __name__ == '__main__':
    nav = navegador()
    with tempfile.TemporaryDirectory() as tmp:
        foto(nav, og(), 1200, 630, 1, RAIZ / 'og.png', tmp)
        for px in (192, 512): foto(nav, marca(px), px, px, 1, APP / f'icono-{px}.png', tmp)
        foto(nav, marca(512, escala=0.72), 512, 512, 1, APP / 'icono-maskable-512.png', tmp)
        foto(nav, marca(180), 180, 180, 1, RAIZ / 'apple-touch-icon.png', tmp)
        for w, h, s in IPHONES: foto(nav, splash(w, h), w, h, s, APP / f'arranque-{w*s}x{h*s}.png', tmp)
