/**
 * Animated TOPOLOGY background for the welcome hero, a self-contained canvas port of the
 * Vanta.js TOPOLOGY look (cyan contour lines on #eaeaea, reacting to the mouse), with the same
 * options as the original brief: mouseControls, touchControls, gyroControls off, minHeight/
 * minWidth 200, scale 1, scaleMobile 1, color 0x00dfff, backgroundColor 0xeaeaea.
 *
 * Written in-house so it needs no p5.js/Vanta scripts and no CDN: it works on Vercel, in the
 * claude.ai preview and in the offline single-file build, and visitors' browsers contact no
 * third party. Particles drift along a smooth noise flow field and leave faint trails that build
 * up the contour pattern; the pointer pushes the field away. Pauses when hidden or off-screen;
 * with "reduce motion" a static pattern is drawn once.
 */
import { useEffect, useState, type RefObject } from "react";

export type BackgroundStatus = "off" | "loading" | "on" | "failed";

export interface TopologyOptions {
  mouseControls: boolean;
  touchControls: boolean;
  gyroControls: boolean;
  minHeight: number;
  minWidth: number;
  scale: number;
  scaleMobile: number;
  color: number;
  backgroundColor: number;
}

/** Colours from the brief: cyan lines on light grey; a dark ground in dark mode. */
export function topologyColors(dark: boolean) {
  return dark ? { color: 0x00dfff, backgroundColor: 0x0b0f1a } : { color: 0x00dfff, backgroundColor: 0xeaeaea };
}

export function topologyOptions(dark: boolean): TopologyOptions {
  return { mouseControls: true, touchControls: true, gyroControls: false, minHeight: 200, minWidth: 200, scale: 1, scaleMobile: 1, ...topologyColors(dark) };
}

// --- smooth 3D value noise (deterministic, tiny) ------------------------------------------
const PERM = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = 1337;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return new Uint8Array([...p, ...p]);
})();
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hash = (x: number, y: number, z: number) => PERM[PERM[PERM[x & 255] + (y & 255)] + (z & 255)] / 255;
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255] as const;

/** Starts the animation in `el`; returns a destroy function. */
export function startTopology(el: HTMLElement, opts: TopologyOptions, reduceMotion: boolean): () => void {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  el.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    throw new Error("Canvas 2D not supported");
  }
  const [lr, lg, lb] = rgb(opts.color);
  const [br, bgc, bb] = rgb(opts.backgroundColor);
  const bgSolid = `rgb(${br},${bgc},${bb})`;
  // Tuned for a clearly visible, lively pattern: stronger lines, faster flow, trails fade a bit quicker.
  const dark = (br + bgc + bb) / 3 < 80;
  const bgFade = `rgba(${br},${bgc},${bb},0.06)`;
  const line = `rgba(${lr},${lg},${lb},${dark ? 0.42 : 0.38})`;

  let w = 0, h = 0, dpr = 1, raf = 0, running = false, visible = true, onScreen = true;
  let t = Math.random() * 100;
  type P = { x: number; y: number; life: number };
  let particles: P[] = [];
  const pointer = { x: -9999, y: -9999, active: false };

  const spawn = (): P => ({ x: Math.random() * w, y: Math.random() * h, life: 60 + Math.random() * 180 });

  const resize = () => {
    const r = el.getBoundingClientRect();
    w = Math.max(opts.minWidth, Math.round(r.width));
    h = Math.max(opts.minHeight, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = window.innerWidth < 768 ? opts.scaleMobile : opts.scale;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.fillStyle = bgSolid;
    ctx.fillRect(0, 0, w, h);
    const count = Math.min(1800, Math.round((w * h) / 1200));
    particles = Array.from({ length: count }, spawn);
  };

  const step = (fadeTrails: boolean) => {
    if (fadeTrails) {
      ctx.fillStyle = bgFade;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    const k = 0.0022;
    for (const p of particles) {
      // Flow direction from the noise field (two octaves for contour-like bends).
      const n = noise3(p.x * k, p.y * k, t) * 0.75 + noise3(p.x * k * 2.3, p.y * k * 2.3, t + 7) * 0.25;
      let a = n * Math.PI * 4;
      let speed = 2.6;
      if (pointer.active) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 200 * 200) {
          const away = Math.atan2(dy, dx);
          const f = 1 - Math.sqrt(d2) / 200;
          a = a * (1 - f) + away * f;
          speed += f * 3;
        }
      }
      const nx = p.x + Math.cos(a) * speed;
      const ny = p.y + Math.sin(a) * speed;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      p.x = nx;
      p.y = ny;
      if (--p.life <= 0 || nx < -10 || ny < -10 || nx > w + 10 || ny > h + 10) Object.assign(p, spawn());
    }
    ctx.stroke();
    t += 0.0045;
  };

  const loop = () => {
    raf = 0;
    if (!running) return;
    step(true);
    raf = requestAnimationFrame(loop);
  };
  const update = () => {
    const should = visible && onScreen && !reduceMotion;
    if (should && !running) {
      running = true;
      raf = requestAnimationFrame(loop);
    } else if (!should && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const onMove = (x: number, y: number) => {
    const r = el.getBoundingClientRect();
    pointer.x = x - r.left;
    pointer.y = y - r.top;
    pointer.active = true;
  };
  const mouse = (e: MouseEvent) => opts.mouseControls && onMove(e.clientX, e.clientY);
  const touch = (e: TouchEvent) => opts.touchControls && e.touches[0] && onMove(e.touches[0].clientX, e.touches[0].clientY);
  const leave = () => (pointer.active = false);
  const vis = () => {
    visible = document.visibilityState !== "hidden";
    update();
  };

  resize();
  if (reduceMotion) {
    for (let i = 0; i < 260; i++) step(false); // one calm, static contour pattern
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  ro?.observe(el);
  const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; update(); }) : null;
  io?.observe(el);
  window.addEventListener("mousemove", mouse, { passive: true });
  window.addEventListener("touchmove", touch, { passive: true });
  document.addEventListener("mouseleave", leave);
  document.addEventListener("visibilitychange", vis);
  update();

  return () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    ro?.disconnect();
    io?.disconnect();
    window.removeEventListener("mousemove", mouse);
    window.removeEventListener("touchmove", touch);
    document.removeEventListener("mouseleave", leave);
    document.removeEventListener("visibilitychange", vis);
    canvas.remove();
  };
}

declare global {
  interface Window {
    /** Options of the running hero background (read by the end-to-end tests). */
    __flowstateTopology?: TopologyOptions;
  }
}

export function useTopology(ref: RefObject<HTMLElement | null>, dark: boolean): BackgroundStatus {
  const [status, setStatus] = useState<BackgroundStatus>("loading");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const opts = topologyOptions(dark);
    let destroy: (() => void) | null = null;
    try {
      destroy = startTopology(el, opts, reduce);
      window.__flowstateTopology = opts;
      setStatus("on");
    } catch (e) {
      console.info("[flowstate] Animated background unavailable, using the static design:", (e as Error).message);
      setStatus("failed");
    }
    return () => {
      destroy?.();
    };
  }, [ref, dark]);
  return status;
}
