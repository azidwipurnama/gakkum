"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { Device } from '../types/network';
import { RoomInfo } from '../lib/rooms';

interface NetworkContextType {
  devices: Device[];
  metrics: { total_up: number; total_down: number; server_ip: string };
  alerts: Record<string, unknown>[];
  ssid: string;
  loading: boolean;
  error: string | null;
  isWsConnected: boolean;
  hasReceivedData: boolean;
  arpRepliesBatch?: { items: Array<{ ip: string; mac: string; ts: string; vendor: string }>; receivedAt: number } | null;
  rooms: RoomInfo[];
  currentRoom: string | null;
  currentAp: string | null;
  currentBssid: string;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const networkData = useWebSocket();
  return (
    <NetworkContext.Provider value={networkData}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
