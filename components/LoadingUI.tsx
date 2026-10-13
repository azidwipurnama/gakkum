"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import CyberGlobeBg from './CyberGlobeBg';
import { useNetwork } from '../contexts/NetworkContext';

/* Warna — token konsisten dengan globals.css */
const COLORS = {
  ink: "#1F1D1A",
  inkSoft: "#6B665C",
  inkFaint: "#B8B1A0",
  accent: "#B4531A",
  statusOn: "#4A7A57",
  statusOff: "#A5432B",
  bgPage: "#E8E3D8",
  bgPanel: "#FAF8F3",
  bgSubtle: "#F1EDE3",
  line: "#DDD7C8",
};

const LOADING_STEPS = [
  { id: 'init', label: 'Inisialisasi sistem...' },
  { id: 'ws', label: 'Menghubungkan ke monitor...' },
  { id: 'data', label: 'Menerima data jaringan...' },
];

const MIN_DURATION = 3000; // ms — loading tampak minimal 3 detik

export default function LoadingUI({ onFinished }: { onFinished: () => void }) {
  const { isWsConnected, hasReceivedData } = useNetwork();

  /** Persentase jujur dari tahap nyata — selalu naik: 0 → 50 → 100 */
  const [pct, setPct] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [show, setShow] = useState(true);

  // step dihitung pure dari state WS saat render — tidak perlu state/effect terpisah.
  const step = hasReceivedData ? 2 : isWsConnected ? 1 : 0;

  const pctRef = useRef(0);
  const targetRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const mountRef = useRef(0);
  const finishedFiredRef = useRef(false);

  // Catat ts mount sekali (di luar useRef-init agar lulus aturan purity)
  useEffect(() => {
    if (mountRef.current === 0) mountRef.current = Date.now();
  }, []);

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Kunci gulir halaman selama loading (dan transisi keluar) ---
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  /** Persentase target dari state nyata (selalu naik): 0 → 50 → 100 */
  const targetPct = hasReceivedData ? 100 : isWsConnected ? 50 : 0;

  /** Smooth chase ke target — asimtot, berhenti saat cukup dekat (hindari 99.99%) */
  const chase = useCallback(
    (target: number) => {
      targetRef.current = target;
      if (reduce) {
        pctRef.current = target;
        setPct(target);
        return;
      }
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const run = () => {
        const p = pctRef.current;
        const t = targetRef.current;
        const next = p + (t - p) * 0.12;
        if (Math.abs(t - next) < 0.5) {
          pctRef.current = t;
          setPct(t);
          animRef.current = null;
          return;
        }
        pctRef.current = Math.round(next * 100) / 100;
        setPct(pctRef.current);
        animRef.current = requestAnimationFrame(run);
      };
      animRef.current = requestAnimationFrame(run);
    },
    [reduce]
  );

  // --- Update target persentase setiap state WS berubah (selalu naik) ---
  useEffect(() => {
    setTimeout(() => chase(targetPct), 0);
  }, [targetPct, chase]);

  // Bersihkan animasi bila unmount
  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }, []);

  // --- Setelah data diterima DAN durasi minimal 1,5 detik terpenuhi: fade keluar ---
  useEffect(() => {
    if (finishedFiredRef.current) return;
    if (!hasReceivedData) return;

    const remaining = Math.max(0, MIN_DURATION - (Date.now() - mountRef.current));
    // Pastikan animasi chase sampai 100% selesai sebelum fade dimulai (chase ~0→100
    // butuh sekitar 200ms di 60fps; beri sedikit ruang)
    const fadeDelay = remaining + 250;
    const minTimer = setTimeout(() => setIsTransitioning(true), fadeDelay);
    const fin = setTimeout(() => {
      finishedFiredRef.current = true;
      setShow(false);
      onFinished();
    }, fadeDelay + 400);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(fin);
    };
  }, [hasReceivedData, onFinished]);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        backgroundColor: COLORS.bgPage,
        opacity: isTransitioning ? 0 : 1,
        transition: "opacity 500ms ease",
      }}
    >
      {/* CyberGlobe — ukuran/posisi sama dengan Page 1.
          Wrapper `relative` agar globe's `absolute` child terikat dan terpusat.
          Globe pakai ukuran bawaan min(78vh,620px,94vw). */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CyberGlobeBg style={{ opacity: 0.8 }} />
      </div>

      {/* Bar progres horizontal tipis + angka persentase + teks status */}
      <div
        style={{
          position: "absolute", left: 0, right: 0,
          top: "calc(50% + min(78vh, 620px, 76vw) / 2 + 24px)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
          transition: "opacity 300ms ease",
        }}
      >
        {/* Progress bar (3px, lebar responsif, latar --line, isi --accent) */}
        <div
          style={{
            height: "3px", width: "100%", maxWidth: "min(320px, 76vw)",
            borderRadius: "9999px", overflow: "hidden",
            backgroundColor: COLORS.line,
          }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              height: "100%", width: `${pct}%`,
              backgroundColor: COLORS.accent,
              transition: "width 300ms ease",
            }}
          />
        </div>

        {/* Angka persentase (15px, monospace, tabular-nums) */}
        <span
          style={{
            fontFamily: "monospace", fontSize: "15px",
            fontVariantNumeric: "tabular-nums",
            color: COLORS.inkSoft,
          }}
          aria-live="polite"
        >
          {Math.round(pct)}%
        </span>

        {/* Teks status sesuai tahap */}
        <p style={{ textAlign: "center", fontSize: "14px", fontFamily: "monospace", color: COLORS.inkSoft }}>
          {LOADING_STEPS[step].label}
        </p>

        {/* Indikator status koneksi jaringan (bulat kecil) */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", marginTop: "0.25rem" }}>
          <span
            style={{
              display: "block", width: "8px", height: "8px", borderRadius: "50%",
              backgroundColor: isWsConnected ? COLORS.statusOn : COLORS.statusOff,
            }}
          />
          <span style={{ fontSize: "12px", color: COLORS.inkSoft }}>
            {isWsConnected ? "Terhubung" : "Menghubungkan..."}
          </span>
        </span>
      </div>

      {/* Elemen dekoratif: garis diagonal + grid tipis (hanya visual, CSS murni) */}
      <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: -10, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute", transform: "rotate(-45deg)", opacity: 0.25,
            top: "18%", left: "-8%", width: "116%", height: "2px",
            backgroundColor: COLORS.line,
          }}
        />
        <div
          style={{
            position: "absolute", opacity: 0.06,
            top: "8%", left: "8%", right: "8%", bottom: "8%",
            backgroundImage:
              "linear-gradient(rgba(29,31,26,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(29,31,26,0.25) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>
    </div>
  );
}
