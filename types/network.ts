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
}
