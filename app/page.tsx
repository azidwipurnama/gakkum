"use client";

import React, { useRef, useEffect, useState } from "react";
import { ChevronDown, Wifi, Bell, Trash2, X, Activity } from "lucide-react";
import CyberGlobeBg from "@/components/CyberGlobeBg";
import MonitoringPanel from "@/components/MonitoringPanel";
import { useNetwork } from "@/contexts/NetworkContext";
import type { Device, DeviceNetworkDetails } from "@/types/network";
import { useNetworkEvents, type NotifEvent } from "@/hooks/useNetworkEvents";
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

// Backend FastAPI — harus sama dengan WS_URL di hooks/useWebSocket.ts.
const API_BASE = "http://localhost:8000";
const API_KEY = "GAKKUM_SECRET_KEY";

// Label arah koneksi untuk popup detail jaringan.
const DIRECTION_LABEL: Record<string, string> = {
  outbound: "Keluar",
  inbound: "Masuk",
  listening: "Mendengarkan",
};

// Gaya bersama untuk isi popup detail jaringan.
const SECTION_TITLE: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: COLORS.inkSoft,
};

const CHIP: React.CSSProperties = {
  fontSize: "11px",
  fontFamily: "monospace",
  padding: "3px 8px",
  borderRadius: "6px",
  border: `1px solid ${COLORS.line}`,
  backgroundColor: COLORS.bgSubtle,
  color: COLORS.ink,
};

const TH: React.CSSProperties = {
  padding: "6px 8px",
  fontWeight: 500,
  whiteSpace: "nowrap",
  borderBottom: `1px solid ${COLORS.line}`,
};

const TD: React.CSSProperties = {
  padding: "5px 8px",
  color: COLORS.ink,
  whiteSpace: "nowrap",
};

// Jumlah item yang masih memakai animasi masuk berurutan.
// Antrean lebih panjang dari ini dirender langsung tanpa animasi.
const ANIMATION_MAX_QUEUE = 20;

// Satu baris notifikasi. Dibungkus React.memo supaya daftar panjang tidak
// dirender ulang seluruhnya setiap kali ada notifikasi baru masuk.
const NotificationRow = React.memo(function NotificationRow({
  event: n,
  index,
  animate,
}: {
  event: NotifEvent;
  index: number;
  animate: boolean;
}) {
  return (
    <div
      title={n.detail ? `${n.title} - ${n.detail}` : n.title}
      style={{
        display: "block",
        height: "var(--notif-row-h)",
        minHeight: "var(--notif-row-h)",
        maxHeight: "var(--notif-row-h)",
        flex: "none",
        boxSizing: "border-box",
        padding: "8px 10px",
        backgroundColor: COLORS.bgSubtle,
        borderBottom: `1px solid ${COLORS.line}`,
        animation: animate ? `slideDownIn 0.2s ease-out forwards` : "none",
        animationDelay: animate ? `${Math.min(index * 60, ANIMATION_MAX_QUEUE * 60)}ms` : undefined,
        overflow: "hidden",
      }}
    >
      {/* Baris isi: flex horizontal internal, tidak berbagi tinggi dengan item lain */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", height: "100%", minWidth: 0 }}>
        {/* Dot */}
        <span
          style={{
            width: n.type === 'arp_ok' ? "6px" : "8px",
            height: n.type === 'arp_ok' ? "6px" : "8px",
            borderRadius: "50%",
            backgroundColor:
              n.dotColor === 'on' ? COLORS.statusOn :
              n.dotColor === 'off' ? COLORS.statusOff :
              n.dotColor === 'warn' ? COLORS.accent : COLORS.inkSoft,
            flexShrink: 0,
          }}
        />
        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{
            fontSize: "13px",
            fontWeight: n.type === 'arp_ok' ? 400 : 500,
            lineHeight: "18px",
            color: COLORS.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}>
            {n.title}
          </div>
          {n.detail && (
            <div style={{
              fontSize: "12px",
              lineHeight: "16px",
              color: COLORS.inkSoft,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}>
              {n.detail}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

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


export default function DashboardPage() {
  const { devices, metrics, ssid, alerts, loading, isWsConnected, hasReceivedData, arpRepliesBatch } = useNetwork();
  const { notifications, clearEvents } = useNetworkEvents(devices, isWsConnected, hasReceivedData, arpRepliesBatch);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "ip", direction: "asc" });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "up" | "down">("all");
  // Panel pemantauan (snapshot + diff vs baseline) — dibuka dari bilah status.
  const [monitoringOpen, setMonitoringOpen] = useState(false);

  // Ref untuk slide 2 (untuk IntersectionObserver)
  const slide2Ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [motionReady, setMotionReady] = useState(false);

  // Track viewport width for responsive containment and sizing
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 980 : false
  );

  // Cleanup localStorage keys from old "Peringatan" card implementation.
  // The old alerts-card component stored its own data under a separate key.
  // This effect removes any leftover keys that are no longer used by the
  // notification system. Safe to delete this effect once no legacy data remains.
  useEffect(() => {
    try {
      // Check for and remove any legacy localStorage keys related to the old
      // "Peringatan" card. The current notification system only uses:
      // - "gakkum:notifications" (importantNotifications)
      // - "gakkum:baseline" (sessionStorage, one-shot session flag)
      const legacyKeys = ["gakkum:alerts", "gakkum:alertNotifications"];
      legacyKeys.forEach((key) => {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      // localStorage not available (SSR) or quota exceeded â€” ignore
    }
  }, []);

  // IntersectionObserver untuk mendeteksi slide 2 masuk viewport dan trigger card animations
  useEffect(() => {
    if (!slide2Ref.current) return;

    // Set data-motion="ready" setelah observer dibuat
    setMotionReady(true);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === slide2Ref.current) {
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

  // Loading timeout: 10 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!isLoaded && !hasReceivedData) {
      timer = setTimeout(() => {
        if (!hasReceivedData) {
          setLoadError("Gagal memuat data jaringan. Silakan coba lagi.");
        }
      }, 10000);
    }
    return () => clearTimeout(timer);
  }, [isLoaded, hasReceivedData]);

  // Update isNarrow on resize
  useEffect(() => {
    const handleResize = () => setIsNarrow(window.innerWidth < 980);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const scrollToSlide2 = () => {
    slide2Ref.current?.scrollIntoView({ behavior: "smooth" });
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

  // Popup detail jaringan per perangkat (IPv4/IPv6, protokol, koneksi).
  // Data diambil dari GET /api/device/{mac}/network saat baris diklik.
  const [netDetail, setNetDetail] = useState<{
    device: Device;
    data: DeviceNetworkDetails | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const openNetworkDetail = async (dev: Device) => {
    setNetDetail({ device: dev, data: null, loading: true, error: null });
    try {
      const res = await fetch(
        `${API_BASE}/api/device/${encodeURIComponent(dev.mac)}/network?api_key=${API_KEY}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DeviceNetworkDetails = await res.json();
      // Abaikan respons yang datang setelah user sudah membuka perangkat lain.
      setNetDetail((prev) =>
        prev && prev.device.mac === dev.mac ? { ...prev, data, loading: false } : prev
      );
    } catch (err) {
      setNetDetail((prev) =>
        prev && prev.device.mac === dev.mac
          ? {
              ...prev,
              loading: false,
              error: err instanceof Error ? err.message : "Gagal memuat data",
            }
          : prev
      );
    }
  };

  // Tutup popup dengan tombol Escape.
  useEffect(() => {
    if (!netDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNetDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [netDetail]);

  const subnetPrefix = metrics?.server_ip || "Localhost";

  return (
    <>
      {!isLoaded && (
        <>
          <LoadingUI onFinished={() => setIsLoaded(true)} />
          {loadError && (
            <div
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 100,
                backgroundColor: COLORS.bgPanel,
                border: `1px solid ${COLORS.line}`,
                padding: "24px",
                borderRadius: "12px",
                textAlign: "center",
                boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                maxWidth: "320px",
              }}
            >
              <p style={{ fontSize: "14px", color: COLORS.ink, marginBottom: "16px" }}>{loadError}</p>
              <button
                onClick={() => {
                  setLoadError(null);
                  window.location.reload();
                }}
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: "500",
                  backgroundColor: COLORS.accent,
                  color: "#FFF",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Coba Lagi
              </button>
            </div>
          )}
        </>
      )}

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

          {/* Tombol scroll down — hanya muncul setelah loading selesai */}
          {isLoaded && (
            <button
              onClick={scrollToSlide2}
              aria-label="Gulir ke dashboard"
              className="absolute right-8 bottom-10 z-30 flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 pointer-events-auto"
              style={{
                color: COLORS.inkSoft,
                "--tw-ring-color": COLORS.accent,
              } as React.CSSProperties}
            >
              <p className="text-[13px] font-sans" style={{ color: COLORS.inkSoft }}>
                Gulir ke bawah
              </p>
              <ChevronDown className="w-3.5 h-3.5 scroll-pill-icon" style={{ color: COLORS.inkSoft }} />
            </button>
          )}

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
                      padding: "14px 18px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "24px",
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

                        {/* IP Server + Gateway â€” horizontal single line */}
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

                      {/* Total Perangkat = Online + Offline */}
                      <div style={{ textAlign: "center", paddingRight: "12px", borderRight: `1px solid ${COLORS.line}` }}>
                        <div style={{ fontSize: "18px", fontWeight: "600", color: COLORS.ink }}>
                          {metrics.total_up + metrics.total_down}
                        </div>
                        <div style={{ fontSize: "10px", color: COLORS.inkSoft }}>Total Perangkat</div>
                      </div>

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

                      {/* Tombol panel pemantauan */}
                      <button
                        onClick={() => setMonitoringOpen(true)}
                        aria-label="Buka panel pemantauan jaringan"
                        title="Pemantauan jaringan: snapshot, perangkat baru/hilang, lonjakan trafik"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          marginLeft: "4px",
                          padding: "7px 11px",
                          borderRadius: "8px",
                          border: `1px solid ${COLORS.line}`,
                          backgroundColor: COLORS.bgSubtle,
                          color: COLORS.ink,
                          fontSize: "11px",
                          fontWeight: 500,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = COLORS.accent;
                          e.currentTarget.style.color = COLORS.accent;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = COLORS.line;
                          e.currentTarget.style.color = COLORS.ink;
                        }}
                      >
                        <Activity size={14} strokeWidth={1.7} aria-hidden="true" />
                        Pemantauan
                      </button>
                    </div>
                  </div>
                </div>

                {/* Grid Utama: Kolom Kiri (Radar + Peringatan) + Kolom Kanan (Inspector) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(320px,390px) minmax(0,1fr)",
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
                      contain: isNarrow ? "none" : "size",
                    }}
                  >
                    {/* Radar Kartu */}
                    <div
                      className="s2-card"
                      style={{
                        "--i": 1,
                        flex: 1,
                        minHeight: "220px",
                      } as React.CSSProperties}
                      data-testid="radar-card"
                    >
                      <div
                        style={{
                          backgroundColor: COLORS.bgPanel,
                          border: `1px solid ${COLORS.line}`,
                          padding: "14px 18px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          height: "100%",
                          overflow: "hidden",
                          boxSizing: "border-box",
                        }}
                      >
                        {/* Logo Setdit (menggantikan header + area radar + legend) */}
                        <div
                          style={{
                            flex: 1,
                            minHeight: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "20px",
                            boxSizing: "border-box",
                          }}
                        >
                          <img
                            src="/setdit.svg"
                            alt="Denah area kerja dengan lima access point"
                            draggable={false}
                            onError={(e) => {
                              const parent = (e.currentTarget as HTMLImageElement).parentElement;
                              if (parent && !parent.querySelector('.setdit-fallback')) {
                                const fb = document.createElement('span');
                                fb.className = 'setdit-fallback';
                                fb.textContent = 'Logo tidak dapat dimuat';
                                fb.style.cssText = 'font-size:12px;color:' + (COLORS.inkSoft || '#94a3b8') + ';text-align:center;';
                                parent.innerHTML = '';
                                parent.appendChild(fb);
                              }
                            }}
                            style={{
                              display: 'block',
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              userSelect: 'none',
                              pointerEvents: 'none',
                              aspectRatio: '465 / 655',
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Notifikasi Kartu */}
                    <div
                      className="s2-card"
                      style={{
                        "--i": 2,
                        flex: "none",
                        display: "flex",
                        flexDirection: "column",
                      } as React.CSSProperties}
                      data-testid="notifications-card"
                    >
                      <div
                        style={{
                          backgroundColor: COLORS.bgPanel,
                          border: `1px solid ${COLORS.line}`,
                          padding: "14px 18px",
                          display: "flex",
                          flexDirection: "column",
                          height: "100%",
                        }}
                      >
                        {/* Header */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                          <h3 style={{ fontSize: "14px", fontWeight: "500", color: COLORS.ink, display: "flex", alignItems: "center", gap: "8px" }}>
                            <Bell size={16} strokeWidth={1.5} color={COLORS.inkSoft} aria-hidden="true" />
                            Notifikasi
                          </h3>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 6px", borderRadius: "120px", backgroundColor: isWsConnected ? "rgba(74, 122, 87, 0.1)" : "rgba(165, 67, 43, 0.1)", border: `1px solid ${isWsConnected ? COLORS.statusOn : COLORS.statusOff}` }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: isWsConnected ? COLORS.statusOn : COLORS.statusOff, animation: isWsConnected ? "pulse 2s ease-in-out infinite" : "none" }} />
                              <span style={{ fontSize: "10px", fontWeight: "500", color: isWsConnected ? COLORS.statusOn : COLORS.statusOff }}>
                                {isWsConnected ? "Langsung" : "Terputus"}
                              </span>
                            </div>
                            <button
                              onClick={clearEvents}
                              disabled={notifications.length === 0}
                              aria-label="Bersihkan notifikasi"
                              style={{
                                padding: "4px",
                                borderRadius: "6px",
                                border: "none",
                                backgroundColor: "transparent",
                                cursor: notifications.length === 0 ? "not-allowed" : "pointer",
                                color: notifications.length === 0 ? COLORS.inkFaint : COLORS.inkSoft,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "color 0.2s",
                              }}
                              onMouseEnter={(e) => { if (notifications.length > 0) e.currentTarget.style.color = COLORS.accent }}
                              onMouseLeave={(e) => { if (notifications.length > 0) e.currentTarget.style.color = COLORS.inkSoft }}
                            >
                              <Trash2 size={16} strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>

                        {/* SR-only Announcer for Important Events */}
                        <div className="sr-only" aria-live="polite">
                          {notifications.filter(n => n.type !== 'arp_ok').slice(0, 1).map(n => n.title)}
                        </div>

                        {/* List: aria-live="off" — block flow, tinggi tetap, scroll vertikal */}
                        <div
                          aria-live="off"
                          style={{
                            display: "block",
                            height: `calc(var(--visible-notifs) * var(--notif-row-h))`,
                            overflowY: "auto",
                            overflowX: "hidden",
                            scrollbarWidth: "thin",
                            scrollbarColor: "var(--line) transparent",
                            scrollbarGutter: "stable",
                            paddingRight: "4px",
                          }}
                        >
                          {notifications.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "20px 0", color: COLORS.inkSoft, fontSize: "12px" }}>
                              Tidak ada notifikasi
                            </div>
                          ) : (
                            notifications.map((n, index) => (
                              <NotificationRow
                                key={n.id}
                                event={n}
                                index={index}
                                animate={notifications.length <= ANIMATION_MAX_QUEUE}
                              />
                            ))
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
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        boxShadow: `0 10px 24px -18px rgba(31,29,26,.35)`,
                      }}
                    >
                      {/* Header Inspector */}
                      <div
                        style={{
                          padding: "16px var(--card-px) 14px",
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
                          height: `calc(var(--head-h) + var(--visible-rows) * var(--row-h))`,
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
                            className="w-full text-center"
                            style={{
                              width: "100%",
                              tableLayout: "auto",
                              fontSize: "11px",
                            }}
                            aria-label="Hasil pemindaian perangkat jaringan"
                          >
                            <caption className="sr-only">
                              Hasil pemindaian perangkat jaringan â€” {validDevices.length} perangkat terdeteksi
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
                                  className="whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)]"
                                  onClick={() => handleSort("ip")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Alamat IP {sortConfig.key === "ip" && <SortIndicator columnKey="ip" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)]"
                                  onClick={() => handleSort("mac")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  MAC {sortConfig.key === "mac" && <SortIndicator columnKey="mac" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)]"
                                  onClick={() => handleSort("hostname")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Nama {sortConfig.key === "hostname" && <SortIndicator columnKey="hostname" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)]"
                                  onClick={() => handleSort("category")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Kategori {sortConfig.key === "category" && <SortIndicator columnKey="category" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)]"
                                  onClick={() => handleSort("vendor")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Vendor {sortConfig.key === "vendor" && <SortIndicator columnKey="vendor" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)]"
                                  onClick={() => handleSort("latency")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Latensi {sortConfig.key === "latency" && <SortIndicator columnKey="latency" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)]"
                                  onClick={() => handleSort("status")}
                                  style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                                >
                                  Status {sortConfig.key === "status" && <SortIndicator columnKey="status" sortConfig={sortConfig} />}
                                </th>
                                <th
                                  className="cursor-pointer whitespace-nowrap text-[11px] font-medium text-[var(--ink-soft)] text-right"
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
                                    backgroundColor: "transparent",
                                    cursor: "pointer",
                                  }}
                                  title="Klik untuk detail IPv4/IPv6, protokol, dan koneksi"
                                  tabIndex={0}
                                  onClick={() => openNetworkDetail(dev)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") openNetworkDetail(dev);
                                  }}
                                  onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor = COLORS.rowHover;
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                                  }}
                                >
                                  <td className="py-1 text-[11px] font-mono font-medium text-[var(--ink)]">
                                    {dev.ip || "-"}
                                  </td>
                                  <td className="py-1 text-[11px] text-[var(--ink-soft)] font-mono">
                                    {dev.mac}
                                  </td>
                                  <td className="py-1 text-[11px] text-[var(--ink)]">
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                                      {dev.hostname || "Unknown"}
                                      {dev.is_self && (
                                        <span
                                          style={{
                                            fontSize: "11px",
                                            padding: "2px 6px",
                                            borderRadius: "12px",
                                            backgroundColor: COLORS.bgSubtle,
                                            color: COLORS.inkSoft,
                                            border: `1px solid ${COLORS.line}`,
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          Perangkat ini
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-1 text-[11px] text-[var(--ink-soft)]">{dev.category || "Unknown"}</td>
                                  <td className="py-1 text-[11px] text-[var(--ink-soft)]">{dev.vendor || "Unknown"}</td>
                                  <td
                                    className="py-1 text-[11px] font-mono text-[var(--ink)]"
                                  >
                                    {dev.latency !== undefined ? `${dev.latency}ms` : "-"}
                                  </td>
                                  <td className="py-1 text-[11px]">
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
                                    className="py-1 text-[11px] text-[var(--ink-soft)] text-right font-mono"
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

      {/* Popup detail jaringan: diklik dari baris tabel inspektur */}
      {netDetail && (
        <div
          onClick={() => setNetDetail(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            backgroundColor: "rgba(31, 29, 26, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Detail jaringan ${netDetail.device.hostname || netDetail.device.ip}`}
            style={{
              width: "min(700px, 100%)",
              maxHeight: "85vh",
              overflowY: "auto",
              backgroundColor: COLORS.bgPanel,
              border: `1px solid ${COLORS.line}`,
              borderRadius: "12px",
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
            }}
          >
            {/* Header popup */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
                padding: "16px 18px",
                borderBottom: `1px solid ${COLORS.line}`,
                position: "sticky",
                top: 0,
                backgroundColor: COLORS.bgPanel,
                zIndex: 1,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "15px", fontWeight: 500, color: COLORS.ink }}>
                  {netDetail.device.hostname || "Unknown"}
                  <span style={{ color: COLORS.inkSoft, fontWeight: 400 }}> · {netDetail.device.ip}</span>
                </div>
                <div style={{ fontSize: "12px", color: COLORS.inkSoft, fontFamily: "monospace", marginTop: "2px" }}>
                  {netDetail.device.mac}
                </div>
              </div>
              <button
                onClick={() => setNetDetail(null)}
                aria-label="Tutup"
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "28px",
                  height: "28px",
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: "6px",
                  backgroundColor: COLORS.bgSubtle,
                  color: COLORS.inkSoft,
                  cursor: "pointer",
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Isi popup */}
            <div style={{ padding: "14px 18px" }}>
              {netDetail.loading && (
                <div style={{ textAlign: "center", padding: "24px 0", fontSize: "13px", color: COLORS.inkSoft }}>
                  Memuat detail jaringan...
                </div>
              )}

              {netDetail.error && (
                <div style={{ textAlign: "center", padding: "24px 0", fontSize: "13px", color: COLORS.statusOff }}>
                  Gagal memuat data: {netDetail.error}
                </div>
              )}

              {netDetail.data && !netDetail.loading && (
                <>
                  {/* Alamat IPv4 */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={SECTION_TITLE}>Alamat IPv4</div>
                    {netDetail.data.ipv4.length === 0 ? (
                      <div style={{ fontSize: "12px", color: COLORS.inkFaint, marginTop: "6px" }}>
                        Belum ada data (jendela pantau {netDetail.data.window_seconds} detik)
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                        {netDetail.data.ipv4.map((item) => (
                          <span
                            key={item.address}
                            title={`Terakhir terlihat: ${new Date(item.last_seen).toLocaleString()}`}
                            style={CHIP}
                          >
                            {item.address}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Alamat IPv6 */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={SECTION_TITLE}>Alamat IPv6</div>
                    {netDetail.data.ipv6.length === 0 ? (
                      <div style={{ fontSize: "12px", color: COLORS.inkFaint, marginTop: "6px" }}>
                        Belum ada data (jendela pantau {netDetail.data.window_seconds} detik)
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                        {netDetail.data.ipv6.map((item) => (
                          <span
                            key={item.address}
                            title={`Terakhir terlihat: ${new Date(item.last_seen).toLocaleString()}`}
                            style={CHIP}
                          >
                            {item.address}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Protokol terdeteksi (TCP/UDP/ICMP/IPv6/...) */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={SECTION_TITLE}>Protokol terdeteksi</div>
                    {netDetail.data.protocols.length === 0 ? (
                      <div style={{ fontSize: "12px", color: COLORS.inkFaint, marginTop: "6px" }}>
                        Belum ada paket tercatat
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                        {netDetail.data.protocols.map((item) => (
                          <span
                            key={item.name}
                            title={`Terakhir: ${new Date(item.last_seen).toLocaleString()}`}
                            style={{
                              ...CHIP,
                              color: COLORS.accent,
                              fontWeight: 600,
                              backgroundColor: "rgba(180, 83, 26, 0.08)",
                              borderColor: "rgba(180, 83, 26, 0.3)",
                            }}
                          >
                            {item.name}
                            <span style={{ color: COLORS.inkSoft, fontWeight: 400 }}> · {item.packets} paket</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Koneksi (port & endpoint remote) */}
                  <div>
                    <div style={SECTION_TITLE}>Koneksi</div>
                    {netDetail.data.connections.length === 0 ? (
                      <div style={{ fontSize: "12px", color: COLORS.inkFaint, marginTop: "6px" }}>
                        Belum ada koneksi tercatat
                      </div>
                    ) : (
                      <div style={{ overflowX: "auto", marginTop: "6px" }}>
                        <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                          <thead>
                            <tr
                              style={{
                                backgroundColor: COLORS.bgSubtle,
                                color: COLORS.inkSoft,
                                textAlign: "left",
                              }}
                            >
                              <th style={TH}>Arah</th>
                              <th style={TH}>Protokol</th>
                              <th style={TH}>Port lokal</th>
                              <th style={TH}>Endpoint remote</th>
                              <th style={TH}>Paket</th>
                              <th style={TH}>Terakhir</th>
                            </tr>
                          </thead>
                          <tbody>
                            {netDetail.data.connections.map((c, i) => (
                              <tr key={`${c.protocol}-${c.direction}-${c.local_port}-${c.remote_address}-${c.remote_port}-${i}`} style={{ borderBottom: `1px solid ${COLORS.line}` }}>
                                <td style={TD}>{DIRECTION_LABEL[c.direction] || c.direction}</td>
                                <td style={{ ...TD, color: COLORS.accent, fontWeight: 600 }}>{c.protocol}</td>
                                <td style={{ ...TD, fontFamily: "monospace" }}>{c.local_port ?? "-"}</td>
                                <td style={{ ...TD, fontFamily: "monospace" }}>
                                  {c.remote_address}
                                  {c.remote_port != null ? `:${c.remote_port}` : ""}
                                </td>
                                <td style={TD}>{c.packets}</td>
                                <td style={TD}>{new Date(c.last_seen).toLocaleTimeString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Meta: sumber data */}
                  <div style={{ fontSize: "11px", color: COLORS.inkFaint, marginTop: "14px" }}>
                    Sumber: {netDetail.data.source} · jendela pantau {netDetail.data.window_seconds}s ·
                    diambil {new Date(netDetail.data.captured_at).toLocaleString()}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <MonitoringPanel open={monitoringOpen} onClose={() => setMonitoringOpen(false)} />

    </>
  );
}
