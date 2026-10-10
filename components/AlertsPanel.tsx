"use client";

import React from 'react';
import { useNetwork } from '@/contexts/NetworkContext';

// Define Color mapping matching globals.css
const COLORS = {
  ink: "#1F1D1A",
  inkSoft: "#6B665C",
  accent: "#B4531A",
  statusOff: "#A5432B",
  statusOn: "#4A7A57",
  bgPanel: "#FAF8F3",
  line: "#DDD7C8",
};

export default function AlertsPanel() {
  const { alerts } = useNetwork();

  // Hanya render peringatan — parent (page.tsx) menangani struktur kartu keseluruhan
  // Fungsi ini dipanggil dari page.tsx, tapi tidak lagi digunakan di sini
  // Semua konten AlertsPanel sudah diintegrasikan ke dalam struktur slide 2 di page.tsx

  // Return null karena semua konten sudah di-inline di page.tsx
  return null;
}

