/**
 * Registry ruangan untuk denah.
 *
 * Sumber data sebenarnya ada di `backend/rooms.py` (BSSID + koordinat AP).
 * File ini hanya mendefinisikan bentuk datanya dan cara mengambilnya, supaya
 * saat daftar BSSID asli diisi, tidak ada yang perlu diubah di frontend.
 */

export interface RoomAp {
  id: string;
  label: string;
  /** Koordinat pada user unit SVG. null bila AP belum dipetakan. */
  x: number | null;
  y: number | null;
  /** False bila BSSID AP masih placeholder di backend/rooms.py. */
  has_bssid?: boolean;
}

export interface RoomInfo {
  id: string;
  label: string;
  /** Path gambar denah di folder public/, null bila belum tersedia. */
  floorplan: string | null;
  /** viewBox SVG, mis. "0 0 465 655". */
  view_box: string | null;
  aps: RoomAp[];
}

export interface RoomRegistry {
  rooms: RoomInfo[];
  current_room: string | null;
  current_ap: string | null;
  current_bssid: string;
}

const API_BASE = "http://localhost:8000";

/** Ambil registry dari backend. Mengembalikan null bila backend belum siap. */
export async function fetchRooms(signal?: AbortSignal): Promise<RoomRegistry | null> {
  try {
    const res = await fetch(`${API_BASE}/api/rooms`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<RoomRegistry>;
    if (!Array.isArray(data.rooms)) return null;
    return {
      rooms: data.rooms,
      current_room: data.current_room ?? null,
      current_ap: data.current_ap ?? null,
      current_bssid: data.current_bssid ?? "",
    };
  } catch {
    return null;
  }
}

/** Pecah "0 0 465 655" menjadi lebar/tinggi angka. */
export function parseViewBox(viewBox: string | null): { width: number; height: number } {
  const parts = (viewBox || "").trim().split(/\s+/).map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
    return { width: parts[2], height: parts[3] };
  }
  return { width: 465, height: 655 };
}
