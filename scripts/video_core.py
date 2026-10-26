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
const add=()=>{if(!document.body)return;document.body.append(k,c)};
document.addEventListener('DOMContentLoaded',add);if(document.body)add();
addEventListener('mousemove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px'},true);
window.__cap=t=>{k.textContent=t};})();
"""


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


def run(name, lang, texts, scene, serve_dir, out_dir, start_hash="#/", ready_sel="body", init_js="", viewport=(1500, 844), poster_scene=1, scroll_container=None):
    L = lang; TEXT = texts[L]
    W = f"/tmp/vid-{name}-{L}"; os.makedirs(W, exist_ok=True); os.makedirs(out_dir, exist_ok=True)
    d, f, ls = VOICES[L]; M = TTS + d
    tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=M + f, tokens=M + "tokens.txt", data_dir=M + "espeak-ng-data", noise_scale=0.667, noise_scale_w=0.7, length_scale=ls * PITCH),
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
        if init_js: ctx.add_init_script(init_js.replace("__L__", L))
        pg = ctx.new_page(); t0 = time.perf_counter(); now = lambda: time.perf_counter() - t0
        h = H(pg, now)
        pg.goto(URL + start_hash); pg.wait_for_selector(ready_sel); pg.wait_for_timeout(600)
        for i in range(len(TEXT)):
            s0 = now(); starts.append(s0 + 0.15); h.cap(TEXT[i])
            scene(i, h)
            rest = s0 + DUR[i] + 0.7 - now()
            if rest > 0: pg.wait_for_timeout(int(rest * 1000))
        total = now() + 1.0; pg.wait_for_timeout(1000)
        poster_t = starts[min(poster_scene, len(starts) - 1)] + 1.5
        ctx.close(); b.close()
    rec = os.path.join(W, [x for x in os.listdir(W) if x.endswith(".webm") and x != "out.webm"][0])
    buf = np.zeros(int((total + 1) * SR), dtype=np.float32)
    for (x, _), s in zip(aud, starts): j = int(s * SR); buf[j:j + len(x)] += x
    wav = os.path.join(W, "full.wav")
    with wave.open(wav, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(buf, -1, 1) * 32767).astype("<i2").tobytes())
    sx = "" if L == "en" else "-" + L
    fm = lambda s: f"{int(s // 60):02d}:{s - int(s // 60) * 60:06.3f}"
    vtt = ["WEBVTT", ""]
    for i, (t, s) in enumerate(zip(TEXT, starts)): vtt += [str(i + 1), f"{fm(s)} --> {fm(s + DUR[i])}", t, ""]
    open(f"{out_dir}/{name}{sx}.vtt", "w").write("\n".join(vtt))
    run_ = lambda *a: subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run_("ffmpeg", "-y", "-i", rec, "-i", wav, "-t", f"{total:.2f}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-preset", "medium", "-r", "25", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", f"{out_dir}/{name}{sx}.mp4")
    run_("ffmpeg", "-y", "-i", rec, "-i", wav, "-t", f"{total:.2f}", "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-r", "25", "-c:a", "libopus", "-b:a", "64k", f"{out_dir}/{name}{sx}.webm")
    run_("ffmpeg", "-y", "-ss", f"{poster_t:.2f}", "-i", rec, "-frames:v", "1", f"{out_dir}/{name}-poster{sx}.png")
    print("fertig", name, L, round(total, 1), "s")
