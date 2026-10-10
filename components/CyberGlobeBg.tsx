"use client";

import React, { useEffect, useRef } from "react";

interface CyberGlobeBgProps {
  wifiName?: string;
  className?: string;
  style?: React.CSSProperties;
}

type V3 = [number, number, number];
type RGB = [number, number, number];

// Fallback dipakai bila variabel CSS tidak ada atau formatnya tidak dikenali browser.
const FALLBACK: Record<string, string> = {
  "--ink": "#1F1D1A",
  "--ink-soft": "#6B665C",
  "--accent": "#B4531A",
  "--status-on": "#4A7A57",
  "--line": "#DDD7C8",
  "--bg-subtle": "#F1EDE3",
};

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const ll = (la: number, lo: number): V3 => {
  const a = la * D2R;
  const o = lo * D2R;
  return [Math.cos(a) * Math.sin(o), Math.sin(a), Math.cos(a) * Math.cos(o)];
};

// Mengubah warna CSS apa pun (hex, rgb, oklch, nama) menjadi RGB lewat browser itu sendiri.
function makeResolver() {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  return (css: string, fallback: string): RGB => {
    for (const v of [css, fallback]) {
      if (!v) continue;
      x.fillStyle = "#010203";
      x.fillStyle = v;
      if (x.fillStyle === "#010203") continue; // nilai tidak valid
      x.clearRect(0, 0, 1, 1);
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    }
    return [0, 0, 0];
  };
}

const RINGS = [
  { r: 1.3, tx: 1.15, tz: 0.25, sp: 0.05 },
  { r: 1.55, tx: 0.55, tz: -0.5, sp: -0.035 },
];
const RING_STEPS = 96;

export default function CyberGlobeBg({
  wifiName = "WING C - GAKKUM",
  className,
  style,
}: CyberGlobeBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // wifiName lewat ref agar perubahan nilainya TIDAK mengulang efek dan mereset globe.
  const wifiRef = useRef(wifiName);
  useEffect(() => {
    wifiRef.current = wifiName;
  }, [wifiName]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;

    /* ---------- warna ---------- */
    const resolve = makeResolver();
    const readColors = () => {
      const root = getComputedStyle(document.documentElement);
      const get = (n: string): RGB => resolve(root.getPropertyValue(n).trim(), FALLBACK[n]);
      return {
        ink: get("--ink"),
        soft: get("--ink-soft"),
        accent: get("--accent"),
        on: get("--status-on"),
        sub: get("--bg-subtle"),
      };
    };
    let col = readColors();
    const refreshColors = () => {
      col = readColors();
    };
    const mo = new MutationObserver(refreshColors);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refreshColors);

    /* ---------- ukuran (tajam di semua layar) ---------- */
    let S = 0;
    let R = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      S = cv.clientWidth;
      if (!S) return;
      cv.width = Math.round(S * dpr);
      cv.height = Math.round(S * dpr);
      R = S * 0.3; // cincin terluar 1.55R = 0.465S, tidak terpotong tepi kanvas
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();

    /* ---------- model ---------- */
    const N = 3200;
    const dx = new Float32Array(N);
    const dy = new Float32Array(N);
    const dz = new Float32Array(N);
    const land: number[] = [];
    const sea: number[] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.399963;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      dx[i] = x;
      dy[i] = y;
      dz[i] = z;
      const f = Math.sin(3 * x + 1) + Math.sin(4 * y) * Math.cos(3 * z) + Math.sin(5 * z + x * 2);
      (f > 0.55 ? land : sea).push(i);
    }

    const grat: V3[][] = [];
    for (let la = -60; la <= 60; la += 30) {
      const L: V3[] = [];
      for (let k = 0; k <= 72; k++) L.push(ll(la, k * 5));
      grat.push(L);
    }
    for (let lo = 0; lo < 180; lo += 30) {
      const A: V3[] = [];
      const B: V3[] = [];
      for (let k = 0; k <= 72; k++) {
        A.push(ll(-90 + k * 2.5, lo));
        B.push(ll(-90 + k * 2.5, lo + 180));
      }
      grat.push(A, B);
    }

    const target = ll(-6.2, 106.8);
    const threats = ([[40, -74], [55, 37], [35, 116], [-23, -46], [52, 10], [1, 32], [36, 139], [-33, 151], [25, 55], [19, -99], [-15, -60], [50, -100]] as [number, number][]).map(([a, b]) => ll(a, b));
    const normals = ([[1.3, 103.8], [35, -118], [51, 0], [-26, 28], [28, 77], [37, 127], [10, -20], [-40, 10]] as [number, number][]).map(([a, b]) => ll(a, b));

    interface Flow {
      a: V3;
      th: boolean;
      t: number;
      sp: number; // progres per DETIK (bukan per frame)
      lift: number;
    }
    const spawn = (): Flow => {
      const th = Math.random() < 0.55;
      const list = th ? threats : normals;
      return {
        a: list[Math.floor(Math.random() * list.length)],
        th,
        t: 0,
        sp: 0.36 + Math.random() * 0.36,
        lift: 0.35 + Math.random() * 0.2,
      };
    };
    const flows: Flow[] = [];
    for (let i = 0; i < 15; i++) {
      const f = spawn();
      f.t = Math.random();
      flows.push(f);
    }

    /* ---------- rotasi (tanpa alokasi per frame) ---------- */
    const AX = 0.41; // kemiringan sumbu bumi (ke samping)
    const BASE_PITCH = 0.28;
    let yaw = 0.6;
    let pitch = BASE_PITCH;
    let vYaw = 0;
    let vPitch = 0;
    let cyw = 1, syw = 0, ctt = 1, stt = 0, cpp = 1, spp = 0;
    const o: V3 = [0, 0, 0];
    const ao: V3 = [0, 0, 0];
    const rot = (x: number, y: number, z: number, useYaw = true) => {
      if (useYaw) {
        const nx = x * cyw + z * syw;
        z = -x * syw + z * cyw;
        x = nx;
      }
      const nx2 = x * ctt - y * stt;
      y = x * stt + y * ctt;
      x = nx2;
      const ny = y * cpp - z * spp;
      z = y * spp + z * cpp;
      y = ny;
      o[0] = x;
      o[1] = y;
      o[2] = z;
    };
    const arcPt = (a: V3, b: V3, t: number, lift: number) => {
      const d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
      const om = Math.acos(d);
      const s = Math.sin(om) || 1;
      const k1 = Math.sin((1 - t) * om) / s;
      const k2 = Math.sin(t * om) / s;
      const x = a[0] * k1 + b[0] * k2;
      const y = a[1] * k1 + b[1] * k2;
      const z = a[2] * k1 + b[2] * k2;
      const n = Math.hypot(x, y, z) || 1;
      const h = 1 + (lift * Math.sin(Math.PI * t) * om) / Math.PI;
      ao[0] = (x / n) * h;
      ao[1] = (y / n) * h;
      ao[2] = (z / n) * h;
    };

    /* ---------- cincin orbit ---------- */
    const ringBuf = RINGS.map(() => new Float32Array((RING_STEPS + 1) * 3));
    const fillRing = (rg: (typeof RINGS)[number], buf: Float32Array, t: number, cx: number, cy: number) => {
      const ry = t * rg.sp;
      const ct = Math.cos(rg.tx), st = Math.sin(rg.tx);
      const cz = Math.cos(rg.tz), sz = Math.sin(rg.tz);
      const cr = Math.cos(ry), sr = Math.sin(ry);
      const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
      for (let k = 0; k <= RING_STEPS; k++) {
        const a = (k / RING_STEPS) * TAU;
        const x = Math.cos(a) * rg.r;
        const z = Math.sin(a) * rg.r;
        const y1 = -z * st;
        const z1 = z * ct;
        const x2 = x * cz - y1 * sz;
        const y2 = x * sz + y1 * cz;
        const x3 = x2 * cr + z1 * sr;
        const z3 = -x2 * sr + z1 * cr;
        const y4 = y2 * cp - z3 * sp;
        const z4 = y2 * sp + z3 * cp;
        buf[k * 3] = cx + x3 * R;
        buf[k * 3 + 1] = cy - y4 * R;
        buf[k * 3 + 2] = z4;
      }
    };
    const strokeHalf = (buf: Float32Array, front: boolean) => {
      g.beginPath();
      let pen = false;
      for (let k = 0; k <= RING_STEPS; k++) {
        if (buf[k * 3 + 2] >= 0 === front) {
          if (!pen) {
            g.moveTo(buf[k * 3], buf[k * 3 + 1]);
            pen = true;
          } else g.lineTo(buf[k * 3], buf[k * 3 + 1]);
        } else pen = false;
      }
      g.stroke();
    };

    /* ---------- gambar ---------- */
    const drawNode = (v: V3, c: RGB, rs: number, cx: number, cy: number): [number, number, number] | null => {
      rot(v[0], v[1], v[2]);
      if (o[2] <= 0) return null;
      const x = cx + o[0] * R;
      const y = cy - o[1] * R;
      const f = clamp(o[2] / 0.22, 0, 1);
      const sf = f * f * (3 - 2 * f);
      g.fillStyle = rgba(c, sf * (0.4 + 0.6 * o[2]));
      g.beginPath();
      g.arc(x, y, rs, 0, TAU);
      g.fill();
      return [x, y, o[2]];
    };

    // keadaan label "Terhubung" (diredam agar gerakannya halus)
    const lab = { vx: 0.7, vy: -0.7, side: 0, a: 0, text: "", font: "", w1: 0, w2: 0 };
    const TAG = "Terhubung: ";

    const draw = (t: number, dt: number) => {
      const cx = S / 2;
      const cy = S / 2;
      const { ink, soft, accent, on, sub } = col;
      cyw = Math.cos(yaw); syw = Math.sin(yaw);
      ctt = Math.cos(AX); stt = Math.sin(AX);
      cpp = Math.cos(pitch); spp = Math.sin(pitch);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, S, S);
      g.globalAlpha = 1;

      // cahaya atmosfer
      const gl = g.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.6);
      gl.addColorStop(0, rgba(accent, 0.14));
      gl.addColorStop(1, rgba(accent, 0));
      g.fillStyle = gl;
      g.fillRect(0, 0, S, S);

      // cincin bagian belakang (tertutup globe)
      RINGS.forEach((rg, k) => fillRing(rg, ringBuf[k], t, cx, cy));
      g.strokeStyle = rgba(soft, 0.3);
      g.lineWidth = 1.2;
      ringBuf.forEach((b) => strokeHalf(b, false));

      // badan globe: terang di kiri atas, gelap di tepi
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.fillStyle = rgba(mix(sub, [255, 255, 255], 0.35), 1);
      g.fill();
      const sh = g.createRadialGradient(cx - 0.35 * R, cy - 0.4 * R, R * 0.2, cx, cy, R * 1.02);
      sh.addColorStop(0, rgba(ink, 0));
      sh.addColorStop(0.6, rgba(ink, 0));
      sh.addColorStop(1, rgba(ink, 0.2));
      g.fillStyle = sh;
      g.fill();

      // garis lintang-bujur
      g.strokeStyle = rgba(ink, 0.1);
      g.lineWidth = 0.8;
      for (const L of grat) {
        g.beginPath();
        let pen = false;
        for (let k = 0; k < L.length; k++) {
          rot(L[k][0], L[k][1], L[k][2]);
          if (o[2] > 0) {
            const X = cx + o[0] * R;
            const Y = cy - o[1] * R;
            if (!pen) {
              g.moveTo(X, Y);
              pen = true;
            } else g.lineTo(X, Y);
          } else pen = false;
        }
        g.stroke();
      }

      // titik laut (samar) lalu titik daratan
      g.fillStyle = rgba(soft, 1);
      for (let n = 0; n < sea.length; n++) {
        const i = sea[n];
        rot(dx[i], dy[i], dz[i]);
        if (o[2] < 0) continue;
        g.globalAlpha = 0.16 * (0.3 + 0.7 * o[2]);
        g.fillRect(cx + o[0] * R - 0.6, cy - o[1] * R - 0.6, 1.2, 1.2);
      }
      for (let n = 0; n < land.length; n++) {
        const i = land[n];
        rot(dx[i], dy[i], dz[i]);
        if (o[2] < 0) {
          g.globalAlpha = 0.06;
          g.fillRect(cx + o[0] * R, cy - o[1] * R, 1, 1);
          continue;
        }
        const lit = clamp(0.6 + 0.5 * (-0.4 * o[0] + 0.45 * o[1] + 0.6 * o[2]), 0.3, 1.1);
        g.globalAlpha = clamp((0.3 + 0.55 * (0.3 + 0.7 * o[2])) * lit, 0, 1);
        const sz = R * 0.012 * (0.7 + 0.6 * o[2]);
        g.fillRect(cx + o[0] * R - sz / 2, cy - o[1] * R - sz / 2, sz, sz);
      }
      g.globalAlpha = 1;

      // aliran koneksi
      g.lineCap = "round";
      for (let i = flows.length - 1; i >= 0; i--) {
        const f = flows[i];
        f.t += f.sp * dt;
        const c = f.th ? accent : soft;
        const head = Math.min(f.t, 1);
        const tail = Math.max(0, head - 0.4);
        const STEPS = 24;
        let px = 0;
        let py = 0;
        let have = false;
        for (let s = 0; s <= STEPS; s++) {
          arcPt(f.a, target, tail + ((head - tail) * s) / STEPS, f.lift);
          rot(ao[0], ao[1], ao[2]);
          const x = cx + o[0] * R;
          const y = cy - o[1] * R;
          const hid = o[2] < 0 && Math.hypot(o[0], o[1]) < 1;
          if (have && !hid) {
            g.strokeStyle = rgba(c, s / STEPS);
            g.lineWidth = 1.6;
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(x, y);
            g.stroke();
          }
          if (s === STEPS && !hid) {
            g.fillStyle = rgba(c, 1);
            g.beginPath();
            g.arc(x, y, 2.2, 0, TAU);
            g.fill();
          }
          px = x;
          py = y;
          have = true;
        }
        if (f.t >= 1) flows[i] = spawn();
      }

      // titik node
      for (const v of threats) drawNode(v, on, R * 0.024, cx, cy);
      for (const v of normals) drawNode(v, soft, R * 0.02, cx, cy);
      const tp = drawNode(target, accent, R * 0.03, cx, cy);

      // label "Terhubung": memudar mengikuti kedalaman, arah dan sisi diredam, dijaga di dalam kanvas
      let aTarget = 0;
      if (tp) {
        const v = clamp((tp[2] - 0.02) / 0.34, 0, 1);
        aTarget = v * v * (3 - 2 * v);
      }
      lab.a += (aTarget - lab.a) * (1 - Math.exp(-dt * 12));
      if (tp && lab.a > 0.01) {
        // cincin denyut ikut memudar
        const k = (t % 1.8) / 1.8;
        g.strokeStyle = rgba(accent, 0.3 * (1 - k) * lab.a);
        g.lineWidth = 1;
        g.beginPath();
        g.arc(tp[0], tp[1], R * 0.06 + k * R * 0.1, 0, TAU);
        g.stroke();

        // arah label: ke kanan-atas bila titik dekat pusat, keluar menjauhi pusat bila dekat tepi
        const rx = tp[0] - cx;
        const ry = tp[1] - cy;
        const rd = Math.hypot(rx, ry) || 1;
        const w = clamp((rd / R - 0.35) / 0.5, 0, 1);
        const ws = w * w * (3 - 2 * w);
        let tx = (rx / rd) * ws + 0.7 * (1 - ws);
        let ty = (ry / rd) * ws - 0.7 * (1 - ws);
        const tn = Math.hypot(tx, ty) || 1;
        tx /= tn;
        ty /= tn;
        const sm = 1 - Math.exp(-dt * 5);
        lab.vx += (tx - lab.vx) * sm;
        lab.vy += (ty - lab.vy) * sm;
        const vn = Math.hypot(lab.vx, lab.vy) || 1;
        const ux = lab.vx / vn;
        const uy = lab.vy / vn;

        // garis penghubung memanjang saat label muncul
        const L = R * 0.2 * (0.3 + 0.7 * lab.a);
        const ax = tp[0] + ux * L;
        const ay = tp[1] + uy * L;

        // ukuran teks (diukur sekali, diulang hanya bila font atau SSID berubah)
        const fs = Math.max(11, S * 0.02);
        const font = `${fs}px ui-monospace, Consolas, monospace`;
        const text = wifiRef.current;
        if (lab.font !== font || lab.text !== text) {
          g.font = font;
          lab.w1 = g.measureText(TAG).width;
          lab.w2 = g.measureText(text).width;
          lab.font = font;
          lab.text = text;
        }
        const tw = lab.w1 + lab.w2;

        // sisi teks (kiri atau kanan titik) berpindah dengan meluncur, bukan melompat
        const wantSide = ux < -0.15 ? 1 : ux > 0.15 ? 0 : lab.side;
        lab.side += (wantSide - lab.side) * sm;
        const dir = 1 - 2 * lab.side;
        let textX = ax + dir * 5 - lab.side * tw;
        const shift = clamp(textX, 6, S - 6 - tw) - textX; // jangan terpotong tepi kanvas
        textX += shift;
        const ax2 = ax + shift;

        g.globalAlpha = lab.a;
        g.lineWidth = 1;
        g.strokeStyle = rgba(soft, 0.8);
        g.beginPath();
        g.moveTo(tp[0], tp[1]);
        g.lineTo(ax2, ay);
        g.lineTo(ax2 + dir * (tw + 10), ay);
        g.stroke();

        g.font = font;
        g.textBaseline = "alphabetic";
        g.lineJoin = "round";
        g.lineWidth = 3;
        g.strokeStyle = rgba(sub, 0.9);
        g.strokeText(TAG + text, textX, ay - 5);
        g.fillStyle = rgba(soft, 1);
        g.fillText(TAG, textX, ay - 5);
        g.fillStyle = rgba(ink, 1);
        g.fillText(text, textX + lab.w1, ay - 5);
        g.globalAlpha = 1;
      }

      // tepi globe, cincin bagian depan, satelit
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.strokeStyle = rgba(ink, 0.9);
      g.lineWidth = 1.1;
      g.stroke();
      g.strokeStyle = rgba(soft, 0.6);
      g.lineWidth = 1.2;
      ringBuf.forEach((b) => strokeHalf(b, true));
      ringBuf.forEach((b, k) => {
        const idx = Math.floor((((t / (3.5 + k * 2)) * (k ? -1 : 1)) % 1 + 1) % 1 * RING_STEPS);
        const front = b[idx * 3 + 2] >= 0;
        g.fillStyle = rgba(soft, front ? 1 : 0.4);
        g.beginPath();
        g.arc(b[idx * 3], b[idx * 3 + 1], front ? 2.6 : 1.8, 0, TAU);
        g.fill();
      });
    };

    /* ---------- loop (berbasis waktu nyata) ---------- */
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let drag = false;
    let lx = 0;
    let ly = 0;
    let lt = 0;
    let idle = 3; // mulai langsung berputar
    let running = !document.hidden;
    let visible = true;
    let prev = performance.now();
    let anim = 0;

    const frame = (now: number) => {
      anim = 0;
      if (!running || !visible) return;
      anim = requestAnimationFrame(frame);
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      if (!S) return;
      if (!drag) {
        idle += dt;
        let k = clamp((idle - 1.2) / 1.5, 0, 1);
        k = k * k * (3 - 2 * k); // rotasi otomatis kembali pelan setelah dilepas
        yaw += (vYaw + (reduce ? 0 : 0.12 * k)) * dt;
        vYaw *= Math.exp(-dt * 2.4); // inersia
        pitch += vPitch * dt;
        vPitch *= Math.exp(-dt * 3);
        pitch += (BASE_PITCH - pitch) * Math.min(dt * 0.9, 1) * k;
        pitch = clamp(pitch, -0.9, 0.9);
      }
      draw(now / 1000, dt);
    };
    const resume = () => {
      if (!anim && running && visible) {
        prev = performance.now();
        anim = requestAnimationFrame(frame);
      }
    };

    /* ---------- interaksi: langsung di kanvas, koordinat lokal ---------- */
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const r = cv.getBoundingClientRect();
      const d = Math.hypot(e.clientX - r.left - S / 2, e.clientY - r.top - S / 2);
      if (d > R * 1.6) return; // di luar area globe: biarkan halaman menerima event
      drag = true;
      lx = e.clientX;
      ly = e.clientY;
      lt = performance.now();
      vYaw = 0;
      vPitch = 0;
      idle = 0;
      cv.style.cursor = "grabbing";
      cv.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const now = performance.now();
      const dt = Math.max((now - lt) / 1000, 0.008);
      const mouse = e.pointerType !== "touch";
      const ky = (e.clientX - lx) / R; // permukaan globe mengikuti kursor
      const kp = mouse ? (e.clientY - ly) / R : 0;
      yaw += ky;
      pitch = clamp(pitch + kp, -0.9, 0.9);
      vYaw = vYaw * 0.55 + (ky / dt) * 0.45;
      vPitch = vPitch * 0.55 + (kp / dt) * 0.45;
      lx = e.clientX;
      ly = e.clientY;
      lt = now;
      idle = 0;
    };
    const onUp = (e: PointerEvent) => {
      drag = false;
      cv.style.cursor = "grab";
      if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
    };
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);

    const onVis = () => {
      running = !document.hidden;
      resume();
    };
    document.addEventListener("visibilitychange", onVis);
    // hentikan render saat globe tidak terlihat (mis. di slide 2)
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      resume();
    });
    io.observe(cv);

    resume();

    return () => {
      if (anim) cancelAnimationFrame(anim);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onVis);
      mq.removeEventListener("change", refreshColors);
      mo.disconnect();
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(78vh, 620px, 94vw)",
        height: "min(78vh, 620px, 94vw)",
        zIndex: 0,
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Globe jaringan interaktif. Seret untuk memutar."
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          cursor: "grab",
          touchAction: "pan-y",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      />
    </div>
  );
}
