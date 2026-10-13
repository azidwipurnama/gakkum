/**
 * Konfigurasi notifikasi: daftar jenis kejadian dan batas jumlah simpanan
 * per jenis. Modul ini tidak bergantung pada hook/komponen mana pun supaya
 * bisa diubah tanpa menyentuh logika pembuat notifikasi.
 */

export type EventKind =
  | "scan_baseline"
  | "device_new"
  | "device_offline"
  | "device_online"
  | "device_no_response"
  | "arp_ok";

/** Batas bawaan untuk jenis yang tidak didaftarkan khusus. */
export const DEFAULT_CAP = 50;

/**
 * Batas per jenis. Tiap jenis menyimpan kumpulannya sendiri dan hanya
 * membuang item TERTUA dari jenisnya sendiri saat melewati batas.
 * Total maksimal seluruh jenis: 100 + (5 x 50) = 350.
 */
export const NOTIF_CAPS: Record<EventKind, number> = {
  arp_ok: 100,
  device_offline: 50,
  device_online: 50,
  device_new: DEFAULT_CAP,
  device_no_response: DEFAULT_CAP,
  scan_baseline: DEFAULT_CAP,
};

/** Seluruh jenis, urutan tetap agar iterasi selalu sama. */
export const NOTIF_KINDS: EventKind[] = [
  "scan_baseline",
  "device_new",
  "device_offline",
  "device_online",
  "device_no_response",
  "arp_ok",
];

/** Jenis yang hanya hidup di memori dan tidak ditulis ke localStorage. */
export const EPHEMERAL_KINDS: EventKind[] = ["arp_ok"];
