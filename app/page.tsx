"use client";

import React, { useRef, useEffect, useState } from "react";
import { ChevronDown, Wifi, Radar, AlertTriangle, Check } from "lucide-react";
import CyberGlobeBg from "@/components/CyberGlobeBg";
import { useNetwork } from "@/contexts/NetworkContext";
import LoadingUI from "@/components/LoadingUI";

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
  rowHover: "rgba(31, 29, 26, 0.045)",
  line: "#DDD7C8",
};

const INSET = "clamp(16px, 3vw, 36px)";

// Indikator pengurutan untuk header tabel
function SortIndicator({ columnKey, sortConfig }: { columnKey: string; sortConfig: { key: string; direction: "asc" | "desc" } }) {
  if (sortConfig.key !== columnKey) {
    return <span className="ml-1.5 inline-flex items-center text-[12px] opacity-20">^</span>;
  }
  return (
    <span
      className={`ml-1.5 inline-flex items-center text-[12px] text-[var(--accent)] transition-transform duration-300 ${sortConfig.direction === "desc" ? "rotate-180" : "rotate-0"}`}
    >
      ^
    </span>
  );
}

// Komponen canvas radar mini dengan DPR handling
function RadarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;

    let angle = 0;
    let animId: number;
    const dpr = window.devicePixelRatio || 1;
    const size = 112;
    cv.width = size * dpr;
    cv.height = size * dpr;
    g.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 5;

    const blips = [
      { x: cx + 15, y: cy - 10, status: "on" },
      { x: cx - 18, y: cy + 15, status: "on" },
      { x: cx + 7, y: cy + 22, status: "off" },
    ];

    const draw = () => {
      g.clearRect(0, 0, size, size);
      g.strokeStyle = COLORS.inkFaint;
      g.lineWidth = 1;
      [0.3, 0.6, 0.9].forEach((s) => {
        g.beginPath();
        g.arc(cx, cy, r * s, 0, Math.PI * 2);
        g.stroke();
      });
      g.strokeStyle = COLORS.line;
      g.beginPath();
      g.moveTo(cx - r, cy);
      g.lineTo(cx + r, cy);
      g.moveTo(cx, cy - r);
      g.lineTo(cx, cy + r);
      g.stroke();

      angle += 0.03;
      const sx = cx + Math.cos(angle) * r;
      const sy = cy + Math.sin(angle) * r;

      g.fillStyle = `${COLORS.accent}26`;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, r, angle - 0.5, angle);
      g.closePath();
      g.fill();

      g.strokeStyle = COLORS.accent;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(sx, sy);
      g.stroke();

      blips.forEach((b) => {
        const c = b.status === "on" ? COLORS.statusOn : COLORS.statusOff;
        g.fillStyle = c;
        g.beginPath();
        g.arc(b.x, b.y, 3, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = c;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(b.x, b.y, 5, 0, Math.PI * 2);
        g.stroke();
      });

      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="mx-auto block"
      style={{ width: "112px", height: "112px" }}
      role="img"
      aria-label="Visualisasi radar"
    />
  );
}

export default function DashboardPage() {
  const { devices, metrics, ssid, alerts, loading } = useNetwork();
  const [isLoaded, setIsLoaded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "ip", direction: "asc" });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "up" | "down">("all");

  // Ref untuk slide 2 (untuk IntersectionObserver)
  const slide2Ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // State untuk tracking slide visible di viewport
  const [activeSlide, setActiveSlide] = useState(0);
  const [motionReady, setMotionReady] = useState(false);

  // IntersectionObserver untuk mendeteksi slide 2 masuk viewport dan trigger card animations
  useEffect(() => {
    if (!slide2Ref.current) return;

    // Set data-motion="ready" setelah observer dibuat
    setMotionReady(true);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === slide2Ref.current) {
            setActiveSlide(entry.isIntersecting ? 1 : 0);

            // Set data-in attribute untuk trigger animasi masuk
            if (entry.isIntersecting) {
              slide2Ref.current?.setAttribute("data-in", "true");
            } else {
              slide2Ref.current?.removeAttribute("data-in");
            }
          }
        });
      },
      { threshold: 0.35 }
    );

    observer.observe(slide2Ref.current);

    // Set data-motion="ready" pada slide2 element
    if (slide2Ref.current && motionReady) {
      slide2Ref.current.setAttribute("data-motion", "ready");
    }

    return () => observer.disconnect();
  }, [motionReady]);

  const scrollToSlide2 = () => {
    slide2Ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToSlide = (slideIndex: number) => {
    if (slideIndex === 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (slideIndex === 1) {
      scrollToSlide2();
    }
  };

  const validDevices = devices.filter((d) => d.ip && d.ip.trim() !== "");

  // Filter devices berdasarkan search query dan status filter
  const filteredDevices = validDevices.filter((d) => {
    const matchesSearch =
      !searchQuery ||
      d.ip?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.mac?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.hostname?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || (statusFilter === "up" && d.status === "UP") || (statusFilter === "down" && d.status === "DOWN");

    return matchesSearch && matchesStatus;
  });

  const sortedDevices = [...filteredDevices].sort((a, b) => {
    const aVal = a[sortConfig.key as keyof typeof a];
    const bVal = b[sortConfig.key as keyof typeof a];
    if (aVal === undefined || bVal === undefined) return 0;
    return sortConfig.direction === "asc"
      ? (aVal < bVal ? -1 : aVal > bVal ? 1 : 0)
      : (aVal > bVal ? -1 : aVal < bVal ? 1 : 0);
  });

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  };

  const subnetPrefix = metrics?.server_ip ? metrics.server_ip.split(".").slice(0, 3).join(".") + ".x" : "Localhost";

  return (
    <>
      {!isLoaded && <LoadingUI onFinished={() => setIsLoaded(true)} />}

      {/* Container scroll-snap dengan dua slide penuh layar */}
      <div
        className="bg-[var(--bg-page)] text-[var(--ink)]"
        style={{
          backgroundColor: COLORS.bgPage,
          color: COLORS.ink,
          height: "200dvh",
          scrollSnapType: "y mandatory",
          scrollBehavior: "smooth",
          overflow: "auto",
        }}
      >
        {/* SLIDE 1: Landing dengan Globe */}
        <section
          aria-label="Halaman landing"
          className="relative w-full"
          style={{
            height: "100dvh",
            scrollSnapAlign: "start",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Globe centered di tengah slide */}
          <CyberGlobeBg wifiName={ssid} />

          {/* Tombol scroll down dengan panah beranimasi */}
          <button
            onClick={scrollToSlide2}
            aria-label="Gulir ke dashboard"
            className="fixed left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 pointer-events-auto"
            style={{
              bottom: "6dvh",
              color: COLORS.inkSoft,
              "--tw-ring-color": COLORS.accent,
            } as React.CSSProperties}
          >
            <p className="text-[15px] font-sans mb-1" style={{ color: COLORS.inkSoft }}>
              Gulir ke bawah
            </p>
            <ChevronDown className="w-4 h-4 scroll-pill-icon" style={{ color: COLORS.inkSoft }} />
          </button>

          {/* Skip-link */}
          <a href="#slide2" className="skip-link">
            Lompat ke konten
          </a>
        </section>

        {/* SLIDE 2: Dashboard dengan Layout Baru */}
        <section
          id="slide2"
          ref={slide2Ref}
          className="s2 relative w-full"
          data-testid="slide2-section"
          aria-label="Dashboard jaringan"
          style={{
            height: "100dvh",
            scrollSnapAlign: "start",
            display: "flex",
            flexDirection: "column",
            backgroundColor: COLORS.bgPage,
            overflow: "hidden",
          }}
        >
          {/* Setup IntersectionObserver untuk animasi masuk setelah komponen mount */}
          {typeof window !== 'undefined' && (
            <>
              {/* Wadah konten slide 2 dengan max-width dan margin auto */}
              <div
                style={{
                  maxWidth: "1320px",
                  margin: "0 auto",
                  padding: INSET,
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* Bilah Status: Full width, SSID + IP + Metrik Ringkas */}
                <div
                  className="s2-card"
                  style={{
                    "--i": 0,
                  } as React.CSSProperties}
                  data-testid="status-bar"
                >
                  <div
                    style={{
                      width: "100%",
                      backgroundColor: COLORS.bgPanel,
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: "14px",
                      padding: "14px 18px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "200px",
                    }}
                  >
                    {/* Kiri: Icon WiFi + SSID + Status Pil + IP + Gateway */}
                    <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", minWidth: 0, flex: 1 }}>
                      {/* Icon WiFi Box */}
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          minWidth: "38px",
                          borderRadius: "10px",
                          backgroundColor: COLORS.bgSubtle,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Wifi size={20} strokeWidth={1.5} color={COLORS.inkSoft} aria-hidden="true" />
                      </div>

                      {/* SSID + Status Pil */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                          <span
                            style={{
                              fontSize: "16px",
                              fontWeight: "500",
                              color: COLORS.ink,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={ssid}
                          >
                            {ssid}
                          </span>
                          {/* Status Pil */}
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              fontSize: "11px",
                              fontWeight: "500",
                              padding: "4px 8px",
                              borderRadius: "12px",
                              backgroundColor:
                                ssid && ssid !== "Connection Error" && ssid !== "Initializing..."
                                  ? "rgba(74, 122, 87, 0.13)"
                                  : "rgba(165, 67, 43, 0.13)",
                              color:
                                ssid && ssid !== "Connection Error" && ssid !== "Initializing..."
                                  ? COLORS.statusOn
                                  : COLORS.statusOff,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                width: "5px",
                                height: "5px",
                                borderRadius: "50%",
                                backgroundColor:
                                  ssid && ssid !== "Connection Error" && ssid !== "Initializing..."
                                    ? COLORS.statusOn
                                    : COLORS.statusOff,
                                animation:
                                  ssid && ssid !== "Connection Error" && ssid !== "Initializing..."
                                    ? "pulse 2s ease-in-out infinite"
                                    : "none",
                              }}
                            />
                            {ssid && ssid !== "Connection Error" && ssid !== "Initializing..." ? "Terhubung" : "Tidak terhubung"}
                          </span>
                        </div>

                        {/* IP Server + Gateway — horizontal single line */}
                        <div
                          style={{
                            fontSize: "12px",
                            color: COLORS.inkSoft,
                            fontFamily: "ui-monospace, Consolas, monospace",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span>Server IP: {metrics.server_ip}</span>
                          <span style={{ margin: "0 4px", color: COLORS.inkSoft }}>|</span>
                          {(() => {
                            const gateway = devices.find(
                              (d) => d.category === "Router / AP" || d.category === "Router/AP"
                            );
                            return gateway ? <span>Gateway: {gateway.ip}</span> : null;
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Kanan: Empat Angka Ringkas (Online | Offline | Latensi Rata-rata | Peringatan Aktif) */}
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                        justifyContent: "flex-end",
                      }}
                    >
                      {/* Online */}
                      <div style={{ textAlign: "center", paddingRight: "12px", borderRight: `1px solid ${COLORS.line}` }}>
                        <div style={{ fontSize: "18px", fontWeight: "600", color: COLORS.statusOn }}>
                          {metrics.total_up}
                        </div>
                        <div style={{ fontSize: "10px", color: COLORS.inkSoft }}>Online</div>
                      </div>

                      {/* Offline */}
                      <div style={{ textAlign: "center", paddingRight: "12px", borderRight: `1px solid ${COLORS.line}` }}>
                        <div style={{ fontSize: "18px", fontWeight: "600", color: COLORS.statusOff }}>
                          {metrics.total_down}
                        </div>
                        <div style={{ fontSize: "10px", color: COLORS.inkSoft }}>Offline</div>
                      </div>

                      {/* Rata-rata Latensi (hanya jika ada) */}
                      {(() => {
                        const upDevices = devices.filter((d) => d.status === "UP" && d.latency !== undefined);
                        if (upDevices.length > 0) {
                          const avgLatency =
                            Math.round(upDevices.reduce((sum, d) => sum + (d.latency || 0), 0) / upDevices.length);
                          return (
                            <>
                              <div style={{ textAlign: "center", paddingRight: "12px", borderRight: `1px solid ${COLORS.line}` }}>
                                <div style={{ fontSize: "18px", fontWeight: "600", color: COLORS.ink }}>
                                  {avgLatency}
                                </div>
                                <div style={{ fontSize: "10px", color: COLORS.inkSoft }}>Rata-rata latensi</div>
                              </div>
                            </>
                          );
                        }
                        return null;
                      })()}

                      {/* Peringatan Aktif */}
                      <div style={{ textAlign: "center" }}>
                        <div
                          style={{
                            fontSize: "18px",
                            fontWeight: "600",
                            color: Math.max(0, alerts.length) > 0 ? COLORS.accent : COLORS.statusOn,
                          }}
                        >
                          {Math.max(0, alerts.length)}
                        </div>
                        <div style={{ fontSize: "10px", color: COLORS.inkSoft }}>Peringatan</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grid Utama: Kolom Kiri (Radar + Peringatan) + Kolom Kanan (Inspector) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(300px,360px) minmax(0,1fr)",
                    gap: "12px",
                    alignItems: "stretch",
                    width: "100%",
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  {/* Kolom Kiri: Radar + Peringatan */}
                  <div
                    className="slide2-left"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      minHeight: 0,
                      overflow: "hidden",
                      contain: "size",
                    }}
                  >
                    {/* Radar Kartu */}
                    <div
                      className="s2-card"
                      style={{
                        "--i": 1,
                      } as React.CSSProperties}
                      data-testid="radar-card"
                    >
                      <div
                        style={{
                          backgroundColor: COLORS.bgPanel,
                          border: `1px solid ${COLORS.line}`,
                          borderRadius: "14px",
                          padding: "14px 18px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                        }}
                      >
                        {/* Header Radar */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Radar size={16} strokeWidth={1.5} color={COLORS.inkSoft} aria-hidden="true" />
                          <h3 style={{ fontSize: "14px", fontWeight: "500", color: COLORS.ink }}>Radar</h3>
                        </div>

                        {/* Radar Canvas Mini */}
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <div style={{ width: "112px", height: "112px" }}>
                            <RadarCanvas />
                          </div>
                        </div>

                        {/* Legenda */}
                        <div style={{ display: "flex", gap: "16px", justifyContent: "center", fontSize: "11px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: COLORS.statusOn }} />
                            <span style={{ color: COLORS.inkSoft }}>Online</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: COLORS.statusOff }} />
                            <span style={{ color: COLORS.inkSoft }}>Offline</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Peringatan Kartu */}
                    <div
                      className="s2-card"
                      style={{
                        "--i": 2,
                        flex: 1,
                        minHeight: "200px",
                      } as React.CSSProperties}
                      data-testid="alerts-card"
                    >
                      <div
                        style={{
                          backgroundColor: COLORS.bgPanel,
                          border: `1px solid ${COLORS.line}`,
                          borderRadius: "14px",
                          padding: "14px 18px",
                          display: "flex",
                          flexDirection: "column",
                          height: "100%",
                        }}
                      >
                        {/* Header Peringatan */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <AlertTriangle size={16} strokeWidth={1.5} color={COLORS.accent} aria-hidden="true" />
                            <h3 style={{ fontSize: "14px", fontWeight: "500", color: COLORS.ink }}>Peringatan</h3>
                          </div>
                          {/* Tag Status */}
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "500",
                              padding: "4px 8px",
                              borderRadius: "12px",
                              backgroundColor: alerts.length > 0 ? "rgba(180, 83, 26, 0.13)" : "rgba(74, 122, 87, 0.13)",
                              color: alerts.length > 0 ? COLORS.accent : COLORS.statusOn,
                            }}
                          >
                            {alerts.length > 0 ? `${alerts.length} aktif` : "Normal"}
                          </span>
                        </div>

                        {/* Body Peringatan */}
                        <div
                          style={{
                            flex: 1,
                            minHeight: 0,
                            overflowY: "auto",
                            scrollbarWidth: "thin",
                            scrollbarColor: `${COLORS.line} transparent`,
                          }}
                        >
                          {alerts.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "24px 0", color: COLORS.inkSoft }}>
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  backgroundColor: "rgba(74, 122, 87, 0.13)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  margin: "0 auto 8px",
                                }}
                              >
                                <Check size={18} strokeWidth={2} color={COLORS.statusOn} aria-hidden="true" />
                              </div>
                              <div style={{ fontSize: "12px", fontWeight: "500" }}>Tidak ada peringatan aktif</div>
                              <div style={{ fontSize: "11px", marginTop: "4px" }}>Semua perangkat terpantau normal</div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              {alerts.slice(0, 5).map((alert: any) => (
                                <div
                                  key={alert.id}
                                  style={{
                                    padding: "8px 10px",
                                    borderRadius: "8px",
                                    backgroundColor:
                                      alert.severity === "critical"
                                        ? "rgba(165, 67, 43, 0.1)"
                                        : alert.severity === "warning"
                                          ? "rgba(180, 83, 26, 0.1)"
                                          : "rgba(107, 102, 92, 0.1)",
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: "8px",
                                    fontSize: "11px",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "inline-block",
                                      width: "4px",
                                      height: "4px",
                                      borderRadius: "50%",
                                      marginTop: "5px",
                                      flexShrink: 0,
                                      backgroundColor:
                                        alert.severity === "critical"
                                          ? COLORS.statusOff
                                          : alert.severity === "warning"
                                            ? COLORS.accent
                                            : COLORS.inkSoft,
                                    }}
                                  />
                                  <span style={{ color: COLORS.ink, flex: 1 }}>{alert.reason}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Kolom Kanan: Device Inspector */}
                  <div
                    className="s2-card"
                    style={{
                      "--i": 3,
                    } as React.CSSProperties}
                    data-testid="inspector-card"
                  >
                    <div
                      style={{
                        backgroundColor: COLORS.bgPanel,
                        border: `1px solid ${COLORS.line}`,
                        borderRadius: "14px",
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                        overflow: "hidden",
                        boxShadow: `0 10px 24px -18px rgba(31,29,26,.35)`,
                      }}
                    >
                      {/* Header Inspector */}
                      <div
                        style={{
                          padding: "16px 18px 14px",
                          borderBottom: `1px solid ${COLORS.line}`,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <div>
                          <h2 style={{ fontSize: "15px", fontWeight: "500", color: COLORS.ink }}>
                            Inspektur perangkat ({subnetPrefix})
                          </h2>
                          <div style={{ fontSize: "12px", color: COLORS.inkSoft, marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ display: "inline-block", width: "4px", height: "4px", borderRadius: "50%", backgroundColor: COLORS.statusOn, animation: "pulse 2s ease-in-out infinite" }} />
                            Pemindai ARP aktif
                          </div>
                        </div>

                        {/* Kanan: Pencarian + Filter */}
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type="text"
                            placeholder="Cari IP, MAC, atau nama"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            ref={searchInputRef}
                            style={{
                              width: "170px",
                              padding: "6px 10px",
                              fontSize: "12px",
                              border: `1px solid ${COLORS.line}`,
                              borderRadius: "6px",
                              backgroundColor: COLORS.bgPage,
                              color: COLORS.ink,
                            }}
                          />
                          {/* Status Filter Chips */}
                          <div style={{ display: "flex", gap: "4px" }}>
                            {["all", "up", "down"].map((status) => (
                              <button
                                key={status}
                                onClick={() => setStatusFilter(status as "all" | "up" | "down")}
                                aria-pressed={statusFilter === status}
                                style={{
                                  padding: "4px 10px",
                                  fontSize: "11px",
                                  borderRadius: "12px",
                                  border: `1px solid ${statusFilter === status ? COLORS.accent : COLORS.line}`,
                                  backgroundColor:
                                    statusFilter === status
                                      ? "rgba(180, 83, 26, 0.1)"
                                      : "transparent",
                                  color: statusFilter === status ? COLORS.accent : COLORS.inkSoft,
                                  cursor: "pointer",
                                  fontWeight: statusFilter === status ? "500" : "400",
                                }}
                              >
                                {status === "all" ? "Semua" : status === "up" ? "Online" : "Offline"}
                                {status !== "all" && (
                                  <span style={{ marginLeft: "4px", fontSize: "10px" }}>
                                    ({status === "up" ? metrics.total_up : metrics.total_down})
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Tabel Area */}
                      <div
                        className="inspector-table-area"
                        style={{
                          maxHeight: `calc(var(--head-h) + var(--visible-rows) * var(--row-h))`,
                        }}
                      >
                        {loading ? (
                          <div className="text-center py-10 font-sans" style={{ color: COLORS.inkSoft }}>
                            Menghubungkan ke pemindai...
                          </div>
                        ) : validDevices.length === 0 ? (
                          <div className="text-center py-10 font-sans" style={{ color: COLORS.inkSoft }}>
                            Tidak ada perangkat yang ditemukan.
                          </div>
                        ) : (
                          <table
                            className="w-full text-left"
                            style={{
                              width: "100%",
                              tableLayout: "auto",
                              fontSize: "11px",
                            }}
                            aria-label="Hasil pemindaian perangkat jaringan"
                          >
                            <caption className="sr-only">
                              Hasil pemindaian perangkat jaringan — {validDevices.length} perangkat terdeteksi
                            </caption>
                            <thead>
                              <tr
                                style={{
                                  backgroundColor: COLORS.bgSubtle,
                                  color: COLORS.inkSoft,
                                  height: `var(--head-h)`,
                                  fontSize: "11px",
                                  fontWeight: "500",
                                  fontFamily: "var(--font-geist-sans, sans-serif)",
                                }}
                              >
                                <th
                                  className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)] px-2.5 py-3"
                                  onClick={() => handleSort("ip")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Alamat IP {sortConfig.key === "ip" && <SortIndicator columnKey="ip" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)] px-2.5 py-3"
                                  onClick={() => handleSort("mac")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  MAC {sortConfig.key === "mac" && <SortIndicator columnKey="mac" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)] px-2.5 py-3"
                                  onClick={() => handleSort("hostname")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Nama {sortConfig.key === "hostname" && <SortIndicator columnKey="hostname" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)] px-2.5 py-3"
                                  onClick={() => handleSort("category")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Kategori {sortConfig.key === "category" && <SortIndicator columnKey="category" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)] px-2.5 py-3"
                                  onClick={() => handleSort("vendor")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Vendor {sortConfig.key === "vendor" && <SortIndicator columnKey="vendor" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)] px-2.5 py-3"
                                  onClick={() => handleSort("latency")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Latensi {sortConfig.key === "latency" && <SortIndicator columnKey="latency" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)] px-2.5 py-3"
                                  onClick={() => handleSort("status")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Status {sortConfig.key === "status" && <SortIndicator columnKey="status" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)] px-2.5 py-3 text-right"
                                  onClick={() => handleSort("last_seen")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Terakhir dilihat {sortConfig.key === "last_seen" && <SortIndicator columnKey="last_seen" sortConfig={sortConfig} />}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedDevices.map((dev, idx) => (
                                <tr
                                  key={dev.mac || idx}
                                  style={{
                                    height: `var(--row-h)`,
                                    backgroundColor: COLORS.bgSubtle,
                                  }}
                                  onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor = COLORS.rowHover;
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor = COLORS.bgSubtle;
                                  }}
                                >
                                  <td className="px-2.5 py-2 text-[11px] font-mono font-medium text-[var(--ink)]">
                                    {dev.ip || "-"}
                                  </td>
                                  <td className="px-2.5 py-2 text-[11px] text-[var(--ink-soft)] font-mono">
                                    {dev.mac}
                                  </td>
                                  <td className="px-2.5 py-2 text-[11px] text-[var(--ink)]">{dev.hostname || "Unknown"}</td>
                                  <td className="px-2.5 py-2 text-[11px] text-[var(--ink-soft)]">{dev.category || "Unknown"}</td>
                                  <td className="px-2.5 py-2 text-[11px] text-[var(--ink-soft)]">{dev.vendor || "Unknown"}</td>
                                  <td
                                    className="px-2.5 py-2 text-[11px] font-mono text-[var(--ink)]"
                                  >
                                    {dev.latency !== undefined ? `${dev.latency}ms` : "-"}
                                  </td>
                                  <td className="px-2.5 py-2 text-[11px]">
                                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                      <span
                                        style={{
                                          display: "inline-block",
                                          width: "6px",
                                          height: "6px",
                                          borderRadius: "50%",
                                          backgroundColor: dev.status === "UP" ? COLORS.statusOn : COLORS.statusOff,
                                        }}
                                      />
                                      <span style={{ color: dev.status === "UP" ? COLORS.ink : COLORS.inkSoft }}>
                                        {dev.status === "UP" ? "Online" : "Offline"}
                                      </span>
                                    </div>
                                  </td>
                                  <td
                                    className="px-2.5 py-2 text-[11px] text-[var(--ink-soft)] text-right font-mono"
                                    title={new Date(dev.last_seen).toLocaleString()}
                                  >
                                    {new Date(dev.last_seen).toLocaleTimeString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Penanda halaman: dua titik di tepi kanan */}
      <div
        className="fixed top-1/2 -translate-y-1/2 right-6 z-40 flex items-center pointer-events-none"
        aria-hidden="true"
      >
        <div className="flex flex-col items-center gap-3">
          {/* Dot slide 1 */}
          <button
            onClick={() => scrollToSlide(0)}
            className="w-2 h-2 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 pointer-events-auto"
            style={{
              backgroundColor: activeSlide === 0 ? COLORS.accent : COLORS.inkFaint,
              "--tw-ring-color": COLORS.accent,
            } as React.CSSProperties}
            aria-label="Gulir ke slide 1"
          />
          {/* Dot slide 2 */}
          <button
            onClick={() => scrollToSlide(1)}
            className="w-2 h-2 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 pointer-events-auto"
            style={{
              backgroundColor: activeSlide === 1 ? COLORS.accent : COLORS.inkFaint,
              "--tw-ring-color": COLORS.accent,
            } as React.CSSProperties}
            aria-label="Gulir ke slide 2"
          />
        </div>
      </div>
    </>
  );
}
