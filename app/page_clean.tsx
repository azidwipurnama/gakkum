"use client";

import React, { useRef, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import CyberGlobeBg from "@/components/CyberGlobeBg";
import AlertsPanel from "@/components/AlertsPanel";
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

// Komponen canvas radar
function RadarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;

    let angle = 0;
    let animId: number;
    const size = 100;
    cv.width = size;
    cv.height = size;
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
      role="img"
      aria-label="Visualisasi radar"
    />
  );
}

export default function DashboardPage() {
  const { devices, metrics, ssid, loading } = useNetwork();
  const [isLoaded, setIsLoaded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "ip", direction: "asc" });

  // Ref untuk scroll ke slide 2
  const slide2Ref = useRef<HTMLDivElement>(null);

  // Ref untuk page indicator dots
  const dotsContainerRef = useRef<HTMLDivElement>(null);

  // State untuk tracking slide visible di viewport (untuk animasi kartu dan kontrol globe)
  const [activeSlide, setActiveSlide] = useState(0);

  // IntersectionObserver untuk mendeteksi slide 2 masuk viewport dan trigger card animations
  useEffect(() => {
    if (!slide2Ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === slide2Ref.current) {
            setActiveSlide(entry.isIntersecting ? 1 : 0);

            // Trigger card animations ketika slide 2 masuk viewport
            if (entry.isIntersecting) {
              const cards = [
                slide2Ref.current?.querySelector('[data-testid="server-conn-card"]'),
                slide2Ref.current?.querySelector('[data-testid="radar-card"]'),
                slide2Ref.current?.querySelector('[data-testid="alerts-card"]'),
                slide2Ref.current?.querySelector('[data-testid="inspector-card"]'),
              ];

              cards.forEach((card, index) => {
                if (card instanceof HTMLElement) {
                  card.style.animation = 'none';
                  setTimeout(() => {
                    card.style.animation = `cardEntry 600ms cubic-bezier(.22,.8,.2,1) forwards`;
                    card.style.animationDelay = `${index * 80}ms`;
                  }, 10);
                }
              });
            } else {
              // Reset animasi ketika keluar viewport
              const cards = slide2Ref.current?.querySelectorAll('[data-card-animated]');
              cards?.forEach((card) => {
                if (card instanceof HTMLElement) {
                  card.style.animation = 'none';
                }
              });
            }
          }
        });
      },
      { threshold: 0.35 }
    );

    observer.observe(slide2Ref.current);
    return () => observer.disconnect();
  }, []);

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
  const sortedDevices = [...validDevices].sort((a, b) => {
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

        {/* SLIDE 2: Dashboard dengan Grid Kartu */}
        <section
          id="slide2"
          ref={slide2Ref}
          aria-label="Dashboard jaringan"
          className="relative w-full"
          style={{
            height: "100dvh",
            scrollSnapAlign: "start",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            className="h-full"
            style={{
              padding: INSET,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0,1fr))",
              gridTemplateRows: "auto 1fr",
              gap: "12px",
            }}
          >
            {/* Baris 1: Kartu Server Connection, Radar, Alerts */}
            {/* Kolom 1: Server Connection */}
            <div
              data-testid="server-conn-card"
              data-card-animated="true"
              className="border rounded-[14px] p-[14px_16px] pointer-events-auto"
              style={{
                backgroundColor: COLORS.bgPanel,
                borderColor: COLORS.line,
                minHeight: "clamp(220px, 30dvh, 300px)",
                opacity: 0,
                transform: "translateY(24px)",
              }}
            >
              <h2 className="text-[13px] font-sans font-medium mb-3" style={{ color: COLORS.inkSoft }}>
                Server connection
              </h2>
              <div className="space-y-2 font-mono text-xs">
                <p className="flex justify-between">
                  <span style={{ color: COLORS.inkSoft }}>IP:</span>
                  <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontVariantNumeric: "tabular-nums", color: COLORS.ink }}>
                    {metrics.server_ip}
                  </span>
                </p>
                <p className="pt-2 border-t" style={{ borderColor: COLORS.line }}>
                  <span style={{ color: COLORS.inkSoft }}>SSID:</span>
                  <span
                    className="block mt-1 truncate"
                    title={ssid}
                    style={{
                      color: COLORS.ink,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {ssid}
                  </span>
                </p>
              </div>
            </div>

            {/* Kolom 2: Radar */}
            <div
              data-testid="radar-card"
              data-card-animated="true"
              className="border rounded-[14px] p-[14px_16px] pointer-events-auto"
              style={{
                backgroundColor: COLORS.bgPanel,
                borderColor: COLORS.line,
                minHeight: "clamp(220px, 30dvh, 300px)",
                opacity: 0,
                transform: "translateY(24px)",
              }}
            >
              <h2 className="text-[13px] font-sans font-medium mb-3" style={{ color: COLORS.inkSoft }}>
                Radar
              </h2>
              <div className="flex justify-center">
                <RadarCanvas />
              </div>
            </div>

            {/* Kolom 3: Alerts */}
            <div
              data-testid="alerts-card"
              data-card-animated="true"
              className="border rounded-[14px] p-[14px_16px] pointer-events-auto"
              style={{
                backgroundColor: COLORS.bgPanel,
                borderColor: COLORS.line,
                minHeight: "clamp(220px, 30dvh, 300px)",
                opacity: 0,
                transform: "translateY(24px)",
              }}
            >
              <AlertsPanel />
            </div>

            {/* Baris 2: Device Inspector (full width) */}
            <div
              data-testid="inspector-card"
              data-card-animated="true"
              className="border rounded-[14px] p-6 pointer-events-auto"
              style={{
                backgroundColor: COLORS.bgPanel,
                borderColor: COLORS.line,
                gridColumn: "1 / -1",
                opacity: 0,
                transform: "translateY(24px)",
              }}
            >
              {/* Header: Judul, IP/SSID, Online/Offline count */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 border-b pb-4" style={{ borderColor: COLORS.line }}>
                {/* Kiri: Judul + Deskripsi */}
                <div className="flex flex-col min-w-0">
                  <h2 className="text-[15px] font-sans font-medium" style={{ color: COLORS.ink }}>
                    Inspektur perangkat ({subnetPrefix})
                  </h2>
                  <p className="text-[12px] font-sans mt-0.5" style={{ color: COLORS.inkSoft }}>
                    Scanner ARP Scapy aktif
                  </p>
                </div>

                {/* Kanan: Online/Offline counts */}
                <div className="flex items-center gap-4 font-sans text-xs md:flex-none">
                  <span className="flex items-center gap-2" style={{ color: COLORS.statusOn }}>
                    <span className="font-medium" style={{ fontSize: "16px" }}>
                      {metrics.total_up}
                    </span>
                    <span>online</span>
                  </span>
                  <span className="flex items-center gap-2" style={{ color: COLORS.statusOff }}>
                    <span className="font-medium" style={{ fontSize: "16px" }}>
                      {metrics.total_down}
                    </span>
                    <span>offline</span>
                  </span>
                </div>
              </div>

              {/* Area tabel: flex:1, min-height:0, overflow auto */}
              <div
                className="overflow-x-auto overflow-y-auto"
                style={{ flex: "1 1 0%", minHeight: 0, overscrollBehavior: "auto" }}
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
                      fontFamily: "ui-monospace, Consolas, monospace",
                      fontSize: "12px",
                      minWidth: "900px",
                    }}
                    aria-label="Hasil pemindaian perangkat jaringan"
                  >
                    <caption className="sr-only">
                      Hasil pemindaian perangkat jaringan — {validDevices.length} perangkat terdeteksi
                    </caption>
                    <thead>
                      <tr
                        className="uppercase text-[11px]"
                        style={{ backgroundColor: COLORS.bgSubtle, color: COLORS.inkSoft }}
                      >
                        <th
                          className="px-4 py-3 text-left cursor-pointer whitespace-nowrap"
                          onClick={() => handleSort("ip")}
                          style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                        >
                          Alamat IP <SortIndicator columnKey="ip" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-left cursor-pointer whitespace-nowrap"
                          onClick={() => handleSort("mac")}
                          style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                        >
                          Alamat MAC <SortIndicator columnKey="mac" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-left cursor-pointer whitespace-nowrap"
                          onClick={() => handleSort("hostname")}
                          style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                        >
                          Nama perangkat <SortIndicator columnKey="hostname" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-left cursor-pointer whitespace-nowrap"
                          onClick={() => handleSort("category")}
                          style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                        >
                          Kategori <SortIndicator columnKey="category" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-left cursor-pointer whitespace-nowrap"
                          onClick={() => handleSort("vendor")}
                          style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                        >
                          Vendor <SortIndicator columnKey="vendor" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-left cursor-pointer whitespace-nowrap"
                          onClick={() => handleSort("location")}
                          style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                        >
                          Lokasi <SortIndicator columnKey="location" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-left cursor-pointer whitespace-nowrap"
                          onClick={() => handleSort("latency")}
                          style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                        >
                          Latensi <SortIndicator columnKey="latency" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-left cursor-pointer whitespace-nowrap"
                          onClick={() => handleSort("status")}
                          style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                        >
                          Status <SortIndicator columnKey="status" sortConfig={sortConfig} />
                        </th>
                        <th
                          className="px-4 py-3 text-right cursor-pointer whitespace-nowrap"
                          onClick={() => handleSort("last_seen")}
                          style={{ position: "sticky", top: 0, backgroundColor: COLORS.bgSubtle, zIndex: 10 }}
                        >
                          Terakhir dilihat <SortIndicator columnKey="last_seen" sortConfig={sortConfig} />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: COLORS.line }}>
                      {sortedDevices.map((dev, idx) => (
                        <tr
                          key={idx}
                          className="hover:transition-colors"
                          style={{ backgroundColor: "transparent" }}
                        >
                          <td
                            className="px-4 py-3 font-medium"
                            style={{ color: COLORS.ink, fontFamily: "ui-monospace, Consolas, monospace" }}
                          >
                            {dev.ip || "-"}
                          </td>
                          <td
                            className="px-4 py-3"
                            style={{ color: COLORS.inkSoft, fontFamily: "ui-monospace, Consolas, monospace" }}
                          >
                            {dev.mac}
                          </td>
                          <td className="px-4 py-3" style={{ color: COLORS.ink }}>
                            {dev.hostname}
                          </td>
                          <td className="px-4 py-3" style={{ color: COLORS.inkSoft }}>
                            {dev.category}
                          </td>
                          <td className="px-4 py-3" style={{ color: COLORS.inkSoft }}>
                            {dev.vendor}
                          </td>
                          <td className="px-4 py-3" style={{ color: COLORS.inkSoft }}>
                            {dev.location}
                          </td>
                          <td
                            className="px-4 py-3"
                            style={{
                              color: COLORS.accent,
                              fontFamily: "ui-monospace, Consolas, monospace",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {dev.latency !== undefined ? `${dev.latency}ms` : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {dev.status === "UP" ? (
                                <>
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.statusOn }} />
                                  <span style={{ color: COLORS.ink }}>Online</span>
                                </>
                              ) : (
                                <>
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.statusOff }} />
                                  <span style={{ color: COLORS.inkSoft }}>Offline</span>
                                </>
                              )}
                              {dev.is_blacklisted && (
                                <span className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.accent }} />
                                  <span style={{ color: COLORS.inkSoft }}>Terblokir</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            className="px-4 py-3 text-right"
                            style={{ color: COLORS.inkSoft, fontFamily: "ui-monospace, Consolas, monospace" }}
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
        </section>
      </div>

      {/* Penanda halaman: dua titik di tepi kanan */}
      <div
        ref={dotsContainerRef}
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
