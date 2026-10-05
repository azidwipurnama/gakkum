"use client";

import { useRef, useEffect, useState } from "react";
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

// Sub-component Canvas Radar Visualizer
function RadarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;

    let angle = 0;
    let animId: number;
    const size = 260;
    cv.width = size;
    cv.height = size;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 15;

    const blips = [
      { x: cx + 45, y: cy - 30, status: "on" },
      { x: cx - 50, y: cy + 40, status: "on" },
      { x: cx + 20, y: cy + 60, status: "off" },
      { x: cx - 60, y: cy - 50, status: "on" },
    ];

    const draw = () => {
      g.clearRect(0, 0, size, size);

      // Radar Grid Circles
      g.strokeStyle = COLORS.inkFaint;
      g.lineWidth = 1;
      [0.3, 0.6, 0.9].forEach((scale) => {
        g.beginPath();
        g.arc(cx, cy, r * scale, 0, Math.PI * 2);
        g.stroke();
      });

      // Axis Lines
      g.strokeStyle = COLORS.line;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - r, cy); g.lineTo(cx + r, cy);
      g.moveTo(cx, cy - r); g.lineTo(cx, cy + r);
      g.stroke();

      // Sweep Line
      angle += 0.03;
      const sx = cx + Math.cos(angle) * r;
      const sy = cy + Math.sin(angle) * r;

      // Flat wedge sweep (no gradient)
      g.fillStyle = `${COLORS.accent}26`;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, r, angle - 0.5, angle);
      g.closePath();
      g.fill();

      // Sweep line
      g.strokeStyle = COLORS.accent;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(sx, sy);
      g.stroke();

      // Blips
      blips.forEach((b) => {
        const blipColor = b.status === "on" ? COLORS.statusOn : COLORS.statusOff;
        g.fillStyle = blipColor;
        g.beginPath();
        g.arc(b.x, b.y, 4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = blipColor;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(b.x, b.y, 7, 0, Math.PI * 2);
        g.stroke();
      });

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} className="mx-auto block" role="img" aria-label="Radar visualizer" />;
}

export default function DashboardPage() {
  const { devices, metrics, ssid, loading } = useNetwork();
  const [isLoaded, setIsLoaded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'ip', direction: 'asc' });

  const validDevices = devices.filter((d) => d.ip && d.ip.trim() !== "");

  const sortedDevices = [...validDevices].sort((a, b) => {
    let aVal = a[sortConfig.key as keyof typeof a];
    let bVal = b[sortConfig.key as keyof typeof b];

    if (aVal === undefined || bVal === undefined) return 0;

    // Sort logic
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortIndicator = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) {
      return (
        <span className="ml-2 inline-flex flex-col text-[8px] opacity-30">
          <span>▲</span>
          <span>▼</span>
        </span>
      );
    }
    return (
      <span className="ml-2 inline-flex flex-col text-[8px]">
        <span className={sortConfig.direction === 'asc' ? 'text-[var(--accent)]' : 'opacity-30'}>▲</span>
        <span className={sortConfig.direction === 'desc' ? 'text-[var(--accent)]' : 'opacity-30'}>▼</span>
      </span>
    );
  };

  // Use metrics.server_ip for dynamic subnet detection
  const subnetPrefix = metrics?.server_ip
    ? metrics.server_ip.split('.').slice(0, 3).join('.') + '.x'
    : 'Localhost';

  return (
    <>
      {!isLoaded && <LoadingUI onFinished={() => setIsLoaded(true)} />}
      <main className={`relative min-h-screen bg-[var(--bg-page)] text-[var(--ink)] overflow-y-auto scroll-smooth h-screen touch-pan-y ${!isLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-700`} style={{ backgroundColor: COLORS.bgPage, color: COLORS.ink }} suppressHydrationWarning>
        <CyberGlobeBg wifiName={ssid} />

        {/* SEKSI 1: SERVER CONNECTION */}
      <section className="relative z-10 h-screen w-full flex items-start justify-start pt-8 pl-8 pointer-events-none">
        <div className="max-w-xs w-full space-y-3 pointer-events-auto">
          <div className="bg-[var(--bg-panel--50)] backdrop-blur-md border border-[var(--line)] rounded-[var(--radius-card)] p-4 shadow-none" style={{ backgroundColor: COLORS.bgPanel, borderColor: COLORS.line, borderRadius: 'var(--radius-card, 12px)' }}>
            <h2 className="text-[12px] font-sans font-medium text-[var(--ink-soft--70)] mb-3" style={{ color: COLORS.inkSoft }}>
              Server connection
            </h2>
            <div className="space-y-2 font-mono text-xs">
              <p className="text-[var(--ink--80)] flex justify-between">
                <span>IP:</span> <span className="text-[var(--ink)] font-medium monospace" style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontVariantNumeric: 'tabular-nums' }}>{metrics.server_ip}</span>
              </p>
              <p className="text-[var(--ink--80)] pt-2 border-t border-[var(--line--50)] flex justify-between items-center">
                <span>SSID:</span> <span className="text-[var(--ink)] font-medium" style={{ color: COLORS.ink }}>{ssid}</span>
              </p>
            </div>
          </div>
          <p className="text-[12px] font-sans text-[var(--ink-soft)]" style={{ color: COLORS.inkSoft }}>
            Scroll down for radar & inspector
          </p>
        </div>
      </section>

      {/* SEKSI 2: RADAR VISUALIZER */}
      <section className="relative z-10 h-screen w-full flex flex-col justify-center pt-10 px-10 pointer-events-none">
        <div className="flex gap-4">
          <div className="max-w-sm w-full border border-[var(--line)] rounded-[var(--radius-card)] p-5 space-y-4 pointer-events-auto ml-auto" style={{ backgroundColor: COLORS.bgPanel, borderColor: COLORS.line, borderRadius: 'var(--radius-card, 12px)' }}>
            <div className="flex justify-between items-center border-b border-[var(--line)] pb-3">
              <h2 className="text-[13px] font-sans font-medium text-[var(--ink-soft)]" style={{ color: COLORS.inkSoft }}>
                Radar
              </h2>
            </div>
            <RadarCanvas />
          </div>
          <AlertsPanel />
        </div>
      </section>

      {/* SEKSI 3: DEVICE INSPECTOR */}
      <section className="relative z-10 h-screen w-full flex flex-col justify-center px-10 pointer-events-none">
        <div className="max-w-7xl w-full border border-[var(--line)] rounded-[var(--radius-card)] p-8 space-y-5 pointer-events-auto mx-auto" style={{ backgroundColor: COLORS.bgPanel, borderColor: COLORS.line, borderRadius: 'var(--radius-card, 12px)' }}>
          <div className="flex justify-between items-center border-b border-[var(--line)] pb-4">
            <div>
              <h2 className="text-[15px] font-sans font-medium text-[var(--ink)]" style={{ color: COLORS.ink }}>
                Device inspector ({subnetPrefix})
              </h2>
              <p className="text-[12px] font-sans text-[var(--ink-soft)] mt-0.5" style={{ color: COLORS.inkSoft }}>Scapy ARP scanner aktif</p>
            </div>
            <div className="flex gap-4 font-sans text-xs">
              <span className="flex items-center gap-2" style={{ color: COLORS.statusOn }}>
                <span className="font-medium" style={{ fontSize: '16px' }}>{metrics.total_up}</span>
                <span>online</span>
              </span>
              <span className="flex items-center gap-2" style={{ color: COLORS.statusOff }}>
                <span className="font-medium" style={{ fontSize: '16px' }}>{metrics.total_down}</span>
                <span>offline</span>
              </span>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
            {loading ? (
              <div className="text-center py-10 text-[var(--ink-soft)] font-sans" style={{ color: COLORS.inkSoft }}>Connecting to scanner...</div>
            ) : validDevices.length === 0 ? (
              <div className="text-center py-10 text-[var(--ink-soft)] font-sans" style={{ color: COLORS.inkSoft }}>No devices found.</div>
            ) : (
              <table className="w-full text-left" style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px' }}>
                <thead>
                  <tr className="text-[var(--ink-soft)] border-b border-[var(--line)] uppercase text-[11px] sticky top-0" style={{ backgroundColor: COLORS.bgSubtle, color: COLORS.inkSoft, borderColor: COLORS.line }}>
                    <th className="px-4 py-3 text-left cursor-pointer" onClick={() => handleSort('ip')}>IP address <SortIndicator columnKey="ip" /></th>
                    <th className="px-4 py-3 text-left cursor-pointer" onClick={() => handleSort('mac')}>MAC address <SortIndicator columnKey="mac" /></th>
                    <th className="px-4 py-3 text-left cursor-pointer" onClick={() => handleSort('hostname')}>Device name <SortIndicator columnKey="hostname" /></th>
                    <th className="px-4 py-3 text-left cursor-pointer" onClick={() => handleSort('category')}>Category <SortIndicator columnKey="category" /></th>
                    <th className="px-4 py-3 text-left cursor-pointer" onClick={() => handleSort('vendor')}>Vendor <SortIndicator columnKey="vendor" /></th>
                    <th className="px-4 py-3 text-left cursor-pointer" onClick={() => handleSort('location')}>Location <SortIndicator columnKey="location" /></th>
                    <th className="px-4 py-3 text-left cursor-pointer" onClick={() => handleSort('latency')}>Latency <SortIndicator columnKey="latency" /></th>
                    <th className="px-4 py-3 text-left cursor-pointer" onClick={() => handleSort('status')}>Status <SortIndicator columnKey="status" /></th>
                    <th className="px-4 py-3 text-right cursor-pointer" onClick={() => handleSort('last_seen')}>Last seen <SortIndicator columnKey="last_seen" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: COLORS.line }}>
                  {sortedDevices.map((dev, idx) => (
                    <tr key={idx} className="hover:transition-colors" style={{ backgroundColor: 'transparent' }}>
                      <td className="px-4 py-3 font-medium" style={{ color: COLORS.ink, fontFamily: 'ui-monospace, Consolas, monospace' }}>{dev.ip || "-"}</td>
                      <td className="px-4 py-3" style={{ color: COLORS.inkSoft, fontFamily: 'ui-monospace, Consolas, monospace' }}>{dev.mac}</td>
                      <td className="px-4 py-3" style={{ color: COLORS.ink }}>{dev.hostname}</td>
                      <td className="px-4 py-3" style={{ color: COLORS.inkSoft }}>{dev.category}</td>
                      <td className="px-4 py-3" style={{ color: COLORS.inkSoft }}>{dev.vendor}</td>
                      <td className="px-4 py-3" style={{ color: COLORS.inkSoft }}>{dev.location}</td>
                      <td className="px-4 py-3" style={{ color: COLORS.accent, fontFamily: 'ui-monospace, Consolas, monospace', fontVariantNumeric: 'tabular-nums' }}>{dev.latency !== undefined ? `${dev.latency}ms` : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {dev.status === "UP" ? (
                            <>
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.statusOn }}></span>
                              <span style={{ color: COLORS.ink }}>Online</span>
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.statusOff }}></span>
                              <span style={{ color: COLORS.inkSoft }}>Offline</span>
                            </>
                          )}
                          {dev.is_blacklisted && (
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.accent }}></span>
                              <span style={{ color: COLORS.inkSoft }}>Blocked</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: COLORS.inkSoft, fontFamily: 'ui-monospace, Consolas, monospace' }}>{new Date(dev.last_seen).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
      </main>
    </>
  );
}
