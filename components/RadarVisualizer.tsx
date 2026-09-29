'use client';

import React, { useEffect, useRef } from 'react';
import { Device } from '../types/network';

interface RadarVisualizerProps {
  devices: Device[];
}

export const RadarVisualizer: React.FC<RadarVisualizerProps> = ({ devices }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(centerX, centerY) - 10;

    let angle = 0;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw background circles
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      [0.2, 0.4, 0.6, 0.8].forEach((r) => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, maxRadius * r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Draw center icon
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Scan line
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + maxRadius * Math.cos(angle),
        centerY + maxRadius * Math.sin(angle)
      );
      ctx.stroke();

      // Draw devices
      devices.forEach((device) => {
        // Deterministic position based on MAC
        const hash = device.mac.split(':').reduce((acc, val) => acc + parseInt(val, 16), 0);
        const deviceAngle = (hash % 360) * (Math.PI / 180);
        const radiusFactor = device.status === 'UP' ? 0.3 + (hash % 30) / 100 : 0.7 + (hash % 20) / 100;
        const r = maxRadius * radiusFactor;

        const x = centerX + r * Math.cos(deviceAngle);
        const y = centerY + r * Math.sin(deviceAngle);

        // Color logic
        let color = '#EF4444'; // default DOWN red
        if (device.status === 'UP') color = '#22C55E';
        if (device.category === 'Router / AP' || device.category === 'Printer') color = '#EAB308';

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing effect simple implementation
        const pulse = Math.sin(Date.now() / 300) * 2 + 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 4 + pulse, 0, Math.PI * 2);
        ctx.stroke();
      });

      angle += 0.02;
      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [devices]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      className="bg-slate-800 rounded-full"
    />
  );
};
