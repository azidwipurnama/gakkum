"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Activity, RefreshCw, Play, X } from "lucide-react";

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

const API_BASE = "http://localhost:8000";
const API_KEY = "GAKKUM_SECRET_KEY";

type MonitoringStatus = {
  last_run_at: string | null;
  last_duration_seconds: number | null;
  last_alert_count: number;
  last_snapshot_devices: number;
  last_activity_devices: number;
  last_error: string | null;
  runs: number;
  schema_ready?: boolean;
  schema_error?: string | null;
  interval_seconds: number;
  baseline_days: number;
  retention_days: number;
  latency_shift_factor: number;
  current_ssid: string | null;
  current_bssid: string | null;
  devices_tracked: number;
};

type NewDevice = {
  mac: string;
  ip: string | null;
  first_seen: string;
  ssid_seen: string | null;
  seen_in_snapshots: number;
};

type DisappearedDevice = {
  mac: string;
  last_seen: string;
  latency_avg: number | null;
  count_days: number;
};

type AlertRow = {
  id?: string;
  ts?: string;
  rule_type: string;
  severity: string;
  device_mac: string | null;
  message: string;
  // Additional fields from summary/alerts if provided by API
  current_value?: number;
  baseline_value?: number;
};

type Summary = {
  schema_ready?: boolean;
  schema_error?: string | null;
  baseline_ready: boolean;
  new_devices: NewDevice[];
  disappeared_devices: DisappearedDevice[];
  traffic_spikes: AlertRow[];
};

const RULE_LABEL: Record<string, string> = {
  new_device: "Perangkat baru",
  device_disappeared: "Perangkat hilang",
  traffic_spike: "Lonjakan trafik",
  latency_shift: "Pergeseran latensi",
  bssid_change: "BSSID berubah",
};

const SEVERITY_COLOR: Record<string, string> = {
  info: COLORS.inkSoft,
  warning: COLORS.accent,
  critical: COLORS.statusOff,
};

function fmtTimeCompact(value?: string | null) {
  if (!value) return { time: "—", date: "" };
  try {
    const d = new Date(value);
    const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", ".");
    const date = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
    return { time, date };
  } catch {
    return { time: value, date: "" };
  }
}

export default function MonitoringPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [hideRandom, setHideRandom] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, summaryRes, alertsRes] = await Promise.all([
        fetch(`${API_BASE}/api/monitoring/status?api_key=${API_KEY}`),
        fetch(`${API_BASE}/api/monitoring/summary?api_key=${API_KEY}`),
        fetch(`${API_BASE}/api/monitoring/alerts?api_key=${API_KEY}&limit=50`),
      ]);
      if (!statusRes.ok) throw new Error(`status HTTP ${statusRes.status}`);
      if (!summaryRes.ok) throw new Error(`summary HTTP ${summaryRes.status}`);
      if (!alertsRes.ok) throw new Error(`alerts HTTP ${alertsRes.status}`);

      setStatus(await statusRes.json());
      setSummary(await summaryRes.json());
      setAlerts((await alertsRes.json()).alerts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data pemantauan");
    } finally {
      setLoading(false);
    }
  }, []);

  const runNow = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/run?api_key=${API_KEY}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menjalankan siklus");
    } finally {
      setRunning(false);
    }
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isRandomMac = (mac: string) => {
    if (!mac || mac.length < 2) return false;
    return (parseInt(mac.slice(0, 2), 16) & 0x02) !== 0;
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (filter !== "all" && a.rule_type !== filter) return false;
      const searchStr = (a.device_mac + a.message).toLowerCase();
      if (query && !searchStr.includes(query.toLowerCase())) return false;
      if (hideRandom && isRandomMac(a.device_mac ?? "") && a.rule_type !== "traffic_spike") return false;
      return true;
    });
  }, [alerts, filter, query, hideRandom]);

  const hiddenCount = useMemo(() => {
    return alerts.filter(a => hideRandom && isRandomMac(a.device_mac ?? "") && a.rule_type !== "traffic_spike").length;
  }, [alerts, hideRandom]);

  if (!open) return null;

  const baselineReady = summary?.baseline_ready ?? false;
  const schemaReady = status?.schema_ready !== false;

  return (
    <div
      onClick={onClose}
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
        role="dialog"
        aria-modal="true"
        aria-label="Pemantauan jaringan"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1000px, 100%)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: COLORS.bgPanel,
          border: `1px solid ${COLORS.line}`,
          borderRadius: "0px", // Square corners
          boxShadow: "0 24px 60px -24px rgba(43, 42, 39, 0.45)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "16px 20px",
            borderBottom: `1px solid ${COLORS.line}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <Activity size={20} strokeWidth={1.5} color={COLORS.inkSoft} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "16px", fontWeight: 500, color: COLORS.ink }}>Pemantauan jaringan</div>
              <div style={{ fontSize: "12px", color: COLORS.inkSoft }}>
                Pemindaian berkala dan perbandingan dengan baseline 30 hari
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={load}
              disabled={loading}
              style={{
                fontSize: "13px",
                padding: "7px 12px",
                borderRadius: "0px",
                border: `1px solid ${COLORS.line}`,
                backgroundColor: "transparent",
                color: COLORS.ink,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              Muat ulang
            </button>
            <button
              onClick={runNow}
              disabled={running}
              style={{
                fontSize: "13px",
                padding: "7px 12px",
                borderRadius: "0px",
                border: `1px solid ${COLORS.accent}`,
                backgroundColor: running ? "transparent" : COLORS.accent,
                color: running ? COLORS.inkSoft : "#fff",
                cursor: running ? "not-allowed" : "pointer",
              }}
            >
              Jalankan sekarang
            </button>
            <button
              onClick={onClose}
              style={{
                width: "32px",
                height: "32px",
                display: "grid",
                placeItems: "center",
                border: "none",
                backgroundColor: "transparent",
                color: COLORS.inkSoft,
                cursor: "pointer",
              }}
            >
              <X size={16} strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
          {error ? (
            <div style={{ fontSize: "12px", color: COLORS.statusOff, backgroundColor: "rgba(165, 67, 43, 0.08)", border: `1px solid ${COLORS.statusOff}`, borderRadius: "0px", padding: "8px 10px" }}>
              {error}
            </div>
          ) : null}

          {!schemaReady ? (
            <div style={{ fontSize: "12px", color: COLORS.ink, backgroundColor: "rgba(180, 83, 26, 0.08)", border: `1px solid ${COLORS.accent}`, borderRadius: "0px", padding: "9px 11px" }}>
              <div style={{ fontWeight: 600, color: COLORS.accent }}>Tabel pemantauan belum dibuat</div>
              <div style={{ marginTop: "3px", color: COLORS.inkSoft }}>Jalankan migration_monitoring.sql di Supabase.</div>
            </div>
          ) : null}

          {/* Verdict Banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 14px",
              backgroundColor: (status?.last_alert_count ?? 0) > 0 ? "rgba(180, 83, 26, 0.12)" : "rgba(63, 122, 87, 0.13)",
              borderLeft: `3px solid ${(status?.last_alert_count ?? 0) > 0 ? COLORS.accent : COLORS.statusOn}`,
              borderRadius: "0px",
            }}
          >
            <Activity size={18} color={(status?.last_alert_count ?? 0) > 0 ? COLORS.accent : COLORS.statusOn} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: "14px", color: COLORS.ink }}>
                {(status?.last_alert_count ?? 0) > 0
                  ? `Perlu perhatian: ${status?.last_alert_count ?? 0} temuan pada siklus terakhir`
                  : "Kondisi jaringan stabil"}
              </div>
              <div style={{ fontSize: "12px", color: COLORS.inkSoft }}>
                Siklus berjalan otomatis setiap {status ? Math.round(status.interval_seconds / 60) : "—"} menit.
              </div>
            </div>
            <div style={{ fontSize: "12px", color: COLORS.inkSoft, whiteSpace: "nowrap" }}>
              Dipindai {status?.last_run_at ? fmtTimeCompact(status.last_run_at).time : "—"}
            </div>
          </div>

          {/* KPI Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", border: `1px solid ${COLORS.line}` }}>
            <div style={{ padding: "12px 14px", borderRight: `1px solid ${COLORS.line}` }}>
              <small style={{ display: "block", fontSize: "12px", color: COLORS.inkSoft }}>Siklus terakhir</small>
              <b style={{ display: "block", fontSize: "20px", fontWeight: 500, margin: "2px 0 1px", color: COLORS.ink }}>
                {status?.last_run_at ? fmtTimeCompact(status.last_run_at).time : "—"}
              </b>
              <span style={{ fontSize: "12px", color: COLORS.inkSoft }}>
                {status?.last_run_at ? fmtTimeCompact(status.last_run_at).date : "—"}, selesai {status?.last_duration_seconds ?? "—"} dtk
              </span>
            </div>
            <div style={{ padding: "12px 14px", borderRight: `1px solid ${COLORS.line}` }}>
              <small style={{ display: "block", fontSize: "12px", color: COLORS.inkSoft }}>Interval</small>
              <b style={{ display: "block", fontSize: "20px", fontWeight: 500, margin: "2px 0 1px", color: COLORS.ink }}>
                {status ? `${Math.round(status.interval_seconds / 60)} menit` : "—"}
              </b>
              <span style={{ fontSize: "12px", color: COLORS.inkSoft }}>data disimpan {status?.retention_days ?? "—"} hari</span>
            </div>
            <div style={{ padding: "12px 14px", borderRight: `1px solid ${COLORS.line}` }}>
              <small style={{ display: "block", fontSize: "12px", color: COLORS.inkSoft }}>Baseline</small>
              <b style={{ display: "block", fontSize: "20px", fontWeight: 500, margin: "2px 0 1px", color: baselineReady ? COLORS.statusOn : COLORS.statusOff }}>
                {baselineReady ? "Siap" : "Belum siap"}
              </b>
              <span style={{ fontSize: "12px", color: COLORS.inkSoft }}>{status?.baseline_days ?? "—"} hari, minimal 24 jam</span>
            </div>
            <div style={{ padding: "12px 14px" }}>
              <small style={{ display: "block", fontSize: "12px", color: COLORS.inkSoft }}>Perangkat terlacak</small>
              <b style={{ display: "block", fontSize: "20px", fontWeight: 500, margin: "2px 0 1px", color: COLORS.ink }}>
                {status?.devices_tracked ?? "—"}
              </b>
              <span style={{ fontSize: "12px", color: COLORS.inkSoft }}>dalam snapshot terakhir</span>
            </div>
          </div>

          {/* Context Bar */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "12px", color: COLORS.inkSoft }}>
            <span style={{ padding: "3px 10px", border: `1px solid ${COLORS.line}`, borderRadius: "999px" }}>
              SSID <b style={{ fontWeight: 500, color: COLORS.ink, fontFamily: "monospace" }}>{status?.current_ssid || "—"}</b>
            </span>
            <span style={{ padding: "3px 10px", border: `1px solid ${COLORS.line}`, borderRadius: "999px" }}>
              BSSID <b style={{ fontWeight: 500, color: COLORS.ink, fontFamily: "monospace" }}>{status?.current_bssid || "—"}</b>
            </span>
            <span style={{ padding: "3px 10px", border: `1px solid ${COLORS.line}`, borderRadius: "999px" }}>
              Temuan siklus terakhir <b style={{ fontWeight: 500, color: COLORS.ink, fontFamily: "monospace" }}>{status?.last_alert_count ?? 0}</b>
            </span>
          </div>

          {/* Filter Tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
            <button
              onClick={() => setFilter(filter === "traffic_spike" ? "all" : "traffic_spike")}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "10px",
                padding: "12px 14px",
                border: `1px solid ${filter === "traffic_spike" ? COLORS.ink : COLORS.line}`,
                backgroundColor: "transparent",
                cursor: "pointer",
                textAlign: "left",
                borderRadius: "0px",
                boxShadow: filter === "traffic_spike" ? "inset 0 0 0 1px #1F1D1A" : "none",
              }}
            >
              <b style={{ fontSize: "22px", fontWeight: 500, color: COLORS.accent }}>{summary?.traffic_spikes.length ?? 0}</b>
              <span style={{ fontSize: "13px", color: COLORS.inkSoft }}>Lonjakan trafik</span>
            </button>
            <button
              onClick={() => setFilter(filter === "new_device" ? "all" : "new_device")}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "10px",
                padding: "12px 14px",
                border: `1px solid ${filter === "new_device" ? COLORS.ink : COLORS.line}`,
                backgroundColor: "transparent",
                cursor: "pointer",
                textAlign: "left",
                borderRadius: "0px",
                boxShadow: filter === "new_device" ? "inset 0 0 0 1px #1F1D1A" : "none",
              }}
            >
              <b style={{ fontSize: "22px", fontWeight: 500, color: COLORS.statusOn }}>{summary?.new_devices.length ?? 0}</b>
              <span style={{ fontSize: "13px", color: COLORS.inkSoft }}>Perangkat baru</span>
            </button>
            <button
              onClick={() => setFilter(filter === "device_disappeared" ? "all" : "device_disappeared")}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "10px",
                padding: "12px 14px",
                border: `1px solid ${filter === "device_disappeared" ? COLORS.ink : COLORS.line}`,
                backgroundColor: "transparent",
                cursor: "pointer",
                textAlign: "left",
                borderRadius: "0px",
                boxShadow: filter === "device_disappeared" ? "inset 0 0 0 1px #1F1D1A" : "none",
              }}
            >
              <b style={{ fontSize: "22px", fontWeight: 500, color: COLORS.ink }}>{summary?.disappeared_devices.length ?? 0}</b>
              <span style={{ fontSize: "13px", color: COLORS.inkSoft }}>Perangkat hilang</span>
            </button>
          </div>

          {/* Table Tools */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="search"
              placeholder="Cari MAC, IP, atau pesan"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                border: `1px solid ${COLORS.line}`,
                backgroundColor: "transparent",
                padding: "6px 12px",
                fontSize: "13px",
                width: "220px",
                borderRadius: "999px",
                color: COLORS.ink,
              }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={hideRandom}
                onChange={(e) => setHideRandom(e.target.checked)}
                style={{ position: "absolute", opacity: 0 }}
              />
              <div style={{
                width: "32px",
                height: "18px",
                borderRadius: "999px",
                backgroundColor: hideRandom ? COLORS.statusOn : COLORS.line,
                position: "relative",
                transition: "background 0.2s",
              }}>
                <div style={{
                  position: "absolute",
                  top: "2px",
                  left: hideRandom ? "14px" : "2px",
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  backgroundColor: COLORS.bgPanel,
                  transition: "transform 0.2s",
                }} />
              </div>
              Sembunyikan MAC acak
            </label>
            <span style={{ marginLeft: "auto", fontSize: "12px", color: COLORS.inkSoft }}>
              {hiddenCount > 0 ? `${hiddenCount} MAC acak disembunyikan` : ""}
            </span>
          </div>

          {/* Table */}
          <div style={{ border: `1px solid ${COLORS.line}`, maxHeight: "340px", overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: "13px" }}>
              <colgroup>
                <col style={{ width: "118px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "30%" }} />
                <col />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: COLORS.bgSubtle, color: COLORS.inkSoft, textAlign: "left" }}>
                  <th style={{ padding: "0 14px", fontWeight: 500, fontSize: "12px", height: "38px" }}>Waktu</th>
                  <th style={{ padding: "0 14px", fontWeight: 500, fontSize: "12px" }}>Jenis</th>
                  <th style={{ padding: "0 14px", fontWeight: 500, fontSize: "12px" }}>Perangkat</th>
                  <th style={{ padding: "0 14px", fontWeight: 500, fontSize: "12px" }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "28px", textAlign: "center", color: COLORS.inkSoft, fontSize: "13px" }}>
                      Tidak ada temuan yang cocok.
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.map((a, i) => {
                    const timeData = fmtTimeCompact(a.ts);
                    const isSpike = a.rule_type === "traffic_spike";

                    const currentVal = a.current_value ?? 100;
                    const baselineVal = a.baseline_value ?? 50;
                    const isBaselineSmall = baselineVal < 10;
                    const ratio = currentVal / baselineVal;
                    const pct = Math.min((baselineVal / currentVal) * 100, 100);

                    return (
                      <tr key={a.id ?? (a.rule_type + "-" + i)} style={{ borderTop: "1px solid " + COLORS.line }}>
                        <td style={{ padding: "10px 14px", color: COLORS.inkSoft }}>
                          <div style={{ lineHeight: "1.35" }}>
                            <b style={{ display: "block", color: COLORS.ink, fontWeight: 400, fontSize: "13px" }}>{timeData.time}</b>
                            {timeData.date}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{
                            fontSize: "13px",
                            color: isSpike ? COLORS.accent :
                                   a.rule_type === "new_device" ? COLORS.statusOn : COLORS.inkSoft,
                            fontWeight: 500,
                          }}>
                            {RULE_LABEL[a.rule_type] ?? a.rule_type}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ lineHeight: "1.35" }}>
                            <b style={{ fontWeight: 500, fontSize: "13px" }}>{a.message.split(" ")[0]}</b>
                            <small style={{ display: "block", fontFamily: "monospace", fontSize: "11.5px", color: COLORS.inkSoft }}>
                              {a.device_mac ?? "—"}
                            </small>
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {isSpike ? (
                            <div style={{ lineHeight: "1.4" }}>
                              <div>{currentVal} paket hari ini {isBaselineSmall ? <span style={{ fontSize: "11px", padding: "0 6px", borderRadius: "999px", backgroundColor: "rgba(180, 83, 26, 0.12)", color: COLORS.accent, marginLeft: "6px" }}>Tinjau</span> : ""}</div>
                              <small style={{ display: "block", fontSize: "12px", color: COLORS.inkSoft }}>
                                {isBaselineSmall
                                  ? "Baseline terlalu kecil (rata-rata " + baselineVal + " paket), rasio tidak ditampilkan"
                                  : ratio.toFixed(1) + "x rata-rata 7 hari (" + baselineVal + " paket)"}
                              </small>
                              {!isBaselineSmall && (
                                <div style={{ position: "relative", height: "5px", backgroundColor: "rgba(180, 83, 26, 0.12)", marginTop: "8px", marginBottom: "2px", maxWidth: "260px" }}>
                                  <div style={{ position: "absolute", inset: 0, backgroundColor: COLORS.accent, opacity: 0.55, width: pct + "%" }} />
                                  <div style={{ position: "absolute", top: "-3px", bottom: "-3px", width: "2px", backgroundColor: COLORS.ink, left: pct + "%" }} />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ fontSize: "13px", lineHeight: "1.4" }}>{a.message}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: COLORS.inkSoft, gap: "12px", flexWrap: "wrap" }}>
            <span>Menampilkan {filteredAlerts.length} baris dari {alerts.length} temuan</span>
            <span>MAC acak = alamat privat ponsel yang berganti-ganti, sering memicu temuan baru atau hilang yang palsu.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
