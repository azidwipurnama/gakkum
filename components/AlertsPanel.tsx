"use client";

import React, { useState } from 'react';
import { useNetwork } from '@/contexts/NetworkContext';

// Define Color mapping matching globals.css
const COLORS = {
  ink: "#1F1D1A",
  inkSoft: "#6B665C",
  accent: "#B4531A",
  statusOff: "#A5432B",
  bgPanel: "#FAF8F3",
  line: "#DDD7C8",
};

export default function AlertsPanel() {
  const { alerts } = useNetwork();
  const [handled, setHandled] = useState<Set<string>>(new Set());

  const handleMarkHandled = (id: string) => {
    setHandled((prev) => new Set(prev).add(id));
  };

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--line)] rounded-[var(--radius-card)] p-6 space-y-4" style={{ backgroundColor: COLORS.bgPanel, borderColor: COLORS.line }}>
      <h2 className="text-[15px] font-sans font-medium text-[var(--ink)]">Alerts ({alerts.length})</h2>
      <div className="max-h-[40vh] overflow-y-auto space-y-2">
        {alerts.length === 0 ? (
          <p className="text-[var(--ink-soft)] text-sm">No active alerts.</p>
        ) : (
          alerts.map((alert: any) => (
            <div key={alert.id} className={`p-3 rounded border ${handled.has(alert.id) ? 'opacity-50' : ''}`} style={{ borderColor: COLORS.line }}>
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold uppercase" style={{ color: alert.severity === 'critical' ? COLORS.statusOff : COLORS.accent }}>
                    {alert.severity}
                </span>
                {!handled.has(alert.id) && (
                    <button onClick={() => handleMarkHandled(alert.id)} className="text-[10px] underline" style={{ color: COLORS.inkSoft }}>
                        Mark Resolved
                    </button>
                )}
              </div>
              <p className="text-sm mt-1">{alert.reason}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
