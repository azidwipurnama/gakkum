import { useState, useEffect, useRef } from 'react';
import { Device } from '../types/network';

const WS_URL = 'ws://localhost:8000/ws/network-monitor?api_key=GAKKUM_SECRET_KEY';

export function useWebSocket() {
  const [devices, setDevices] = useState<Device[]>([]);
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
      console.log("[DEBUG FRONTEND] Message received from WS:", event.data);
      try {
        const data = JSON.parse(event.data);

        // Safeguard data handling
        if (data && typeof data === 'object') {
          if (data.type === "DEVICE_UPDATE" && Array.isArray(data.devices)) {
            setDevices(data.devices);
          } else if (Array.isArray(data)) {
            setDevices(data);
          } else {
            console.warn('Received unexpected WebSocket data format', data);
          }
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message', err);
      }
    };

    ws.current.onclose = () => {
      console.warn('[DEBUG FRONTEND] WS Disconnected, reconnecting...');
      setTimeout(connect, 3000); // Auto-reconnect
    };
  };

  return devices;
}
