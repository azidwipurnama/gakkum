"use client";

import React, { useState, useEffect } from 'react';
import CyberGlobeBg from './CyberGlobeBg';
import { useNetwork } from '../contexts/NetworkContext';

const COLORS = {
  ink: "#1F1D1A",
  inkSoft: "#6B665C",
  inkFaint: "#B8B1A0",
  accent: "#B4531A",
  statusOn: "#4A7A57",
  statusOff: "#A5432B",
  bgPage: "#E8E3D8",
  bgPanel: "#FAF8F3",
  bgSubtle: "#F1EDE3",
  line: "#DDD7C8",
};

const LOADING_STEPS = [
  { id: 'init', label: 'Inisialisasi sistem...' },
  { id: 'ws', label: 'Menghubungkan ke monitor...' },
  { id: 'data', label: 'Menerima data network...' },
];

export default function LoadingUI({ onFinished }: { onFinished: () => void }) {
  const { isWsConnected, hasReceivedData } = useNetwork();
  const [currentStep, setCurrentStep] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    let step = 0;
    if (hasReceivedData) step = 2;
    else if (isWsConnected) step = 1;

    setCurrentStep(step);

    if (step === 2) {
      setTimeout(() => {
        setIsTransitioning(true);
        setTimeout(onFinished, 700); // Wait for transition

      }, 500);
    }
  }, [isWsConnected, hasReceivedData, onFinished]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500" style={{ backgroundColor: COLORS.bgPage, opacity: isTransitioning ? 0 : 1 }}>
      <div className={`relative z-10 w-full max-w-md flex flex-col items-center transition-transform duration-700 ease-out ${isTransitioning ? 'scale-[0.25]' : 'scale-100'}`}>
        <CyberGlobeBg className="opacity-80" style={{ position: 'relative', width: '500px', height: '500px' }} />

        <div className={`mt-8 w-64 space-y-4 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
          <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.line }}>
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${(currentStep + 1) * 33.3}%`, backgroundColor: COLORS.accent }}
            />
          </div>
          <p className="text-center text-sm font-mono" style={{ color: COLORS.inkSoft }}>
            {LOADING_STEPS[currentStep].label}
          </p>
        </div>
      </div>
    </div>
  );
}
