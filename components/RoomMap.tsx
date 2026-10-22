"use client";

/**
 * Denah ruangan dengan titik perangkat.
 *
 * Komponen ini adalah "cangkang" tampilan: ia tidak tahu ruangan mana yang
 * ada. Semua daftar ruangan, koordinat AP, dan gambar denah datang dari
 * backend/rooms.py lewat WebSocket (payload DEVICE_UPDATE) atau GET /api/rooms.
 * Saat daftar BSSID asli diisi di sana, tidak ada yang perlu diubah di sini.
 *
 * Ruangan yang ditampilkan mengikuti AP tempat laptop monitoring terhubung.
 * Pengguna tetap bisa memilih ruangan lain secara manual lewat chip di atas
 * denah; pilihan itu hanya memengaruhi tampilan, bukan data.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNetwork } from "@/contexts/NetworkContext";
import { fetchRooms, parseViewBox, type RoomInfo, type RoomRegistry } from "@/lib/rooms";
import type { Device } from "@/types/network";

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

const LABEL: React.CSSProperties = {
  fontSize: "10px",
  color: COLORS.inkSoft,
  whiteSpace: "nowrap",
};

function hashMac(mac: string): number {
  return (mac || "").split(":").reduce((acc, part) => acc + (parseInt(part, 16) || 0), 0);
}

function deviceColor(device: Device): string {
  if (device.status !== "UP") return COLORS.statusOff;
  return COLORS.statusOn;
}

interface PlacedDevice {
  device: Device;
  left: number;
  top: number;
  color: string;
}

export default function RoomMap() {
  const { devices, rooms: wsRooms, currentRoom, currentAp, currentBssid } = useNetwork();

  const [registry, setRegistry] = useState<RoomRegistry | null>(null);
  // null = ikuti ruangan host secara otomatis.
  const [pickedRoom, setPickedRoom] = useState<string | null>(null);
  const [hoveredMac, setHoveredMac] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  // Registry awal: WS bisa belum terkirim saat halaman baru dibuka.
  useEffect(() => {
    const controller = new AbortController();
    fetchRooms(controller.signal).then((data) => {
      if (data) setRegistry(data);
    });
    return () => controller.abort();
  }, []);

  // Ukur area denah supaya overlay titik menempel tepat pada gambar.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBox({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rooms: RoomInfo[] = wsRooms.length > 0 ? wsRooms : registry?.rooms ?? [];
  const liveRoom = currentRoom ?? registry?.current_room ?? null;
  const activeRoomId = pickedRoom ?? liveRoom ?? rooms[0]?.id ?? null;
  const room = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  const vb = parseViewBox(room?.view_box ?? null);
  const hasGeometry = Boolean(room?.aps.some((ap) => ap.x != null && ap.y != null));
  const hasBssid = Boolean(room?.aps.some((ap) => ap.has_bssid));

  const scale = box.width > 0 && box.height > 0
    ? Math.min(box.width / vb.width, box.height / vb.height)
    : 0;
  const fittedWidth = vb.width * scale;
  const fittedHeight = vb.height * scale;

  const placed: PlacedDevice[] = useMemo(() => {
    if (!room) return [];

    // Ruangan hanya menampilkan perangkat yang pernah terlihat saat host
    // berada di ruangan itu (lihat apply_host_bssid di backend).
    const inRoom = devices.filter(
      (d) => d.room_id === room.id || (Array.isArray(d.rooms) && d.rooms.includes(room.id))
    );

    const aps = room.aps;
    const fallbackCenter = { x: vb.width / 2, y: vb.height / 2 };

    return inRoom.map((device) => {
      const hash = hashMac(device.mac);

      let apIndex = aps.findIndex((ap) => ap.id === device.ap_id);
      if (apIndex < 0) apIndex = aps.length > 0 ? hash % aps.length : -1;

      let center = fallbackCenter;
      if (apIndex >= 0) {
        const ap = aps[apIndex];
        if (ap.x != null && ap.y != null) {
          center = { x: ap.x, y: ap.y };
        } else if (!hasGeometry) {
          // Denah belum tersedia: sebar AP dalam kisi 2 kolom sebagai skema.
          const cols = 2;
          const rows = Math.max(1, Math.ceil(aps.length / cols));
          center = {
            x: (vb.width * ((apIndex % cols) + 0.5)) / cols,
            y: (vb.height * (Math.floor(apIndex / cols) + 0.5)) / rows,
          };
        }
      }

      // Sebar titik di sekitar AP-nya supaya tidak saling menumpuk.
      const angle = ((hash % 360) * Math.PI) / 180;
      const distance = Math.min(vb.width, vb.height) * (0.045 + (hash % 40) / 1000);
      const margin = Math.min(vb.width, vb.height) * 0.03;
      const x = Math.min(vb.width - margin, Math.max(margin, center.x + Math.cos(angle) * distance));
      const y = Math.min(vb.height - margin, Math.max(margin, center.y + Math.sin(angle) * distance));

      return {
        device,
        left: (x / vb.width) * 100,
        top: (y / vb.height) * 100,
        color: deviceColor(device),
      };
    });
  }, [devices, room, vb.width, vb.height, hasGeometry]);

  const apMarkers = useMemo(() => {
    if (!room) return [];
    return room.aps.map((ap, index) => {
      let x = ap.x;
      let y = ap.y;
      if (x == null || y == null) {
        const cols = 2;
        const rows = Math.max(1, Math.ceil(room.aps.length / cols));
        x = (vb.width * ((index % cols) + 0.5)) / cols;
        y = (vb.height * (Math.floor(index / cols) + 0.5)) / rows;
      }
      return {
        id: ap.id,
        label: ap.label,
        left: (x / vb.width) * 100,
        top: (y / vb.height) * 100,
        active: ap.id === currentAp,
      };
    });
  }, [room, vb.width, vb.height, currentAp]);

  const headerBadge = (() => {
    if (!room) return "Menunggu data ruangan…";
    const live = liveRoom === room.id;
    return live ? `Host di ${room.label}` : `Mode lihat: ${room.label}`;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: "8px" }}>
      {/* Header + pemilih ruangan */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 500, color: COLORS.ink }}>Denah Ruangan</h3>
          <span
            title={currentBssid ? `BSSID host: ${currentBssid}` : "BSSID host belum terbaca"}
            style={{
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "120px",
              border: `1px solid ${COLORS.line}`,
              backgroundColor: COLORS.bgSubtle,
              color: COLORS.inkSoft,
              whiteSpace: "nowrap",
            }}
          >
            {headerBadge}
          </span>
        </div>

        {rooms.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setPickedRoom(null)}
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "120px",
                cursor: "pointer",
                border: `1px solid ${pickedRoom === null ? COLORS.accent : COLORS.line}`,
                backgroundColor: pickedRoom === null ? "rgba(180, 83, 26, 0.08)" : COLORS.bgSubtle,
                color: pickedRoom === null ? COLORS.accent : COLORS.inkSoft,
              }}
            >
              Otomatis
            </button>
            {rooms.map((r) => {
              const active = activeRoomId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setPickedRoom(r.id)}
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "120px",
                    cursor: "pointer",
                    border: `1px solid ${active ? COLORS.accent : COLORS.line}`,
                    backgroundColor: active ? "rgba(180, 83, 26, 0.08)" : COLORS.bgSubtle,
                    color: active ? COLORS.accent : COLORS.inkSoft,
                  }}
                >
                  {r.label}
                  {liveRoom === r.id ? " •" : ""}
                </button>
              );
            })}
          </div>
        )}

        {room && !hasBssid && (
          <div style={{ fontSize: "10px", color: COLORS.accent }}>
            BSSID AP {room.label} masih placeholder — isi di backend/rooms.py.
          </div>
        )}
      </div>

      {/* Area denah */}
      <div
        ref={boxRef}
        style={{
          position: "relative",
          flex: 1,
          minHeight: "100px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {!room && (
          <span style={{ fontSize: "11px", color: COLORS.inkFaint }}>Menunggu data ruangan…</span>
        )}

        {room && scale > 0 && (
          <div
            style={{
              position: "relative",
              width: `${fittedWidth}px`,
              height: `${fittedHeight}px`,
            }}
          >
            {room.floorplan ? (
              <img
                src={room.floorplan}
                alt={`Denah ${room.label}`}
                draggable={false}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "fill",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  border: `1px dashed ${COLORS.line}`,
                  borderRadius: "8px",
                  backgroundColor: COLORS.bgSubtle,
                }}
              />
            )}

            {/* Marker AP */}
            {apMarkers.map((ap) => (
              <div
                key={ap.id}
                title={`${ap.label}${ap.active ? " (AP host saat ini)" : ""}`}
                style={{
                  position: "absolute",
                  left: `${ap.left}%`,
                  top: `${ap.top}%`,
                  transform: "translate(-50%, -50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "1px",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    width: ap.active ? "10px" : "7px",
                    height: ap.active ? "10px" : "7px",
                    borderRadius: "50%",
                    border: `2px solid ${ap.active ? COLORS.accent : COLORS.inkFaint}`,
                    backgroundColor: COLORS.bgPanel,
                    boxShadow: ap.active ? `0 0 0 2px rgba(180, 83, 26, 0.15)` : "none",
                  }}
                />
                <span style={{ ...LABEL, fontSize: "7px", color: COLORS.inkFaint }}>{ap.label}</span>
              </div>
            ))}

            {/* Titik perangkat */}
            {placed.map(({ device, left, top, color }) => (
              <div
                key={device.mac}
                title={`${device.hostname || device.mac}\n${device.ip}\n${device.category}\n${device.status}`}
                onMouseEnter={() => setHoveredMac(device.mac)}
                onMouseLeave={() => setHoveredMac(null)}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  top: `${top}%`,
                  transform: "translate(-50%, -50%)",
                  width: hoveredMac === device.mac ? "10px" : "7px",
                  height: hoveredMac === device.mac ? "10px" : "7px",
                  borderRadius: "50%",
                  backgroundColor: color,
                  border: `1.5px solid ${COLORS.bgPanel}`,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                  cursor: "default",
                }}
              />
            ))}

            {placed.length === 0 && null}
          </div>
        )}
      </div>

      {/* Legenda */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", flex: "none" }}>
        <LegendItem color={COLORS.statusOn} label="Online" />
        <LegendItem color={COLORS.statusOff} label="Offline" />
        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              border: `1.5px solid ${COLORS.inkFaint}`,
              backgroundColor: COLORS.bgPanel,
            }}
          />
          <span style={{ ...LABEL, fontSize: "9px" }}>AP</span>
        </span>
        <span style={{ marginLeft: "auto", ...LABEL, fontSize: "9px" }}>{placed.length} perangkat</span>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: color }} />
      <span style={{ ...LABEL, fontSize: "9px" }}>{label}</span>
    </span>
  );
}
