"use client";

import { Device } from "@/types/network";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  DEFAULT_CAP,
  EPHEMERAL_KINDS,
  NOTIF_CAPS,
  NOTIF_KINDS,
  type EventKind,
} from "@/lib/notifConfig";

export type { EventKind };

declare global {
  interface Window {
    /** Hanya tersedia di mode development untuk QA lewat console. */
    __simulateNetwork?: (kind: "new" | "offline" | "online", ip: string) => void;
  }
}

const STORAGE_KEY = "gakkum:notifications";
const COOLDOWN_DEVICE = 5000; // ms per IP/jenis

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

/** Kumpulan notifikasi per jenis — tiap jenis punya kumpulan dan batasnya sendiri. */
type NotifStore = Record<EventKind, NotifEvent[]>;

const COOLDOWN: Record<string, number> = {
  device_new: COOLDOWN_DEVICE,
  device_offline: COOLDOWN_DEVICE,
  device_online: COOLDOWN_DEVICE,
  device_no_response: COOLDOWN_DEVICE,
  arp_ok: COOLDOWN_DEVICE,
};

const now = () => Date.now();

const EPHEMERAL = new Set<EventKind>(EPHEMERAL_KINDS);

const emptyStore = (): NotifStore => {
  const store = {} as NotifStore;
  for (const kind of NOTIF_KINDS) store[kind] = [];
  return store;
};

/** Potong tiap jenis sesuai batasnya sendiri (jenis lain tidak tersentuh). */
const capStore = (store: NotifStore): NotifStore => {
  const capped = {} as NotifStore;
  for (const kind of NOTIF_KINDS) {
    capped[kind] = (store[kind] ?? []).slice(0, NOTIF_CAPS[kind] ?? DEFAULT_CAP);
  }
  return capped;
};

const isKnownKind = (value: unknown): value is EventKind =>
  typeof value === "string" && (NOTIF_KINDS as string[]).includes(value);

/**
 * useNetworkEvents — membandingkan snapshot devices tiap kali `devices` berubah
 * (hanya isi berubah, bukan referensi) dan menghasilkan NotifEvent bernuansa.
 *
 * Tidak mengubah NetworkContext/WebSocket/backend. Hanya konsumen pasif.
 */
export function useNetworkEvents(
  devices: Device[],
  isWsConnected: boolean,
  hasReceivedData: boolean,
  arpRepliesBatch?: { items: Array<{ ip: string; mac: string; ts: string; vendor: string }>; receivedAt: number } | null
) {
  // Satu kumpulan per jenis; tiap jenis dibatasi sendiri (lihat lib/notifConfig.ts)
  const [store, setStore] = useState<NotifStore>(emptyStore);

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
        const parsed = JSON.parse(stored) as unknown;
        const loaded = emptyStore();
        if (Array.isArray(parsed)) {
          // Format lama: satu array datar berisi semua jenis.
          for (const ev of parsed as NotifEvent[]) {
            if (!ev || !isKnownKind(ev.type) || EPHEMERAL.has(ev.type)) continue;
            loaded[ev.type].push(ev);
          }
        } else if (parsed && typeof parsed === "object") {
          const byKind = parsed as Record<string, unknown>;
          for (const kind of NOTIF_KINDS) {
            if (EPHEMERAL.has(kind)) continue;
            const list = byKind[kind];
            if (Array.isArray(list)) loaded[kind] = list as NotifEvent[];
          }
        }
        // Memuat state persist sekali di mount (tidak bisa lewat initializer
        // karena akan menyebabkan hydration mismatch saat SSR).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStore(capStore(loaded));
      }
    } catch {
      /* ignore corrupt storage */
    }
    // reset baseline flag per sesi
    baselineRef.current = sessionStorage.getItem("gakkum:baseline") === null ? false : true;
    if (!baselineRef.current) sessionStorage.setItem("gakkum:baseline", "1");
  }, []);

  // --- Tulis persist saat kumpulan berubah (arp_ok tidak disimpan) ---
  useEffect(() => {
    if (!initializedRef.current) return;
    if (typeof window === "undefined") return;
    try {
      const persisted: Partial<Record<EventKind, NotifEvent[]>> = {};
      for (const kind of NOTIF_KINDS) {
        if (EPHEMERAL.has(kind)) continue;
        persisted[kind] = store[kind];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      /* quota/etc — abaikan */
    }
  }, [store]);

  const emit = useCallback((ev: NotifEvent) => {
    const kind = ev.type;
    const cap = NOTIF_CAPS[kind] ?? DEFAULT_CAP;

    // arp_ok tidak memakai cooldown (volumenya tinggi, hanya di memori)
    if (kind !== "arp_ok") {
      const key = `${kind}:${ev.ip}`;
      const last = cooldownRef.current.get(key);
      if (last !== undefined && now() - last < (COOLDOWN[kind] ?? COOLDOWN_DEVICE)) return;
      cooldownRef.current.set(key, now());
    }

    setStore((prev) => {
      const sameKind = prev[kind];
      // dedup: hapus yang lama dengan id sama, prepend baru, buang yang tertua
      const filtered = sameKind.filter((n) => n.id !== ev.id);
      return { ...prev, [kind]: [ev, ...filtered].slice(0, cap) };
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

      // ARP activity kini datang dari pesan WebSocket "arp_replies"
      // (lihat processArpReplies); tidak lagi disimpulkan dari last_seen.

      // identitas singkat perangkat untuk baris detail
      const identity = (d: Device) =>
        `${d.hostname || d.mac}${d.vendor ? ` - ${d.vendor}` : ""}`;

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
              title: `${d.ip} sedang kondisi offline`,
              detail: identity(d),
              ts: now(),
              dotColor: "off",
            });
          } else if (d.status === "UP") {
            emit({
              id: `device_online:${d.ip}`,
              type: "device_online",
              ip: d.ip,
              title: `${d.ip} kembali online`,
              detail: identity(d),
              ts: now(),
              dotColor: "on",
            });
          }
        }
      }

      // devices yang hilang dari snapshot → tidak merespons
      for (const ip of prevMap.keys()) {
        if (!byIp.has(ip)) {
          emit({
            id: `device_no_response:${ip}`,
            type: "device_no_response",
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
    setStore(emptyStore());
    prevSnapshotRef.current.clear();
    cooldownRef.current.clear();
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // --- merge list untuk render: gabung semua jenis, terbaru di atas ---
  const displayList = useCallback((): NotifEvent[] => {
    const all: NotifEvent[] = [];
    for (const kind of NOTIF_KINDS) all.push(...store[kind]);
    return all.sort((a, b) => b.ts - a.ts);
  }, [store]);

  // --- dev: simulasi via window ---
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    window.__simulateNetwork = (kind: "new" | "offline" | "online", ip: string) => {
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
          is_self: false,
        });
      }
      // trigger proses lagi
      processSnapshot([...devs]);
    };
    return () => {
      // cleanup global
      delete window.__simulateNetwork;
    };
  }, [processSnapshot]);

  // --- ARP REPLIES: satu setStore untuk seluruh batch, satu kali per pesan ---
  useEffect(() => {
    // tidak ada data atau baseline belum lewat → skip (first snapshot tidak menghasilkan notifikasi ARP)
    if (!arpRepliesBatch || !baselineRef.current) return;

    const { items, receivedAt } = arpRepliesBatch;
    const nowTs = now();
    // abaikan pesan lebih tua dari 2 siklus (2 * 4s ≈ 8000 ms)
    const MAX_AGE_MS = 8000;
    const valid = items.filter(
      item => {
        const itemTs = new Date(item.ts).getTime();
        return nowTs - itemTs <= MAX_AGE_MS;
      }
    );

    if (valid.length === 0) return;

    // buat notifikasi arp_ok untuk setiap item yang valid (maks 200 per pesan)
    const toEmit: NotifEvent[] = valid.slice(0, 200).map((item, index) => ({
      // ID unik: gabungkan receivedAt dan index agar tidak tabrak dalam batch yang sama
      id: `arp_ok:${item.ip}:${receivedAt}:${index}`,
      type: "arp_ok",
      ip: item.ip,
      title: `Berhasil ARP pada ${item.ip}`,
      detail: `${item.mac} - ${item.vendor || 'Vendor tidak diketahui'}`,
      ts: receivedAt, // gunakan waktu penerimaan WS agar urutan sesuai dengan broadcast
      dotColor: "on",
      mac: item.mac,
      vendor: item.vendor,
    }));

    // Sinkronkan data ARP dari WS ke state React (skenario yang tepat untuk
    // setState di dalam effect per dokumentasi resmi react.dev).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStore(prev => {
      const kind = "arp_ok";
      const cap = NOTIF_CAPS[kind] ?? DEFAULT_CAP;
      const sameKind = prev[kind];
      // gabungkan baru + lama, buang yang tertua sesuai cap
      const combined = [...toEmit, ...sameKind];
      return { ...prev, [kind]: combined.slice(0, cap) };
    });
  }, [arpRepliesBatch]);

  return { notifications: displayList(), clearEvents };
}
