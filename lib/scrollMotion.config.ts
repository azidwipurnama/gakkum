// Centralized scroll-motion configuration.
export type Segment = { a: number; b: number };

export interface ScrollMotionConfig {
  wrapperHeightVh: number;
  smoothstep: (p: number) => number;
  seg: (p: number, a: number, b: number) => number;
  smoothingFactor: number;
  smoothingEpsilon: number;
  reducedMotionFactor: number;
  segments: {
    scrollHint: Segment;
    radar: Segment;
    radarOut: Segment;
    alerts: Segment;
    deviceInspector: Segment;
    tableRows: { start: number; perRow: number; maxVisible: number; fadeInEnd: number };
    globeStage1: Segment;
    globeStage2: Segment;
  };
  offsets: {
    scrollHint: { y: number };
    radarIn: { x: number };
    radarOut: { x: number };
    alertsIn: { x: number; y: number };
    deviceInspector: { y: number };
    tableRow: { x: number };
  };
  globe: {
    baseRotationSpeed: number;
    scrollBoostMin: number;
    scrollBoostExtra: number;
    scaleStep1: number;
    scaleStep2Desktop: number;
    scaleStep2Mobile: number;
    opacityStep2: number;
    moveXStep1: number;
    moveXStep2Desktop: number;
    moveXStep2MobileFactor: number;
    moveYStep2: number;
  };
  breakpoints: { mobileWidth: number };
  layout: { cardRadiusPx: number; cardPaddingPx: [number, number]; columnGapPx: number; leftColumnInsetPx: number };
}

const smoothstep = (p: number): number => Math.max(0, Math.min(1, p * p * (3 - 2 * p)));
const seg = (p: number, a: number, b: number): number => Math.max(0, Math.min(1, (p - a) / (b - a)));

export const scrollMotionConfig: ScrollMotionConfig = {
  wrapperHeightVh: 420,
  smoothstep,
  seg,
  smoothingFactor: 0.1,
  smoothingEpsilon: 0.0002,
  reducedMotionFactor: 1,
  segments: {
    scrollHint: { a: 0.0, b: 0.1 },
    radar: { a: 0.16, b: 0.32 },
    radarOut: { a: 0.5, b: 0.62 },
    alerts: { a: 0.3, b: 0.42 },
    deviceInspector: { a: 0.58, b: 0.76 },
    tableRows: { start: 0.64, perRow: 0.012, maxVisible: 10, fadeInEnd: 0.74 },
    globeStage1: { a: 0.14, b: 0.34 },
    globeStage2: { a: 0.56, b: 0.78 },
  },
  offsets: {
    scrollHint: { y: -10 },
    radarIn: { x: 40 },
    radarOut: { x: -24 },
    alertsIn: { x: -30, y: 16 },
    deviceInspector: { y: 60 },
    tableRow: { x: 10 },
  },
  globe: {
    baseRotationSpeed: 0.004,
    scrollBoostMin: 0.03,
    scrollBoostExtra: 3,
    scaleStep1: 0.08,
    scaleStep2Desktop: 0.42,
    scaleStep2Mobile: 0.50,
    opacityStep2: 0.3,
    moveXStep1: 0.16,
    moveXStep2Desktop: 0.42,
    moveXStep2MobileFactor: 0.3,
    moveYStep2: 0.20,
  },
  breakpoints: { mobileWidth: 800 },
  layout: { cardRadiusPx: 14, cardPaddingPx: [14, 16], columnGapPx: 12, leftColumnInsetPx: 0 },
};

export const CSS_VARS = {
  progress: '--scroll-progress',
  motionOn: 'data-motion',
} as const;
