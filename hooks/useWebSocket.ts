import { useState, useEffect, useRef, useCallback } from 'react';
import { Device } from '../types/network';
import { RoomInfo } from '../lib/rooms';

const WS_URL = 'ws://localhost:8000/ws/network-monitor?api_key=GAKKUM_SECRET_KEY';

export interface ArpReplyItem {
  ip: string;
  mac: string;
  ts: string;
  vendor: string;
  receivedAt?: number;
}

export function useWebSocket() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [metrics, setMetrics] = useState({ total_up: 0, total_down: 0, server_ip: 'Unknown' });
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  const [ssid, setSsid] = useState<string>('Initializing...');
  const [loading, setLoading] = useState<boolean>(true);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [hasReceivedData, setHasReceivedData] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [arpRepliesBatch, setArpRepliesBatch] = useState<{ items: ArpReplyItem[]; receivedAt: number } | null>(null);
  // Konteks ruangan: diisi backend dari BSSID AP yang sedang dipakai host.
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [currentAp, setCurrentAp] = useState<string | null>(null);
  const [currentBssid, setCurrentBssid] = useState<string>('');

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);
  const attemptRef = useRef<number>(0);
  const connectRef = useRef<() => void>(() => {});
  // Penanda bahwa effect sudah di-cleanup (komponen dilepas / StrictMode
  // double-mount): koneksi yang ditutup setelah itu tidak boleh reconnect.
  const disposedRef = useRef(false);

  const connect = useCallback(() => {
    // Bersihkan timer reconnect yang tertunda supaya tidak ada dua jalur
    // connect yang berjalan dan saling menutup koneksi satu sama lain.
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    // Tutup koneksi lama secara sengaja. Socket yang digantikan ini akan
    // tetap menerima event onclose, tetapi diabaikan karena bukan lagi
    // koneksi aktif (lihat guard socket !== ws.current di bawah).
    if (ws.current) {
      try {
        ws.current.onclose = null;
        ws.current.close();
      } catch {
        /* koneksi mungkin sudah mati — abaikan */
      }
      ws.current = null;
    }

    console.log(`Mencoba koneksi ke: ${WS_URL} (Attempt ${attemptRef.current + 1})`);
    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      console.log("✅ WS Connected to Python Backend");
      setIsWsConnected(true);
      setError(null);
      attemptRef.current = 0; // Reset backoff on successful connection
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data && typeof data === 'object') {
          setHasReceivedData(true);
          setLoading(false);

          if (data.type === 'DEVICE_UPDATE' || data.type === 'UPDATE') {
            if (Array.isArray(data.devices)) setDevices(data.devices);
            if (data.metrics) setMetrics(data.metrics);
            if (data.ssid) setSsid(data.ssid);
            if (Array.isArray(data.rooms)) setRooms(data.rooms);
            if ('current_room' in data) setCurrentRoom(data.current_room ?? null);
            if ('current_ap' in data) setCurrentAp(data.current_ap ?? null);
            if (typeof data.current_bssid === 'string') setCurrentBssid(data.current_bssid);
          } else if (data.type === 'arp_replies') {
            if (Array.isArray(data.data)) {
              setArpRepliesBatch({
                items: data.data,
                receivedAt: Date.now(),
              });
            }
          } else if (data.type === 'ALERT') {
            setAlerts((prev) => [data.data, ...prev].slice(0, 50));
          } else if (Array.isArray(data)) {
            setDevices(data);
          }
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message', err);
        setError('Parse error');
      }
    };

    ws.current.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('Connection error');
      setLoading(false);
      setIsWsConnected(false);
    };

    ws.current.onclose = () => {
      // Abaikan penutupan milik koneksi lama yang sudah digantikan
      // connect(), atau saat komponen sudah dilepas. Tanpa ini, socket
      // lama ikut menjadwalkan reconnect, saling menutup koneksi aktif,
      // dan indikator Terhubung/Tidak terhubung berkedip tiap detik.
      if (socket !== ws.current || disposedRef.current) {
        return;
      }
      setSsid('Connection Error');
      setIsWsConnected(false);

      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }

      // Exponential backoff: min(30s, 1s * 2^attempt) + jitter ±20%
      const backoff = Math.min(30000, 1000 * Math.pow(2, attemptRef.current));
      const jitter = backoff * 0.2 * (Math.random() * 2 - 1);
      const delay = Math.max(1000, backoff + jitter);

      console.warn(`WS closed. Reconnecting in ${Math.round(delay)}ms...`);

      attemptRef.current += 1;
      reconnectTimeout.current = window.setTimeout(() => {
        connectRef.current?.();
      }, delay);
    };
  }, []);

  useEffect(() => {
    connectRef.current = connect;
    disposedRef.current = false;
    connect();

    return () => {
      disposedRef.current = true;
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      if (ws.current) {
        try {
          ws.current.onclose = null;
          ws.current.onerror = null;
          ws.current.onmessage = null;
          ws.current.close();
        } catch {
          /* abaikan */
        }
        ws.current = null;
      }
    };
  }, [connect]);

  return {
    devices,
    metrics,
    alerts,
    ssid,
    loading,
    error,
    isWsConnected,
    hasReceivedData,
    arpRepliesBatch,
    rooms,
    currentRoom,
    currentAp,
    currentBssid,
  };
}
