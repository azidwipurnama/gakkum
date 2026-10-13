"use client";

import { Device } from "@/types/network";
import { useEffect, useRef, useState, useCallback } from "react";

const STORAGE_KEY = "gakkum:notifications";
const COOLDOWN_DEVICE = 5000; // ms per IP/jenis
const COOLDOWN_ARP = 5000; // ms antar update arp_activity

export type EventKind =
  | "scan_baseline"
  | "device_new"
  | "device_offline"
  | "arp_ok";

export interface NotifEvent {
  id: string; // stable unique key: `${type}:${ip}`
  type: EventKind;
  ip: string;
  title: string;
  detail: string;
  ts: number;
  dotColor: "on" | "off" | "warn" | "info";
  mac?: string;
  vendor?: string;
}

// Retensi terpisah
const ARP_MAX_EVENTS = 100;
const IMPORTANT_MAX_EVENTS = 100;

const COOLDOWN: Record<string, number> = {
  device_new: COOLDOWN_DEVICE,
  device_offline: COOLDOWN_DEVICE,
  arp_ok: COOLDOWN_DEVICE,
};

const now = () => Date.now();

/**
 * useNetworkEvents — membandingkan snapshot devices tiap kali `devices` berubah
 * (hanya isi berubah, bukan referensi) dan menghasilkan NotifEvent bernuansa.
 *
 * Tidak mengubah NetworkContext/WebSocket/backend. Hanya konsumen pasif.
 */
export function useNetworkEvents(
  devices: Device[],
  isWsConnected: boolean,
  hasReceivedData: boolean
) {
  const [importantNotifications, setImportantNotifications] = useState<NotifEvent[]>([]);
  const [arpNotifications, setArpNotifications] = useState<NotifEvent[]>([]);

  // persist: load sekali di mount
  const initializedRef = useRef(false);
  // baseline hanya sekali per sesi browser
  const baselineRef = useRef(false);
  // cooldown tracker: key → ts terakhir emit
  const cooldownRef = useRef<Map<string, number>>(new Map());
  // snapshot sebelumnya (IP → status + last_seen)
  const prevSnapshotRef = useRef<Map<string, { status: string; last_seen: string }>>(new Map());
  // current devices snapshot (untuk __simulateNetwork)
  const devicesSnapshotRef = useRef<Device[]>([]);

  // --- Load persist di mount (hindari race condition) ---
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as NotifEvent[];
        if (Array.isArray(parsed)) setImportantNotifications(parsed);
      }
    } catch {
      /* ignore corrupt storage */
    }
    // reset baseline flag per sesi
    baselineRef.current = sessionStorage.getItem("gakkum:baseline") === null ? false : true;
    if (!baselineRef.current) sessionStorage.setItem("gakkum:baseline", "1");
  }, []);

  // --- Tulis persist saari importantNotifications berubah ---
  useEffect(() => {
    if (!initializedRef.current) return;
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(importantNotifications));
    } catch {
      /* quota/etc — abaikan */
    }
  }, [importantNotifications]);

  const emit = useCallback((ev: NotifEvent) => {
    if (ev.type === "arp_ok") {
      setArpNotifications((prev) => [ev, ...prev].slice(0, ARP_MAX_EVENTS));
      return;
    }

    const key = `${ev.type}:${ev.ip}`;
    const last = cooldownRef.current.get(key);
    if (last !== undefined && now() - last < (COOLDOWN[ev.type] ?? COOLDOWN_DEVICE)) return;
    cooldownRef.current.set(key, now());
    setImportantNotifications((prev) => {
      // dedup: hapus yang lama dengan id sama, prepend baru
      const filtered = prev.filter((n) => n.id !== ev.id);
      return [ev, ...filtered].slice(0, IMPORTANT_MAX_EVENTS);
    });
  }, []);

  // --- Diff snapshot devices → emit event ---
  const processSnapshot = useCallback(
    (devs: Device[]) => {
      devicesSnapshotRef.current = devs;
      const prev = prevSnapshotRef.current;
      const prevMap = new Map(prev);
      const byIp = new Map<string, Device>();
      for (const d of devs) byIp.set(d.ip, d);

      // ARP activity: kumpulkan semua yang last_seen berubah
      let changedDevices: Device[] = [];
      for (const d of devs) {
        const prevEntry = prevMap.get(d.ip);
        if (!prevEntry || prevEntry.last_seen !== d.last_seen) {
          // Hanya jika sesi baseline sudah lewat (dihindarkan emit saat awal)
          if (baselineRef.current && prevEntry) {
            changedDevices.push(d);
          }
        }
      }

      // Emit untuk semua yang berubah (maks 200 per snapshot)
      const sorted = [...changedDevices].sort(
        (a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
      );

      sorted.slice(0, 200).forEach(d => {
        if (d.status === "UP") {
          emit({
            id: `arp_ok:${d.ip}:${now()}`, // ID harus unik per kejadian
            type: "arp_ok",
            ip: d.ip,
            title: `Berhasil ARP pada ${d.ip}`,
            detail: `${d.mac} - ${d.vendor || 'Vendor tidak diketahui'}`,
            ts: now(),
            dotColor: "on",
            mac: d.mac,
            vendor: d.vendor,
          });
        }
      });

      // emit perangkat event (penting)
      for (const d of devs) {
        const prevEntry = prevMap.get(d.ip);
        if (!prevEntry) {
          if (d.status === "UP" && baselineRef.current) {
            emit({
              id: `device_new:${d.ip}`,
              type: "device_new",
              ip: d.ip,
              title: `${d.ip} (${d.hostname || d.mac})`,
              detail: "Perangkat baru terhubung",
              ts: now(),
              dotColor: "on",
            });
          }
        } else if (prevEntry.status !== d.status) {
          if (d.status === "DOWN") {
            emit({
              id: `device_offline:${d.ip}`,
              type: "device_offline",
              ip: d.ip,
              title: `${d.ip} (${d.hostname || d.mac})`,
              detail: "Perangkat offline",
              ts: now(),
              dotColor: "off",
            });
          }
        }
      }

      // devices yang hilang dari snapshot → offline
      for (const [ip, prevEntry] of prevMap) {
        if (!byIp.has(ip)) {
          emit({
            id: `device_offline:${ip}`,
            type: "device_offline",
            ip,
            title: ip,
            detail: "Perangkat tidak merespons",
            ts: now(),
            dotColor: "off",
          });
        }
      }

      // simpan snapshot baru
      const newSnap = new Map<string, { status: string; last_seen: string }>();
      for (const d of devs) newSnap.set(d.ip, { status: d.status, last_seen: d.last_seen });
      prevSnapshotRef.current = newSnap;
    },
    [emit]
  );

  // --- Reaksi: WS terhubung + data pertama → baseline sekali ---
  useEffect(() => {
    if (!isWsConnected || !hasReceivedData || devices.length === 0) return;
    if (baselineRef.current) {
      // sudah pernah baseline → proses snapshot diff biasa
      processSnapshot(devices);
      return;
    }
    baselineRef.current = true;
    const count = devices.length;
    emit({
      id: `scan_baseline:`,
      type: "scan_baseline",
      ip: "",
      title: "Pemindai terhubung",
      detail: `${count} perangkat ditemukan`,
      ts: now(),
      dotColor: "info",
    });
    // inisialisasi snapshot supaya tidak emit device_new beramai-rama
    const snap = new Map<string, { status: string; last_seen: string }>();
    for (const d of devices) snap.set(d.ip, { status: d.status, last_seen: d.last_seen });
    prevSnapshotRef.current = snap;
  }, [isWsConnected, hasReceivedData, devices, emit, processSnapshot]);

  // --- clearEvents (hapus semua + persist bersih) ---
  const clearEvents = useCallback(() => {
    setImportantNotifications([]);
    setArpNotifications([]);
    prevSnapshotRef.current.clear();
    cooldownRef.current.clear();
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // --- merge list untuk render ---
  const displayList = useCallback((): NotifEvent[] => {
    return [...arpNotifications, ...importantNotifications].sort((a, b) => b.ts - a.ts).slice(0, 100);
  }, [arpNotifications, importantNotifications]);

  // --- dev: simulasi via window ---
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    (window as any).__simulateNetwork = (kind: "new" | "offline" | "online", ip: string) => {
      // memanipulasi salinan lokal devices yang terakhir masuk ke snapshot ref.
      // Ini hanya untuk QA console, tidak tersimpan ke localStorage.
      const devs = devicesSnapshotRef.current;
      if (!devs || devs.length === 0 || !ip) {
        console.warn("[__simulateNetwork] belum ada snapshot devices");
        return;
      }
      const idx = devs.findIndex((d) => d.ip === ip);
      let changed = false;
      if (idx >= 0) {
        const d = { ...devs[idx] };
        if (kind === "offline") {
          d.status = "DOWN";
          changed = true;
        } else if (kind === "online") {
          d.status = "UP";
          d.last_seen = new Date().toISOString();
          changed = true;
        }
      }
      if (!changed && kind === "new" && idx < 0) {
        devs.push({
          mac: "00:00:00:00:00:00",
          ip,
          hostname: "sim-dev",
          category: "Laptop",
          vendor: "SimVendor",
          location: "",
          last_seen: new Date().toISOString(),
          status: "UP",
          is_blacklisted: false,
        });
      }
      // trigger proses lagi
      processSnapshot([...devs]);
    };
    return () => {
      // cleanup global
      delete (window as any).__simulateNetwork;
    };
  }, [processSnapshot]);

  return { notifications: displayList(), clearEvents, emit };
}
