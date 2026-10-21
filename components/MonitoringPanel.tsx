"use client";

import React, { useCallback, useEffect, useState } from "react";
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

function fmtTime(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function StatTile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: "140px",
        padding: "10px 12px",
        border: `1px solid ${COLORS.line}`,
        borderRadius: "8px",
        backgroundColor: COLORS.bgSubtle,
      }}
    >
      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: COLORS.inkSoft }}>
        {label}
      </div>
      <div style={{ fontSize: "16px", fontWeight: 600, color: COLORS.ink, marginTop: "4px" }}>{value}</div>
      {hint ? <div style={{ fontSize: "10px", color: COLORS.inkFaint, marginTop: "2px" }}>{hint}</div> : null}
    </div>
  );
}

function SectionCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: "8px", backgroundColor: COLORS.bgSubtle, padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: COLORS.ink }}>{title}</span>
        <span style={{ fontSize: "11px", color: COLORS.inkSoft, fontFamily: "monospace" }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

export default function MonitoringPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          width: "min(880px, 100%)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: COLORS.bgPanel,
          border: `1px solid ${COLORS.line}`,
          borderRadius: "10px",
          boxShadow: "0 20px 60px rgba(31, 29, 26, 0.25)",
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
            padding: "14px 18px",
            borderBottom: `1px solid ${COLORS.line}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <Activity size={18} strokeWidth={1.5} color={COLORS.inkSoft} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "15px", fontWeight: 600, color: COLORS.ink }}>Pemantauan Jaringan</div>
              <div style={{ fontSize: "11px", color: COLORS.inkSoft }}>
                Snapshot berkala + perbandingan terhadap baseline 30 hari
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              onClick={load}
              disabled={loading}
              aria-label="Muat ulang"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                padding: "5px 9px",
                borderRadius: "6px",
                border: `1px solid ${COLORS.line}`,
                backgroundColor: COLORS.bgSubtle,
                color: COLORS.inkSoft,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCw size={13} strokeWidth={1.7} /> Muat ulang
            </button>
            <button
              onClick={runNow}
              disabled={running}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                padding: "5px 9px",
                borderRadius: "6px",
                border: `1px solid ${COLORS.accent}`,
                backgroundColor: running ? COLORS.bgSubtle : COLORS.accent,
                color: running ? COLORS.inkSoft : "#FAF8F3",
                cursor: running ? "not-allowed" : "pointer",
              }}
            >
              <Play size={13} strokeWidth={1.7} /> {running ? "Menjalankan…" : "Jalankan sekarang"}
            </button>
            <button
              onClick={onClose}
              aria-label="Tutup"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "transparent",
                color: COLORS.inkSoft,
                cursor: "pointer",
              }}
            >
              <X size={17} strokeWidth={1.7} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "14px 18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
          {error ? (
            <div
              style={{
                fontSize: "12px",
                color: COLORS.statusOff,
                backgroundColor: "rgba(165, 67, 43, 0.08)",
                border: `1px solid ${COLORS.statusOff}`,
                borderRadius: "6px",
                padding: "8px 10px",
              }}
            >
              {error}
              <div style={{ marginTop: "4px", color: COLORS.inkSoft }}>
                Pastikan tabel pemantauan sudah dibuat: jalankan <code>schema/migration_monitoring.sql</code> di SQL Editor Supabase.
              </div>
            </div>
          ) : null}

          {!schemaReady ? (
            <div
              style={{
                fontSize: "12px",
                color: COLORS.ink,
                backgroundColor: "rgba(180, 83, 26, 0.08)",
                border: `1px solid ${COLORS.accent}`,
                borderRadius: "6px",
                padding: "9px 11px",
              }}
            >
              <div style={{ fontWeight: 600, color: COLORS.accent }}>Tabel pemantauan belum dibuat</div>
              <div style={{ marginTop: "3px", color: COLORS.inkSoft }}>
                Jalankan <code>schema/migration_monitoring.sql</code> di SQL Editor Supabase, lalu tekan
                &ldquo;Muat ulang&rdquo;. Selama tabel belum ada, siklus tetap berjalan tetapi tidak ada riwayat
                yang tersimpan.
              </div>
              {status?.schema_error ? (
                <div style={{ marginTop: "4px", fontFamily: "monospace", fontSize: "10px", color: COLORS.inkSoft }}>
                  {status.schema_error}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Status tiles */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <StatTile
              label="Siklus terakhir"
              value={status?.last_run_at ? fmtTime(status.last_run_at) : "belum jalan"}
              hint={status?.last_duration_seconds != null ? `${status.last_duration_seconds}s · ${status.runs} siklus` : undefined}
            />
            <StatTile
              label="Interval"
              value={status ? `${Math.round(status.interval_seconds / 60)} menit` : "—"}
              hint={status ? `retensi ${status.retention_days} hari` : undefined}
            />
            <StatTile
              label="Baseline"
              value={
                <span style={{ color: baselineReady ? COLORS.statusOn : COLORS.statusOff }}>
                  {baselineReady ? "Siap" : "Belum siap"}
                </span>
              }
              hint={status ? `${status.baseline_days} hari · butuh ≥24 jam` : undefined}
            />
            <StatTile
              label="Terlacak"
              value={status?.devices_tracked ?? "—"}
              hint={
                status
                  ? `snapshot ${status.last_snapshot_devices} · aktivitas ${status.last_activity_devices}`
                  : undefined
              }
            />
          </div>

          {/* SSID/BSSID context */}
          <div style={{ fontSize: "11px", color: COLORS.inkSoft, fontFamily: "monospace" }}>
            SSID: {status?.current_ssid || "—"} · BSSID: {status?.current_bssid || "—"} · Temuan siklus terakhir:{" "}
            {status?.last_alert_count ?? 0}
          </div>

          {status?.last_error ? (
            <div style={{ fontSize: "11px", color: COLORS.statusOff }}>Error terakhir: {status.last_error}</div>
          ) : null}

          {schemaReady && !baselineReady ? (
            <div
              style={{
                fontSize: "11px",
                color: COLORS.inkSoft,
                backgroundColor: COLORS.bgSubtle,
                border: `1px dashed ${COLORS.line}`,
                borderRadius: "6px",
                padding: "8px 10px",
              }}
            >
              Aturan yang membandingkan dengan baseline (perangkat baru, perangkat hilang, lonjakan trafik) baru aktif
              setelah snapshot tertua berumur ≥ 24 jam. Aturan latensi dan perubahan BSSID sudah berjalan sekarang.
            </div>
          ) : null}

          {/* Summary sections */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "8px" }}>
            <SectionCard title="Perangkat baru" count={summary?.new_devices.length ?? 0}>
              {summary?.new_devices.length ? (
                <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "11px", color: COLORS.ink, fontFamily: "monospace" }}>
                  {summary.new_devices.slice(0, 8).map((d) => (
                    <li key={d.mac}>
                      {d.mac} {d.ip ? `· ${d.ip}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ fontSize: "11px", color: COLORS.inkFaint }}>Tidak ada</div>
              )}
            </SectionCard>

            <SectionCard title="Perangkat hilang" count={summary?.disappeared_devices.length ?? 0}>
              {summary?.disappeared_devices.length ? (
                <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "11px", color: COLORS.ink, fontFamily: "monospace" }}>
                  {summary.disappeared_devices.slice(0, 8).map((d) => (
                    <li key={d.mac}>
                      {d.mac} · {fmtTime(d.last_seen)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ fontSize: "11px", color: COLORS.inkFaint }}>Tidak ada</div>
              )}
            </SectionCard>

            <SectionCard title="Lonjakan trafik" count={summary?.traffic_spikes.length ?? 0}>
              {summary?.traffic_spikes.length ? (
                <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "11px", color: COLORS.ink, fontFamily: "monospace" }}>
                  {summary.traffic_spikes.slice(0, 8).map((d, i) => (
                    <li key={`${d.device_mac}-${i}`}>{d.device_mac}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ fontSize: "11px", color: COLORS.inkFaint }}>Tidak ada</div>
              )}
            </SectionCard>
          </div>

          {/* Alerts history */}
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: COLORS.inkSoft,
                marginBottom: "6px",
              }}
            >
              Riwayat temuan
            </div>
            {loading && alerts.length === 0 ? (
              <div style={{ fontSize: "11px", color: COLORS.inkFaint }}>Memuat…</div>
            ) : alerts.length === 0 ? (
              <div style={{ fontSize: "11px", color: COLORS.inkFaint }}>Belum ada temuan tercatat.</div>
            ) : (
              <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: "8px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ backgroundColor: COLORS.bgSubtle, color: COLORS.inkSoft, textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 500 }}>Waktu</th>
                      <th style={{ padding: "6px 8px", fontWeight: 500 }}>Aturan</th>
                      <th style={{ padding: "6px 8px", fontWeight: 500 }}>MAC</th>
                      <th style={{ padding: "6px 8px", fontWeight: 500 }}>Pesan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a, i) => (
                      <tr key={a.id ?? `${a.rule_type}-${i}`} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                        <td style={{ padding: "6px 8px", color: COLORS.inkSoft, whiteSpace: "nowrap" }}>{fmtTime(a.ts)}</td>
                        <td style={{ padding: "6px 8px", color: SEVERITY_COLOR[a.severity] ?? COLORS.ink, whiteSpace: "nowrap" }}>
                          {RULE_LABEL[a.rule_type] ?? a.rule_type}
                        </td>
                        <td style={{ padding: "6px 8px", color: COLORS.ink, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                          {a.device_mac ?? "—"}
                        </td>
                        <td style={{ padding: "6px 8px", color: COLORS.ink }}>{a.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
