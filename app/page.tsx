"use client";

import React, { useRef, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import CyberGlobeBg from "@/components/CyberGlobeBg";
import AlertsPanel from "@/components/AlertsPanel";
import { useNetwork } from "@/contexts/NetworkContext";
import LoadingUI from "@/components/LoadingUI";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import {
  radarMotion,
  alertsMotion,
  deviceInspectorMotion,
  scrollHintMotion,
  scrollProgressDotsMotion,
  serverConnMotion,
  tableRowMotion,
  globeMotion,
} from "@/lib/scrollMotion";

const WRAPPER_HEIGHT_VH = 260;

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

// Sort indicator for table headers
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

// Radar canvas component
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
      aria-label="Radar visualizer"
    />
  );
}

// Scroll-progress dots: two dots on right edge, opacity fades in 0-0.16, stays visible
function ScrollProgressDots({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-testid="scroll-progress-dots"
      className="fixed top-1/2 -translate-y-1/2 right-6 z-40 flex items-center pointer-events-none"
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-1">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: COLORS.inkFaint }}
        />
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: COLORS.accent }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { devices, metrics, ssid, loading } = useNetwork();
  const [isLoaded, setIsLoaded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "ip", direction: "asc" });
  const page2Ref = useRef<HTMLElement>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLButtonElement>(null);
  const scrollDotsRef = useRef<HTMLDivElement>(null);
  const serverConnRef = useRef<HTMLDivElement>(null);
  const alertsCardRef = useRef<HTMLDivElement>(null);
  const radarCardRef = useRef<HTMLDivElement>(null);
  const inspectorCardRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const { p: progressP } = useScrollProgress({
    wrapperRef,
    targetRef: stageRef,
    debug: process.env.NODE_ENV === "development",
    onProgress: (p) => {
      if (!stageRef.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const applyEl = (
        el: HTMLElement | null,
        s: { transform: string; opacity: number },
      ) => {
        if (!el) return;
        if (reduced) {
          el.style.transform = "none";
          el.style.opacity = "1";
          el.removeAttribute("inert");
          el.setAttribute("aria-hidden", "false");
          return;
        }
        el.style.transform = s.transform;
        el.style.opacity = String(s.opacity);
        if (s.opacity < 0.01) {
          el.setAttribute("inert", "");
          el.setAttribute("aria-hidden", "true");
        } else {
          el.removeAttribute("inert");
          el.setAttribute("aria-hidden", "false");
        }
      };

      applyEl(scrollHintRef.current, scrollHintMotion(p));
      const dots = scrollProgressDotsMotion(p);
      if (scrollDotsRef.current) {
        if (reduced) scrollDotsRef.current.style.opacity = "1";
        else scrollDotsRef.current.style.opacity = String(dots.opacity);
      }

      applyEl(serverConnRef.current, serverConnMotion(p));
      applyEl(alertsCardRef.current, alertsMotion(p));
      applyEl(radarCardRef.current, radarMotion(p));
      applyEl(inspectorCardRef.current, deviceInspectorMotion(p));
      tableRowRefs.current.forEach((row, idx) => applyEl(row, tableRowMotion(idx, p)));
    },
  });

  const scrollToPage2 = () => {
    page2Ref.current?.scrollIntoView({ behavior: "smooth" });
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

  const showProgressDebug =
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    new URLSearchParams(window.location.search).has("motion=debug");

  return (
    <>
      {!isLoaded && <LoadingUI onFinished={() => setIsLoaded(true)} />}

      {/* PAGE 1: Landing (100vh) - Globe + Scroll Hint + Two-dot indicator */}
      <div
        ref={wrapperRef}
        className="relative bg-[var(--bg-page)] text-[var(--ink)] scroll-smooth touch-pan-y"
        style={{ backgroundColor: COLORS.bgPage, color: COLORS.ink, height: `${WRAPPER_HEIGHT_VH}vh` }}
        suppressHydrationWarning
      >
        {/* Globe positioned in top-right corner, behind everything */}
        <CyberGlobeBg wifiName={ssid} />

        <div ref={stageRef} className="absolute invisible" aria-hidden="true" />

        <ScrollProgressDots ref={scrollDotsRef} />

        {/* Skip-link */}
        <a href="#page2" className="skip-link">
          Skip to content
        </a>

        {/* Landing Section - 100vh */}
        <section
          aria-label="Landing page"
          className="relative z-10 h-screen w-full pointer-events-none"
        >
          {/* Scroll hint: bottom center, ~6vh from bottom, fades 0-0.10 */}
          <button
            ref={scrollHintRef}
            onClick={scrollToPage2}
            aria-label="Scroll down to content"
            className="fixed left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 pointer-events-auto"
            style={{ bottom: "6vh", color: COLORS.inkSoft }}
          >
            <p className="text-[12px] font-sans mb-1" style={{ color: COLORS.inkSoft }}>
              Scroll down
            </p>
            <ChevronDown className="w-4 h-4 scroll-pill-icon" style={{ color: COLORS.inkSoft }} />
          </button>
        </section>

        {/* PAGE 2: Grid Content (160vh) */}
        <section
          id="page2"
          ref={page2Ref}
          aria-label="Network dashboard"
          className="relative z-10 h-[160vh] w-full"
        >
          <div
            className="flex flex-col h-full"
            style={{ padding: INSET }}
          >
            {/* Header row: Server Connection + Alerts (12px gap) */}
            <div className="flex flex-col gap-[12px] mb-4">
              {/* Server Connection Card */}
              <div
                ref={serverConnRef}
                data-testid="server-connection-card"
                className="border rounded-[14px] p-[14px_16px] w-full pointer-events-auto"
                style={{
                  backgroundColor: COLORS.bgPanel,
                  borderColor: COLORS.line,
                  borderRadius: "14px",
                }}
              >
                <h2 className="text-[12px] font-sans font-medium mb-3" style={{ color: COLORS.inkSoft }}>
                  Server connection
                </h2>
                <div className="space-y-2 font-mono text-xs">
                  <p className="flex justify-between">
                    <span>IP:</span>{" "}
                    <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontVariantNumeric: "tabular-nums", color: COLORS.ink }}>
                      {metrics.server_ip}
                    </span>
                  </p>
                  <p className="pt-2 border-t" style={{ borderColor: COLORS.line }}>
                    <span>SSID:</span>{" "}
                    <span style={{ color: COLORS.ink }}>{ssid}</span>
                  </p>
                </div>
              </div>

              {/* Alerts Card */}
              <div
                ref={alertsCardRef}
                data-testid="alerts-card"
                className="border rounded-[14px] p-[14px_16px] w-full pointer-events-auto"
                style={{
                  backgroundColor: COLORS.bgPanel,
                  borderColor: COLORS.line,
                  borderRadius: "14px",
                }}
              >
                <AlertsPanel />
              </div>
            </div>

            {/* Main grid: Radar + empty column */}
            <div className="flex gap-[12px] items-start flex-1">
              {/* Column 1: Radar (max 260px) */}
              <div
                ref={radarCardRef}
                data-testid="radar-card"
                className="border rounded-[14px] p-[14px_16px] w-full max-w-[260px] space-y-4 pointer-events-auto"
                style={{ backgroundColor: COLORS.bgPanel, borderColor: COLORS.line, borderRadius: "14px" }}
              >
                <h2 className="text-[13px] font-sans font-medium" style={{ color: COLORS.inkSoft }}>
                  Radar
                </h2>
                <RadarCanvas />
              </div>

              {/* Column 2: Empty space for globe visibility */}
              <div className="flex-1" />
            </div>
          </div>

          {/* Device Inspector - full width at bottom */}
          <div
            ref={inspectorCardRef}
            data-testid="inspector-card"
            className="border rounded-[14px] p-6 space-y-5 pointer-events-auto mx-auto"
            style={{
              backgroundColor: COLORS.bgPanel,
              borderColor: COLORS.line,
              maxWidth: "min(940px, calc(100vw - 32px))",
            }}
          >
            <div className="flex justify-between items-center border-b pb-4" style={{ borderColor: COLORS.line }}>
              <div>
                <h2 className="text-[15px] font-sans font-medium" style={{ color: COLORS.ink }}>
                  Device inspector ({subnetPrefix})
                </h2>
                <p className="text-[12px] font-sans mt-0.5" style={{ color: COLORS.inkSoft }}>
                  Scapy ARP scanner aktif
                </p>
              </div>
              <div className="flex gap-4 font-sans text-xs">
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

            <div
              ref={tableContainerRef}
              className="flex-1 min-h-0 overflow-x-auto overflow-y-auto"
              style={{ minHeight: 0, overscrollBehavior: "auto" }}
            >
              {loading ? (
                <div className="text-center py-10 font-sans" style={{ color: COLORS.inkSoft }}>
                  Connecting to scanner...
                </div>
              ) : validDevices.length === 0 ? (
                <div className="text-center py-10 font-sans" style={{ color: COLORS.inkSoft }}>
                  No devices found.
                </div>
              ) : (
                <table
                  className="w-full mobile-table text-left"
                  style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", minWidth: "900px" }}
                  aria-label="Network device scan results"
                >
                  <caption className="sr-only">
                    Network device scan results — {validDevices.length} devices detected
                  </caption>
                  <thead>
                    <tr
                      className="uppercase text-[11px]"
                      style={{ backgroundColor: COLORS.bgSubtle, color: COLORS.inkSoft, borderColor: COLORS.line }}
                    >
                      <th
                        className="px-4 py-3 text-left cursor-pointer whitespace-nowrap"
                        onClick={() => handleSort("ip")}
                      >
                        IP address <SortIndicator columnKey="ip" sortConfig={sortConfig} />
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer whitespace-nowrap" onClick={() => handleSort("mac")}>
                        MAC address <SortIndicator columnKey="mac" sortConfig={sortConfig} />
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer whitespace-nowrap" onClick={() => handleSort("hostname")}>
                        Device name <SortIndicator columnKey="hostname" sortConfig={sortConfig} />
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer whitespace-nowrap" onClick={() => handleSort("category")}>
                        Category <SortIndicator columnKey="category" sortConfig={sortConfig} />
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer whitespace-nowrap" onClick={() => handleSort("vendor")}>
                        Vendor <SortIndicator columnKey="vendor" sortConfig={sortConfig} />
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer whitespace-nowrap" onClick={() => handleSort("location")}>
                        Location <SortIndicator columnKey="location" sortConfig={sortConfig} />
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer whitespace-nowrap" onClick={() => handleSort("latency")}>
                        Latency <SortIndicator columnKey="latency" sortConfig={sortConfig} />
                      </th>
                      <th className="px-4 py-3 text-left cursor-pointer whitespace-nowrap" onClick={() => handleSort("status")}>
                        Status <SortIndicator columnKey="status" sortConfig={sortConfig} />
                      </th>
                      <th className="px-4 py-3 text-right cursor-pointer whitespace-nowrap" onClick={() => handleSort("last_seen")}>
                        Last seen <SortIndicator columnKey="last_seen" sortConfig={sortConfig} />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: COLORS.line }}>
                    {sortedDevices.map((dev, idx) => (
                      <tr
                        key={idx}
                        ref={(el) => {
                          if (el) tableRowRefs.current.set(idx, el);
                          else tableRowRefs.current.delete(idx);
                        }}
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
                        <td className="px-4 py-3" style={{ color: COLORS.inkSoft }}>{dev.category}</td>
                        <td className="px-4 py-3" style={{ color: COLORS.inkSoft }}>{dev.vendor}</td>
                        <td className="px-4 py-3" style={{ color: COLORS.inkSoft }}>{dev.location}</td>
                        <td
                          className="px-4 py-3"
                          style={{ color: COLORS.accent, fontFamily: "ui-monospace, Consolas, monospace", fontVariantNumeric: "tabular-nums" }}
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
                                <span style={{ color: COLORS.inkSoft }}>Blocked</span>
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
        </section>
      </div>

      {/* Debug overlay */}
      {showProgressDebug && (
        <div
          className="fixed bottom-4 right-4 z-[9999] px-2 py-1 text-xs font-mono rounded"
          style={{ backgroundColor: COLORS.bgPanel, borderColor: COLORS.line, color: COLORS.ink, borderWidth: 1 }}
        >
          p = {Math.min(1, Math.max(0, progressP)).toFixed(4)}
        </div>
      )}
    </>
  );
}