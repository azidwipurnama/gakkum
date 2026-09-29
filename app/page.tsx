'use client';

import { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { LayoutDashboard, Wifi, Server, Laptop, Search } from 'lucide-react';
import { Device } from '../types/network';

export default function Dashboard() {
  const devices = useWebSocket();
  const [search, setSearch] = useState('');

  const safeDevices = Array.isArray(devices) ? devices : [];

  const filteredDevices = safeDevices.filter(d =>
    (d.hostname?.toLowerCase().includes(search.toLowerCase()) ||
    d.mac?.toLowerCase().includes(search.toLowerCase()) ||
    d.ip?.toLowerCase().includes(search.toLowerCase()))
  );

  const countUp = safeDevices.filter(d => d.status === 'UP').length;
  const countDown = safeDevices.filter(d => d.status === 'DOWN').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* ... (rest of the layout remains same) ... */}
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><LayoutDashboard /> Wing C Gakkum Monitor</h1>
      </header>

      <section className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-900 p-6 rounded-lg border border-slate-800">
           <h2 className="text-slate-400 mb-2 flex items-center gap-2"><Server size={18}/> Server Connection</h2>
           <p className="text-sm">IP: 192.168.1.100 | Room: Gakkum-1</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-lg border border-slate-800">
           <h2 className="text-slate-400 mb-2 flex items-center gap-2"><Wifi size={18}/> Device Metrics</h2>
           <div className="flex gap-4">
              <span className="text-emerald-500 font-bold">{countUp} UP</span>
              <span className="text-red-500 font-bold">{countDown} DOWN</span>
           </div>
        </div>
        <div className="bg-slate-900 p-6 rounded-lg border border-slate-800">
           <h2 className="text-slate-400 mb-2 flex items-center gap-2"><Laptop size={18}/> Radar</h2>
           <div className="h-16 bg-slate-800 rounded flex items-center justify-center text-slate-500 text-xs">Radar UI Placeholder</div>
        </div>
      </section>

      <section className="bg-slate-900 p-6 rounded-lg border border-slate-800">
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
        <table className="w-full text-sm text-left">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-2">Hostname</th>
              <th className="py-2">IP Address</th>
              <th className="py-2">MAC</th>
              <th className="py-2">Location</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.map((d: Device) => (
              <tr key={d.mac} className="border-b border-slate-800">
                <td className="py-2 font-medium">{d.hostname || 'N/A'}</td>
                <td className="py-2">{d.ip || 'N/A'}</td>
                <td className="py-2">{d.mac}</td>
                <td className="py-2">{d.location || '-'}</td>
                <td className="py-2">
                  <span className={`px-2 py-1 rounded text-xs ${d.status === 'UP' ? 'bg-emerald-900' : 'bg-red-900'}`}>
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
