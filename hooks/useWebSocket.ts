import { useState, useEffect, useRef } from 'react';
import { Device } from '../types/network';

const WS_URL = 'ws://localhost:8000/ws/network-monitor?api_key=GAKKUM_SECRET_KEY';

export function useWebSocket() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [metrics, setMetrics] = useState({ total_up: 0, total_down: 0, server_ip: 'Unknown' });
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    connect();

    return () => {
      ws.current?.close();
    };
  }, []);

  const connect = () => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data && typeof data === 'object') {
          if (data.type === "DEVICE_UPDATE") {
            if (Array.isArray(data.devices)) setDevices(data.devices);
            if (data.metrics) setMetrics(data.metrics);
          } else if (Array.isArray(data)) {
            setDevices(data);
          }
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message', err);
      }
    };

    ws.current.onclose = () => {
      setTimeout(connect, 3000);
    };
  };

  return { devices, metrics };
}
