"use client";

import React, { useEffect, useRef } from "react";

interface CyberGlobeBgProps {
  wifiName?: string;
}

export default function CyberGlobeBg({ wifiName = "WING C - GAKKUM" }: CyberGlobeBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const g = cv.getContext("2d");
    if (!g) return;

    let W = 0, H = 0, R = 0, cx = 0, cy = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

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

    // VARIABEL DRAG HANYA DIDEFINISIKAN 1 KALI DI SINI
    let drag = false;
    let lx = 0;

    // 1. Hybrid Event Listener (Kursor Drag Globe + Scroll Web Berjalan)
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      // Jangan drag jika fokus pada elemen interaktif UI
      if (
        target.tagName === "BUTTON" ||
        target.closest(".bg-slate-900\\/50") ||
        target.closest("table")
      ) {
        return;
      }

      // Pastikan hanya drag jika berada di area globe
      const rect = cv.getBoundingClientRect();
      const dx = e.clientX - rect.left - cx;
      const dy = e.clientY - rect.top - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist > R * 1.25) {
        return; // Outside globe area, biarkan event mouse/touch untuk scroll
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
        yaw += dx * 0.005; // Putar globe mengikuti drag kursor
        lx = e.clientX;
      }
    };

    // Pasang listener langsung ke elemen canvas
    cv.addEventListener("pointerdown", onPointerDown);
    cv.addEventListener("pointerup", onPointerUp);
    cv.addEventListener("pointermove", onPointerMove);

    // 2. Scroll Listener (Rotasi Globe saat Web discroll)
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const delta = window.scrollY - lastScrollY;
      yaw += delta * 0.002;
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
      let v: [number, number, number] = [
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
      if (!drag) yaw += 0.0028;
      g.clearRect(0, 0, W, H);

      // Atmosphere Glow
      let gr = g.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.55);
      gr.addColorStop(0, "rgba(0,240,255,0.35)");
      gr.addColorStop(1, "rgba(0,240,255,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, R * 1.55, 0, 7);
      g.fill();

      // Base Globe Body
      gr = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
      gr.addColorStop(0, "#0e2230");
      gr.addColorStop(1, "#050d14");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, R, 0, 7);
      g.fill();
      g.strokeStyle = "rgba(0,240,255,0.65)";
      g.lineWidth = 1.8;
      g.stroke();

      // Dots Peta Benua
      for (const d of dots) {
        const v = view(d.v);
        const [x, y] = P(v);
        if (v[2] < 0) {
          g.fillStyle = "rgba(0,240,255,0.15)";
          g.fillRect(x, y, 1.2, 1.2);
          continue;
        }
        const a = 0.3 + 0.7 * v[2];
        if (d.land) {
          g.fillStyle = `rgba(0,240,255,${0.4 + 0.6 * a})`;
          g.fillRect(
            x - 1.2,
            y - 1.2,
            2.8 * (0.6 + v[2] * 0.5),
            2.8 * (0.6 + v[2] * 0.5)
          );
        } else {
          g.fillStyle = `rgba(100,180,210,${0.35 * a})`;
          g.fillRect(x - 0.5, y - 0.5, 1.5, 1.5);
        }
      }

      // Orbit Rings
      [
        [0.5, 0.2, 1.32],
        [-0.9, -0.35, 1.55],
      ].forEach(([tx, tz, r], k) => {
        g.lineWidth = 1.8;
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
              g.strokeStyle = `rgba(0,240,255,${v[2] > 0 ? 0.6 : 0.2})`;
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
          g.fillStyle = "#00f3ff";
          g.beginPath();
          g.arc(p[0], p[1], 4, 0, 7);
          g.fill();
        }
      });

      // Garis Arcs Flow
      for (let i = flows.length - 1; i >= 0; i--) {
        const f = flows[i];
        f.t += f.sp;
        const col = f.th ? "255,85,0" : "0,240,255";
        const steps = 40,
          head = Math.min(f.t, 1),
          tail = Math.max(0, head - 0.4);
        let prev: [number, number] | null = null;
        for (let s = 0; s <= steps; s++) {
          const t = tail + ((head - tail) * s) / steps;
          const v = view(arc(f.a, f.b, t, f.lift));
          const p = P(v);
          if (prev && !(v[2] < 0 && Math.hypot(v[0], v[1]) < 1)) {
            g.strokeStyle = `rgba(${col},${(1.0 * s) / steps})`;
            g.lineWidth = 3.2;
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

      // Target Wi-Fi Node
      const now = performance.now();
      const node = (v0: [number, number, number], c: string, r: number) => {
        const v = view(v0);
        if (v[2] < 0) return null;
        const p = P(v);
        g.fillStyle = `rgb(${c})`;
        g.beginPath();
        g.arc(p[0], p[1], r, 0, 7);
        g.fill();
        return p;
      };

      threats.forEach((v) => node(v, "255,85,0", 4.5));
      normals.forEach((v) => node(v, "0,240,255", 4));

      const tp = node(target, "255,255,255", 6);

      if (tp) {
        const k = (now % 1800) / 1800;
        g.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(tp[0], tp[1], 8 + k * 32, 0, 7);
        g.stroke();

        g.fillStyle = "#ffffff";
        g.font = "bold 13px ui-monospace, Consolas, monospace";
        g.shadowColor = "rgba(0,240,255,0.8)";
        g.shadowBlur = 8;
        g.fillText(`CONNECTED: ${wifiName.toUpperCase()}`, tp[0] + 16, tp[1] - 8);
        g.shadowBlur = 0;
      }

      animId = requestAnimationFrame(frame);
    }

    frame();

    return () => {
      window.removeEventListener("resize", size);
      window.removeEventListener("scroll", handleScroll);
      // Bersihkan listener dari elemen canvas
      cv.removeEventListener("pointerdown", onPointerDown);
      cv.removeEventListener("pointerup", onPointerUp);
      cv.removeEventListener("pointermove", onPointerMove);
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
        pointerEvents: "auto",
        touchAction: "pan-y",
      }}
    />
  );
}
