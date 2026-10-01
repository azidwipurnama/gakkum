"use client";

import React, { useState, useEffect, useRef } from "react";
import CyberGlobeBg from "@/components/CyberGlobeBg";

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

    // Simulated radar blips
    const blips = [
      { x: cx + 45, y: cy - 30, color: "#00f3ff", ping: 0 },
      { x: cx - 50, y: cy + 40, color: "#00f3ff", ping: 0.3 },
      { x: cx + 20, y: cy + 60, color: "#ff5500", ping: 0.6 },
      { x: cx - 60, y: cy - 50, color: "#22c55e", ping: 0.8 },
    ];

    const draw = () => {
      g.clearRect(0, 0, size, size);

      // Radar Grid Circles
      g.strokeStyle = "rgba(0, 243, 255, 0.2)";
      g.lineWidth = 1;
      [0.3, 0.6, 0.9].forEach((scale) => {
        g.beginPath();
        g.arc(cx, cy, r * scale, 0, Math.PI * 2);
        g.stroke();
      });

      // Axis Lines
      g.beginPath();
      g.moveTo(cx - r, cy); g.lineTo(cx + r, cy);
      g.moveTo(cx, cy - r); g.lineTo(cx, cy + r);
      g.stroke();

      // Sweep Line
      angle += 0.03;
      const sx = cx + Math.cos(angle) * r;
      const sy = cy + Math.sin(angle) * r;

      const grad = g.createConicGradient(angle - 0.5, cx, cy);
      grad.addColorStop(0, "rgba(0, 243, 255, 0.35)");
      grad.addColorStop(0.15, "rgba(0, 243, 255, 0)");
      grad.addColorStop(1, "rgba(0, 243, 255, 0)");

      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();

      g.strokeStyle = "#00f3ff";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(sx, sy);
      g.stroke();

      // Blips
      blips.forEach((b) => {
        g.fillStyle = b.color;
        g.beginPath();
        g.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
        g.fill();

        g.strokeStyle = b.color;
        g.lineWidth = 0.8;
        g.beginPath();
        g.arc(b.x, b.y, 7, 0, Math.PI * 2);
        g.stroke();
      });

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} className="mx-auto block" />;
}

export default function DashboardPage() {
  const [ssid, setSsid] = useState<string>("WING C - GAKKUM");

  // Sample Scanned Devices (Subnet 192.168.100.x)
  const devices = [
    { ip: "192.168.100.1", mac: "00:1A:2B:3C:4D:5E", name: "Gateway Router", status: "ONLINE", latency: "2ms" },
    { ip: "192.168.100.23", mac: "A4:C3:F0:12:88:1A", name: "Gakkum Server 01", status: "ONLINE", latency: "1ms" },
    { ip: "192.168.100.45", mac: "BC:D1:93:44:00:2B", name: "CCTV Wing C-1", status: "ONLINE", latency: "12ms" },
    { ip: "192.168.100.102", mac: "E8:99:C6:11:52:3F", name: "Inspector Terminal", status: "OFFLINE", latency: "-" },
    { ip: "192.168.100.115", mac: "F4:8E:38:77:90:CD", name: "Unknown Device", status: "OFFLINE", latency: "-" },
  ];

  return (
    <main className="relative min-h-screen bg-[#05080d] text-white overflow-y-scroll snap-y snap-mandatory h-screen scroll-smooth touch-pan-y">
      <CyberGlobeBg wifiName={ssid} />

      {/* SEKSI 1: SERVER CONNECTION */}
      <section className="relative z-10 h-screen w-full snap-start snap-always flex items-start justify-start pt-10 px-10 pointer-events-none">
        <div className="max-w-xs w-full space-y-3 pointer-events-auto">
          <div className="bg-slate-900/50 backdrop-blur-md border border-cyan-500/20 rounded-xl p-4 shadow-2xl">
            <h2 className="text-[11px] font-mono text-cyan-400 tracking-widest uppercase mb-3 font-semibold">
              Server Connection
            </h2>
            <div className="space-y-2 font-mono text-xs">
              <p className="text-slate-300 flex justify-between">
                <span>IP:</span> <span className="text-white font-bold">192.168.100.23</span>
              </p>
              <p className="text-slate-300 flex justify-between">
                <span>Room:</span> <span className="text-white font-bold">Gakkum-1</span>
              </p>
              <p className="text-slate-300 pt-2 border-t border-slate-800/80 flex justify-between items-center">
                <span>SSID:</span> <span className="text-cyan-400 font-bold uppercase">{ssid}</span>
              </p>
            </div>
          </div>
          <p className="text-[10px] font-mono text-slate-500 animate-pulse pl-1">
            ↓ Scroll ke bawah untuk Radar & Inspector
          </p>
        </div>
      </section>

      {/* SEKSI 2: RADAR VISUALIZER */}
      <section className="relative z-10 h-screen w-full snap-start snap-always flex items-start justify-end pt-10 px-10 pointer-events-none">
        <div className="max-w-sm w-full bg-slate-900/50 backdrop-blur-md border border-cyan-500/20 rounded-xl p-5 shadow-2xl space-y-4 pointer-events-auto">
          <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
            <h2 className="text-[11px] font-mono text-cyan-400 tracking-widest uppercase font-semibold">
              Radar Visualizer
            </h2>
            <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/30 animate-pulse">
              SWEEPING
            </span>
          </div>
          <RadarCanvas />
        </div>
      </section>

      {/* SEKSI 3: DEVICE INSPECTOR */}
      <section className="relative z-10 h-screen w-full snap-start snap-always flex items-center justify-center px-10 pointer-events-none">
        <div className="max-w-4xl w-full bg-slate-900/50 backdrop-blur-md border border-cyan-500/20 rounded-xl p-6 shadow-2xl space-y-5 pointer-events-auto">
          <div className="flex justify-between items-center border-b border-slate-800/80 pb-4">
            <div>
              <h2 className="text-xs font-mono text-cyan-400 tracking-widest uppercase font-semibold">
                Device Inspector (192.168.100.x)
              </h2>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">Scapy ARP Scanner Active</p>
            </div>
            <div className="flex gap-4 font-mono text-xs">
              <span className="bg-cyan-500/10 text-cyan-400 px-3 py-1 rounded border border-cyan-500/30">
                3 UP
              </span>
              <span className="bg-orange-500/10 text-orange-400 px-3 py-1 rounded border border-orange-500/30">
                2 DOWN
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800/80 uppercase text-[10px]">
                  <th className="pb-3">IP Address</th>
                  <th className="pb-3">MAC Address</th>
                  <th className="pb-3">Device Name</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {devices.map((dev, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 font-bold text-white">{dev.ip}</td>
                    <td className="py-3 text-slate-400">{dev.mac}</td>
                    <td className="py-3 text-slate-300">{dev.name}</td>
                    <td className="py-3">
                      {dev.status === "ONLINE" ? (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          ONLINE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded text-[10px] border border-orange-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                          OFFLINE
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right text-slate-400">{dev.latency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
