'use client';

import { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { LayoutDashboard, Wifi, Server, Laptop, Search } from 'lucide-react';
import { Device } from '../types/network';
import { RadarVisualizer } from '../components/RadarVisualizer';
import CyberGlobeBg from '../components/CyberGlobeBg';

export default function Dashboard() {
  const { devices, metrics } = useWebSocket();
  const [activeTab, setActiveTab] = useState<'overview' | 'inspector'>('overview');
  const [search, setSearch] = useState('');

  const safeDevices = Array.isArray(devices) ? devices : [];

  const filteredDevices = safeDevices.filter(d =>
    (d.hostname?.toLowerCase().includes(search.toLowerCase()) ||
    d.mac?.toLowerCase().includes(search.toLowerCase()) ||
    d.ip?.toLowerCase().includes(search.toLowerCase()))
  );

  const countUp = safeDevices.filter(d => d.status === 'UP').length;
  const countDown = safeDevices.filter(d => d.status === 'DOWN').length;

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-slate-900/35 backdrop-blur-md border border-slate-800/50 rounded-xl p-5">
      {children}
    </div>
  );

  const ServerConnectionCard = () => (
    <Card>
      <h2 className="text-slate-400 mb-2 flex items-center gap-2"><Server size={18}/> Server Connection</h2>
      <p className="text-sm">IP: {metrics.server_ip || '...'}</p>
      <p className="text-sm">Room: Gakkum-1</p>
    </Card>
  );

  const DeviceMetricsCard = () => (
    <Card>
      <h2 className="text-slate-400 mb-2 flex items-center gap-2"><Wifi size={18}/> Device Metrics</h2>
      <div className="flex gap-4">
        <span className="text-emerald-500 font-bold">{countUp} UP</span>
        <span className="text-red-500 font-bold">{countDown} DOWN</span>
      </div>
    </Card>
  );

  const RadarCard = () => (
    <Card>
      <h2 className="text-slate-400 mb-2 flex items-center gap-2"><Laptop size={18}/> Radar Visualizer</h2>
      <div className="flex items-center justify-center p-4">
        <RadarVisualizer devices={safeDevices} />
      </div>
    </Card>
  );

  const DeviceInspectorTable = ({ devices }: { devices: Device[] }) => (
    <table className="w-full text-sm text-left">
      <thead className="text-slate-400 border-b border-slate-800">
        <tr>
          <th className="py-3 px-4">Hostname</th>
          <th className="py-3 px-4">Vendor</th>
          <th className="py-3 px-4">IP Address</th>
          <th className="py-3 px-4">MAC</th>
          <th className="py-3 px-4">Category</th>
          <th className="py-3 px-4">Location</th>
          <th className="py-3 px-4">Last Active</th>
          <th className="py-3 px-4">Status</th>
        </tr>
      </thead>
      <tbody>
        {filteredDevices.map((d: Device) => (
          <tr key={d.mac} className="border-b border-slate-800">
            <td className="py-2 px-4 font-medium">{d.hostname || 'N/A'}</td>
            <td className="py-2 px-4 text-slate-400">{d.vendor || 'N/A'}</td>
            <td className="py-2 px-4">{d.ip || 'N/A'}</td>
            <td className="py-2 px-4">{d.mac}</td>
            <td className="py-2 px-4">
              <span className={`px-2 py-1 rounded text-xs font-medium`}>
                {d.category}
              </span>
            </td>
            <td className="py-2 px-4">{d.location || '-'}</td>
            <td className="font-mono text-xs text-slate-300 py-2 px-4">
              {d.last_seen ? d.last_seen.replace('T', ' ') : '-'}
            </td>
            <td className="py-2 px-4">
              <span className={`px-2 py-1 rounded text-xs ${d.status === 'UP' ? 'bg-emerald-900' : 'bg-red-900'}`}>
                {d.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <main className="relative min-h-screen bg-transparent text-white overflow-x-hidden">
      <CyberGlobeBg />
      <div className="relative z-10 p-6">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2"><LayoutDashboard /> Wing C Gakkum Monitor</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded font-medium ${activeTab === 'overview' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('inspector')}
              className={`px-4 py-2 rounded font-medium ${activeTab === 'inspector' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}
            >
              Device Inspector
            </button>
          </div>
        </header>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-4 flex flex-col gap-4">
              <ServerConnectionCard />
              <DeviceMetricsCard />
            </div>
            <div className="col-span-8">
              <RadarCard />
            </div>
          </div>
        )}

        {activeTab === 'inspector' && (
          <div className="w-full bg-slate-900/30 backdrop-blur-md border border-slate-800/50 rounded-xl p-6">
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-semibold">Device Inspector</h2>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 text-slate-500" size={16}/>
                <input
                  type="text"
                  placeholder="Search..."
                  className="bg-slate-800 pl-8 pr-4 py-2 rounded text-sm w-64"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <DeviceInspectorTable devices={safeDevices} />
          </div>
        )}
      </div>
    </main>
  );
}
