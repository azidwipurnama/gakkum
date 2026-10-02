"use client";

import React, { useEffect, useRef } from "react";

interface CyberGlobeBgProps {
  wifiName?: string;
}

// Warm Paper Design Tokens (read from CSS variables when available)
const COLORS = {
  ink: "#1F1D1A",
  inkSoft: "#6B665C",
  inkFaint: "#B8B1A0",
  accent: "#B4531A",
  statusOn: "#4A7A57",
  statusOff: "#A5432B",
  bgPanel: "#FAF8F3",
  bgSubtle: "#F1EDE3",
  line: "#DDD7C8",
};

export default function CyberGlobeBg({ wifiName = "WING C - GAKKUM" }: CyberGlobeBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const g = cv.getContext("2d")!;
    if (!g) return;

    let W = 0, H = 0, R = 0, cx = 0, cy = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Read CSS variables for theme consistency
    const root = getComputedStyle(document.documentElement);
    const resolvedColors = {
      ink: root.getPropertyValue('--ink') || COLORS.ink,
      inkSoft: root.getPropertyValue('--ink-soft') || COLORS.inkSoft,
      inkFaint: root.getPropertyValue('--ink-faint') || COLORS.inkFaint,
      accent: root.getPropertyValue('--accent') || COLORS.accent,
      bgSubtle: root.getPropertyValue('--bg-subtle') || COLORS.bgSubtle,
      line: root.getPropertyValue('--line') || COLORS.line,
      statusOn: root.getPropertyValue('--status-on') || COLORS.statusOn,
      statusOff: root.getPropertyValue('--status-off') || COLORS.statusOff,
    };

    const size = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.38;
      cx = W / 2;
      cy = H / 2;
    };

    window.addEventListener("resize", size);
    size();

    const TILT = 0.42;
    let yaw = 0;

    // Reduced rotation speed for calm aesthetic
    const ROTATION_SPEED = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.0018;

    // VARIABEL DRAG HANYA DIDEFINISIKAN 1 KALI DI SINI
    let drag = false;
    let lx = 0;

    // 1. Hybrid Event Listener (Kursor Drag Globe + Scroll Web Berjalan)
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;

      // 2. Cegah drag jika klik pada elemen UI interaktif
      if (
        target.tagName === "BUTTON" ||
        target.closest("button") ||
        target.closest(".pointer-events-auto") || // UI elements
        target.closest("table")
      ) {
        return;
      }

      // 1. Batasan area drag (R * 1.55)
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (dist > R * 1.55) {
        return; // Klik di luar area globe, biarkan scroll lewat
      }

      drag = true;
      lx = e.clientX;
    };

    const onPointerUp = () => {
      drag = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - lx;
        yaw += dx * 0.005;
        lx = e.clientX;
      }
    };

    // Pasang listener ke WINDOW agar tidak memblokir event scroll pada canvas
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);

    // 2. Scroll Listener (Rotasi Globe saat Web discroll)
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const delta = window.scrollY - lastScrollY;
      yaw += delta * 0.001;
      lastScrollY = window.scrollY;
    };
    window.addEventListener("scroll", handleScroll);

    const ll = (la: number, lo: number): [number, number, number] => {
      la *= Math.PI / 180;
      lo *= Math.PI / 180;
      return [
        Math.cos(la) * Math.sin(lo),
        Math.sin(la),
        Math.cos(la) * Math.cos(lo),
      ];
    };

    function view(v: [number, number, number], useYaw = true): [number, number, number] {
      let [x, y, z] = v;
      if (useYaw) {
        const c = Math.cos(yaw),
          s = Math.sin(yaw);
        [x, z] = [x * c + z * s, -x * s + z * c];
      }
      const ct = Math.cos(TILT),
        st = Math.sin(TILT);
      [y, z] = [y * ct - z * st, y * st + z * ct];
      return [x, y, z];
    }

    const P = (v: [number, number, number]): [number, number] => [
      cx + v[0] * R,
      cy - v[1] * R,
    ];

    // Land Dots Generation
    const dots: { v: [number, number, number]; land: boolean }[] = [];
    const N = 2400;
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.399963;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const f =
        Math.sin(3 * x + 1) +
        Math.sin(4 * y) * Math.cos(3 * z) +
        Math.sin(5 * z + x * 2);
      dots.push({ v: [x, y, z], land: f > 0.55 });
    }

    const target = ll(-6.2, 106.8);
    const threats = [
      [40, -74],
      [55, 37],
      [35, 116],
      [-23, -46],
      [52, 10],
      [1, 32],
      [36, 139],
      [-33, 151],
      [25, 55],
      [19, -99],
    ].map(([a, b]) => ll(a, b));

    const normals = [
      [1.3, 103.8],
      [35, -118],
      [51, 0],
      [-26, 28],
      [28, 77],
      [37, 127],
    ].map(([a, b]) => ll(a, b));

    function arc(
      a: [number, number, number],
      b: [number, number, number],
      t: number,
      lift: number
    ): [number, number, number] {
      const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const o = Math.acos(d);
      const s = Math.sin(o) || 1;
      const k1 = Math.sin((1 - t) * o) / s;
      const k2 = Math.sin(t * o) / s;
      const v: [number, number, number] = [
        a[0] * k1 + b[0] * k2,
        a[1] * k1 + b[1] * k2,
        a[2] * k1 + b[2] * k2,
      ];
      const h = 1 + (lift * Math.sin(Math.PI * t) * o) / Math.PI;
      const n = Math.hypot(...v);
      return v.map((q) => (q / n) * h) as [number, number, number];
    }

    interface Flow {
      a: [number, number, number];
      b: [number, number, number];
      th: boolean;
      t: number;
      sp: number;
      lift: number;
    }

    const flows: Flow[] = [];
    function spawn() {
      const th = Math.random() < 0.55;
      const srcList = th ? threats : normals;
      const src = srcList[Math.floor(Math.random() * srcList.length)];
      flows.push({
        a: src,
        b: target,
        th,
        t: 0,
        sp: 0.006 + Math.random() * 0.006,
        lift: 0.35 + Math.random() * 0.2,
      });
    }

    for (let i = 0; i < 9; i++) {
      spawn();
      flows[i].t = Math.random();
    }

    let animId: number;

    function frame() {
      if (!g) return;
      if (!drag) yaw += ROTATION_SPEED;
      const now = performance.now();
      g.clearRect(0, 0, W, H);

      // Base Globe Body - "ink on paper" style
      // Globe sits directly on page background (no card, no glow)
      const globeGradient = g.createRadialGradient(
        cx - R * 0.3,
        cy - R * 0.35,
        R * 0.1,
        cx,
        cy,
        R
      );
      // Subtle earthy gradient using token colors
      globeGradient.addColorStop(0, "#E0D9C8");
      globeGradient.addColorStop(1, resolvedColors.bgSubtle);

      g.fillStyle = globeGradient;
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = resolvedColors.ink;
      g.lineWidth = 1;
      g.stroke();

      // Dots Peta Benua - earthy, depth-based
      for (const d of dots) {
        const v = view(d.v);
        const [x, y] = P(v);
        if (v[2] < 0) {
          g.fillStyle = `${resolvedColors.inkSoft}1F`;
          g.fillRect(x, y, 1, 1);
          continue;
        }
        const a = 0.3 + 0.7 * v[2];
        if (d.land) {
          const landColor = hexToRgba(resolvedColors.inkSoft, 0.25 + 0.45 * a);
          g.fillStyle = `rgba(${landColor}, ${0.25 + 0.45 * a})`;
          const dotSize = 2.8 * (0.6 + v[2] * 0.5);
          g.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
        } else {
          g.fillStyle = `rgba(${hexToRgb(resolvedColors.inkFaint)}, ${0.2 * a})`;
          g.fillRect(x - 0.4, y - 0.4, 1.2, 1.2);
        }
      }

      // Orbit Rings - subtle
      [
        [0.5, 0.2, 1.32],
        [-0.9, -0.35, 1.55],
      ].forEach(([tx, tz, r], k) => {
        g.lineWidth = 0.75;
        let prev: [number, number] | null = null;
        for (let u = 0; u <= 64; u++) {
          const q = (u / 64) * Math.PI * 2;
          let x = Math.cos(q) * r,
            y = 0,
            z = Math.sin(q) * r;
          [x, y] = [
            x * Math.cos(tz) - y * Math.sin(tz),
            x * Math.sin(tz) + y * Math.cos(tz),
          ];
          [y, z] = [
            y * Math.cos(tx) - z * Math.sin(tx),
            y * Math.sin(tx) + z * Math.cos(tx),
          ];
          const v = view([x, y, z], false);
          const p = P(v);
          if (prev) {
            const hid = v[2] < 0 && Math.hypot(v[0], v[1]) < 1;
            if (!hid) {
              const orbitAlpha = v[2] > 0 ? 0.4 : 0.15;
              g.strokeStyle = `rgba(${hexToRgb(resolvedColors.inkFaint)}, ${orbitAlpha})`;
              g.beginPath();
              g.moveTo(prev[0], prev[1]);
              g.lineTo(p[0], p[1]);
              g.stroke();
            }
          }
          prev = p;
        }

        const q = (performance.now() / (3500 + k * 2000)) * (k ? -1 : 1);
        let x = Math.cos(q) * r,
          y = 0,
          z = Math.sin(q) * r;
        [x, y] = [
          x * Math.cos(tz) - y * Math.sin(tz),
          x * Math.sin(tz) + y * Math.cos(tz),
        ];
        [y, z] = [
          y * Math.cos(tx) - z * Math.sin(tx),
          y * Math.sin(tx) + z * Math.cos(tx),
        ];
        const v = view([x, y, z], false);
        if (!(v[2] < 0 && Math.hypot(v[0], v[1]) < 1)) {
          const p = P(v);
          g.fillStyle = resolvedColors.inkSoft;
          g.beginPath();
          g.arc(p[0], p[1], 2.5, 0, Math.PI * 2);
          g.fill();
        }
      });

      // Garis Arcs Flow - copper accent for connections
      for (let i = flows.length - 1; i >= 0; i--) {
        const f = flows[i];
        f.t += f.sp;
        const isThreat = f.th;
        const col = isThreat ? resolvedColors.accent : resolvedColors.inkSoft;
        const steps = 40,
          head = Math.min(f.t, 1),
          tail = Math.max(0, head - 0.4);
        let prev: [number, number] | null = null;
        for (let s = 0; s <= steps; s++) {
          const t = tail + ((head - tail) * s) / steps;
          const v = view(arc(f.a, f.b, t, f.lift));
          const p = P(v);
          if (prev && !(v[2] < 0 && Math.hypot(v[0], v[1]) < 1)) {
            const flowAlpha = (1.0 * s) / steps;
            g.strokeStyle = `rgba(${hexToRgb(col)}, ${flowAlpha})`;
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(prev[0], prev[1]);
            g.lineTo(p[0], p[1]);
            g.stroke();
          }
          prev = p;
        }
        if (f.t >= 1) {
          flows.splice(i, 1);
          spawn();
        }
      }

      // Threat nodes (online) - green
      threats.forEach((v) => node(v, resolvedColors.statusOn, 4));

      // Normal traffic nodes - subtle
      normals.forEach((v) => node(v, resolvedColors.inkSoft, 3.5));

      // Target Wi-Fi Node (Server) - accent ring
      const tp = node(target, resolvedColors.accent, 5);

      if (tp) {
        const k = (now % 1800) / 1800;
        // Subtle pulse ring
        g.strokeStyle = `rgba(${hexToRgb(resolvedColors.accent)}, ${0.25 * (1 - k)})`;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(tp[0], tp[1], 10 + k * 8, 0, Math.PI * 2);
        g.stroke();

        // Label outside globe for readability
        const offset = 22;
        const labelX = tp[0] + offset;
        const labelY = tp[1] - offset;
        g.fillStyle = resolvedColors.ink;
        g.font = "11px ui-monospace, Consolas, monospace";
        g.shadowColor = "transparent";
        g.shadowBlur = 0;
        g.fillText(`Terhubung: ${wifiName}`, labelX, labelY);
      }

      animId = requestAnimationFrame(frame);
    }

    // Helper to convert hex to RGB string
    function hexToRgb(hex: string): string {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return '0, 0, 0';
      return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }

    // Helper to convert hex to rgba
    function hexToRgba(hex: string, alpha: number): string {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return '0, 0, 0';
      return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
    }

    // Node drawing function
    const node = (v0: [number, number, number], c: string, rSize: number) => {
      const v = view(v0);
      if (v[2] < 0) return null;
      const p = P(v);
      g.fillStyle = c;
      g.beginPath();
      g.arc(p[0], p[1], rSize, 0, Math.PI * 2);
      g.fill();
      return p;
    };

    frame();

    return () => {
      window.removeEventListener("resize", size);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(animId);
    };
  }, [wifiName]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
      }}
      role="img"
      aria-label="Network visualization globe"
    />
  );
}
