import { useState, useEffect, useRef, useCallback } from 'react';
import { Device } from '../types/network';

const WS_URL = 'ws://localhost:8000/ws/network-monitor?api_key=GAKKUM_SECRET_KEY';

export function useWebSocket() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [metrics, setMetrics] = useState({ total_up: 0, total_down: 0, server_ip: 'Unknown' });
  const [ssid, setSsid] = useState<string>('Initializing...');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log("✅ WS Connected to Python Backend");
      setLoading(false);
      setError(null);
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📩 Received WS Data:", data);

        if (data && typeof data === 'object') {
          if (data.type === 'DEVICE_UPDATE' || data.type === 'UPDATE') {
            // Pass full device list without filtering — backend already validates IPs
            if (Array.isArray(data.devices)) setDevices(data.devices);
            if (data.metrics) setMetrics(data.metrics);
            if (data.ssid) setSsid(data.ssid);
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
    };

    ws.current.onclose = () => {
      setSsid('Connection Error');
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      reconnectTimeout.current = window.setTimeout(() => connectRef.current?.(), 3000);
    };
  }, []);

  useEffect(() => {
    connectRef.current = connect;
    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      ws.current?.close();
    };
  }, [connect]);

  return { devices, metrics, ssid, loading, error };
}
