# Gemeinsamer Kern für Tutorial Videos: echte Bildschirmaufnahme der Seite, KI Stimme, Untertitel (vtt), mp4, webm, Poster.
# Benötigt sherpa_onnx, Playwright, ffmpeg und die Piper Stimmen (de kerstin-low, en amy-medium, ar kareem-medium) in /tmp/okt/tts.
# Nutzung: from video_core import run; run(name, lang, texts, scene, serve_dir, out_dir, ...)
import os, time, wave, threading, http.server, socketserver, functools, subprocess
import numpy as np, sherpa_onnx
from playwright.sync_api import sync_playwright

TTS = "/tmp/okt/tts/"
VOICES = {"de": ("vits-piper-de_DE-kerstin-low/", "de_DE-kerstin-low.onnx", 1.08),
          "en": ("vits-piper-en_US-amy-medium/", "en_US-amy-medium.onnx", 1.0),
          "ar": ("vits-piper-ar_JO-kareem-medium/", "ar_JO-kareem-medium.onnx", 1.05)}
PITCH = 1.04  # leicht höher; length_scale gleicht das Tempo aus
LOCALE = {"de": "de-DE", "en": "en-US", "ar": "ar-JO"}

INJECT = """
(()=>{const c=document.createElement('div');c.id='fakecur';c.style.cssText='position:fixed;z-index:99999;width:22px;height:22px;border-radius:50%;background:#1c1b19;border:3px solid #fff;box-shadow:0 0 0 1px #1c1b19;pointer-events:none;left:-40px;top:-40px;transform:translate(-50%,-50%)';
const k=document.createElement('div');k.id='cap';k.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99998;background:#fff;color:#1c1b19;border-top:2px solid #1c1b19;padding:14px 40px;font:600 22px/1.35 system-ui,sans-serif;min-height:30px;text-align:center';
const add=()=>{if(!document.body)return;document.documentElement.append(k,c)};
document.addEventListener('DOMContentLoaded',add);if(document.body)add();
addEventListener('mousemove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px'},true);
const sy=document.createElement('div');sy.id='sy';sy.style.cssText='position:fixed;left:0;bottom:0;width:28px;height:7px;z-index:99999;background:#fff';
const add2=()=>{if(document.body)document.documentElement.append(sy)};document.addEventListener('DOMContentLoaded',add2);if(document.body)add2();
window.__sync=i=>{const v=255-(i+1)*6;sy.style.background='rgb('+v+','+v+','+v+')'};
window.__cap=t=>{k.textContent=t};})();
"""


def video_starts(rec, n, W):
    # Liest die Szenenmarken (kleiner Grauwert unten links) aus der Aufnahme: so liegen Stimme und Untertitel exakt auf dem Bild.
    import numpy as np
    from PIL import Image
    d = os.path.join(W, "sync"); os.makedirs(d, exist_ok=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", rec, "-vf", "fps=10,crop=10:3:6:715,format=gray", f"{d}/s%05d.png"], check=False)
    fs = sorted(os.listdir(d)); first = {}; last = None; run_ = 0
    for k, f in enumerate(fs):
        v = float(np.asarray(Image.open(os.path.join(d, f)), dtype=float).mean()); idx = round((255 - v) / 6) - 1
        if 0 <= idx < n:
            run_ = run_ + 1 if idx == last else 1; last = idx
            if run_ >= 3 and idx not in first: first[idx] = (k - 2) / 10
        else: last = None; run_ = 0
    if len(first) < n: return None
    return [first[i] for i in range(n)]


class H:  # Hilfen für die Szenen
    def __init__(self, pg, now):
        self.pg, self.now = pg, now

    def cap(self, t): self.pg.evaluate("t=>window.__cap&&window.__cap(t)", t)
    def wait(self, ms): self.pg.wait_for_timeout(ms)
    def smooth(self, y): self.pg.evaluate("y=>window.scrollTo({top:y,behavior:'smooth'})", y)
    def top_of(self, sel, off=110): return self.pg.evaluate("([s,o])=>document.querySelector(s).getBoundingClientRect().top+scrollY-o", [sel, off])
    def scroll_to(self, sel, off=110): self.smooth(self.top_of(sel, off))

    def go(self, sel, click=True, nth=0):
        el = self.pg.locator(sel).nth(nth); el.scroll_into_view_if_needed(); bb = el.bounding_box()
        x, y = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        self.pg.mouse.move(x, y, steps=25); self.pg.wait_for_timeout(350)
        if click: self.pg.mouse.click(x, y)


def music_bed(n, SR, bpm=118):
    """Synthetische Hintergrundmusik: Kick, Hi-Hat, Bass, Arpeggio. Offline, ohne Lizenzfragen."""
    t = np.arange(n) / SR; out = np.zeros(n, dtype=np.float32); beat = 60.0 / bpm
    notes = [57, 57, 60, 55]  # Am, Am, C, G (MIDI Grundton pro Takt)
    for k in range(int(n / SR / beat) + 2):
        st = int(k * beat * SR)
        if st >= n: break
        def put(sig, g):
            e = min(n, st + len(sig)); out[st:e] += g * sig[:e - st]
        tk = np.arange(int(0.18 * SR)) / SR
        put(np.sin(2 * np.pi * (110 * np.exp(-tk * 18) + 45) * tk) * np.exp(-tk * 14), 0.9)  # Kick auf jedem Schlag
        th = np.arange(int(0.05 * SR)) / SR
        if k % 2 == 1: put(np.random.randn(len(th)).astype(np.float32) * np.exp(-th * 90), 0.18)  # Hi-Hat auf Off-Beat
        bar = (k // 4) % 4; root = notes[bar]
        fb = 440 * 2 ** ((root - 69 - 12) / 12); tb = np.arange(int(beat * 0.9 * SR)) / SR
        put(np.sign(np.sin(2 * np.pi * fb * tb)) * 0.5 * np.exp(-tb * 3) * (1 if k % 2 == 0 else 0.6), 0.35)
        for q in range(2):  # Arpeggio in Achteln
            fa = 440 * 2 ** ((root + [12, 15, 19, 24][(k * 2 + q) % 4] - 69) / 12); ta = np.arange(int(beat * 0.5 * SR)) / SR
            sidx = st + int(q * beat * 0.5 * SR)
            if sidx < n:
                e = min(n, sidx + len(ta)); out[sidx:e] += (0.22 * np.sin(2 * np.pi * fa * ta) * np.exp(-ta * 7))[:e - sidx].astype(np.float32)
    fade = np.minimum(1, np.minimum(t / 1.0, (n / SR - t) / 1.5)).astype(np.float32)
    return out * fade

def run(name, lang, texts, scene, serve_dir, out_dir, start_hash="#/", ready_sel="body", init_js="", viewport=(1500, 844), poster_scene=1, scroll_container=None):
    L = lang; TEXT = texts[L]
    W = f"/tmp/vid-{name}-{L}"; import shutil; shutil.rmtree(W, ignore_errors=True); os.makedirs(W, exist_ok=True); os.makedirs(out_dir, exist_ok=True)
    d, f, ls = VOICES[L]; M = TTS + d
    AD = os.environ.get('VOICE_STYLE') == 'ad'  # lebendiger: mehr Betonung, etwas schneller
    ns, nw, ls = (0.9, 1.0, ls * 0.9) if AD else (0.667, 0.7, ls)
    tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=M + f, tokens=M + "tokens.txt", data_dir=M + "espeak-ng-data", noise_scale=ns, noise_scale_w=nw, length_scale=ls * PITCH),
        num_threads=4, provider="cpu")))
    aud = []
    for t in TEXT:
        a = tts.generate(t, sid=0, speed=1.0); x = np.array(a.samples, dtype=np.float32)
        x = np.interp(np.arange(0, len(x) - 1, PITCH), np.arange(len(x)), x).astype(np.float32); aud.append((x, a.sample_rate))
    SR = aud[0][1]; DUR = [len(x) / SR for x, _ in aud]

    if serve_dir.startswith("http"):
        URL = serve_dir.rstrip("/") + "/"
    else:
        Hd = functools.partial(http.server.SimpleHTTPRequestHandler, directory=serve_dir); Hd.log_message = lambda *a, **k: None
        srv = socketserver.TCPServer(("127.0.0.1", 0), Hd); port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        URL = f"http://127.0.0.1:{port}/"
    starts = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(locale=LOCALE[L], viewport={"width": viewport[0], "height": viewport[1]}, record_video_dir=W, record_video_size={"width": 1280, "height": 720})
        ctx.add_init_script(INJECT)
        if os.environ.get('FX'): ctx.add_init_script(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fx.js')).read())
        if init_js: ctx.add_init_script(init_js.replace("__L__", L))
        pg = ctx.new_page(); t0 = time.perf_counter(); now = lambda: time.perf_counter() - t0
        h = H(pg, now)
        pg.goto(URL + start_hash); pg.wait_for_selector(ready_sel); pg.wait_for_timeout(600)
        for i in range(len(TEXT)):
            s0 = now(); starts.append(s0 + 0.15); h.cap(TEXT[i]); pg.evaluate('i=>window.__sync&&window.__sync(i)', i)
            scene(i, h)
            rest = s0 + DUR[i] + 0.7 - now()
            if rest > 0: pg.wait_for_timeout(int(rest * 1000))
        total = now() + 1.0; pg.wait_for_timeout(1000)
        poster_t = starts[min(poster_scene, len(starts) - 1)] + 1.5
        ctx.close(); b.close()
    rec = os.path.join(W, [x for x in os.listdir(W) if x.endswith(".webm") and x != "out.webm"][0])
    vstarts = video_starts(rec, len(TEXT), W)
    if vstarts: poster_t = vstarts[min(poster_scene, len(vstarts) - 1)] + 1.5; starts = vstarts; total = max(total, vstarts[-1] + DUR[-1] + 1.5)
    try: total = max(total, float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", rec], capture_output=True, text=True).stdout.strip() or 0))
    except Exception: pass
    cut = max(0.0, starts[0] - 1.0) if vstarts else 0.0  # leere Ladezeit am Anfang abschneiden
    starts = [x - cut for x in starts]; poster_t -= cut; total -= cut
    buf = np.zeros(int((total + 1) * SR), dtype=np.float32)
    for (x, _), s in zip(aud, starts): j = int(s * SR); buf[j:j + len(x)] += x
    if os.environ.get('MUSIC'):
        m = music_bed(len(buf), SR); env = np.convolve(np.abs(buf), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode='same')
        duck = np.clip(1.0 - env * 9, 0.25, 1.0)  # unter der Stimme leiser
        buf = buf + m * 0.3 * duck
        for si, st0 in enumerate(starts):  # Wisch Effekt an jedem Szenenwechsel
            if si == 0: continue
            j = int(max(0, st0 - 0.05) * SR); nn = int(0.45 * SR); tt = np.arange(nn) / SR
            nz = np.random.randn(nn).astype(np.float32); k = np.maximum(3, (np.linspace(60, 6, nn)).astype(int))
            sw = np.cumsum(nz) ; sw = sw - np.concatenate([np.zeros(40), sw[:-40]]) if nn > 40 else sw
            env_ = np.sin(np.pi * tt / 0.45) ** 2; sw = (sw / (np.abs(sw).max() + 1e-6) * env_ * 0.35).astype(np.float32)
            e_ = min(len(buf), j + nn); buf[j:e_] += sw[:e_ - j]
        buf = buf; buf = buf / max(1.0, float(np.abs(buf).max()) / 0.95)
    wav = os.path.join(W, "full.wav")
    with wave.open(wav, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(buf, -1, 1) * 32767).astype("<i2").tobytes())
    sx = "" if L == "en" else "-" + L
    fm = lambda s: f"{int(s // 60):02d}:{s - int(s // 60) * 60:06.3f}"
    vtt = ["WEBVTT", ""]
    for i, (t, s) in enumerate(zip(TEXT, starts)): vtt += [str(i + 1), f"{fm(s)} --> {fm(s + DUR[i])}", t, ""]
    open(f"{out_dir}/{name}{sx}.vtt", "w").write("\n".join(vtt))
    run_ = lambda *a: subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run_("ffmpeg", "-y", "-ss", f"{cut:.2f}", "-i", rec, "-i", wav, "-t", f"{total:.2f}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-preset", "medium", "-r", "25", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", f"{out_dir}/{name}{sx}.mp4")
    run_("ffmpeg", "-y", "-ss", f"{cut:.2f}", "-i", rec, "-i", wav, "-t", f"{total:.2f}", "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-r", "25", "-c:a", "libopus", "-b:a", "64k", f"{out_dir}/{name}{sx}.webm")
    run_("ffmpeg", "-y", "-ss", f"{poster_t + cut:.2f}", "-i", rec, "-frames:v", "1", f"{out_dir}/{name}-poster{sx}.png")
    print("fertig", name, L, round(total, 1), "s")
