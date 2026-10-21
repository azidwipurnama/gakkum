export type DeviceStatus = 'UP' | 'DOWN';

export interface Device {
  mac: string;
  ip: string; // Add if available from backend
  hostname: string;
  category: string; // Router, Printer, Smartphone, Laptop, etc.
  vendor: string; // Manufacturer name
  location: string; // Room mapping
  last_seen: string; // ISO format
  status: DeviceStatus;
  latency?: number; // Latency in ms
  is_blacklisted: boolean; // Restriction status
  is_self: boolean; // True if this is the host machine running the scanner
}

export interface NetworkAddressItem {
  address: string;
  last_seen: string;
}

export interface NetworkProtocolItem {
  name: string;
  packets: number;
  last_seen: string;
}

export interface NetworkConnectionItem {
  protocol: string;
  direction: 'outbound' | 'inbound' | 'listening';
  local_port: number | null;
  remote_address: string;
  remote_port: number | null;
  packets: number;
  last_seen: string;
}

export interface DeviceNetworkDetails {
  mac: string;
  captured_at: string;
  window_seconds: number;
  source: 'passive' | 'passive+host';
  ipv4: NetworkAddressItem[];
  ipv6: NetworkAddressItem[];
  protocols: NetworkProtocolItem[];
  connections: NetworkConnectionItem[];
}

