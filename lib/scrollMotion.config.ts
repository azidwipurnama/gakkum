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
    scrollHint: Segment;           // 0.00-0.10: "Scroll down" hint fades out
    scrollProgressDots: Segment;   // 0.00-0.16: two-dot indicator fades in
    globeMove: Segment;            // 0.12-0.50: globe moves to top-right corner
    serverConn: Segment;           // 0.26-0.42: Server connection card enters (from left)
    alerts: Segment;               // 0.31-0.47: Alerts card enters (from left-up)
    radar: Segment;                // 0.36-0.52: Radar card enters (from bottom)
    deviceInspector: Segment;      // 0.41-0.60: Device inspector enters (from bottom)
    tableRows: {
      start: number;               // 0.50: first row begins
      perRow: number;              // 0.012: stagger per row
      maxVisible: number;          // max rows to stagger
    };
  };
  offsets: {
    scrollHint: { y: number };
    serverConn: { x: number };
    alerts: { x: number; y: number };
    radar: { y: number };
    deviceInspector: { y: number };
    tableRow: { x: number };
    globe: {
      scaleTarget: number;         // 0.52 — target scale
      opacityTarget: number;      // 0.35 — target opacity
      moveX: number;               // 40px from right edge
      moveY: number;               // 40px from top edge
      sizePx: number;              // 300px diameter
    };
  };
  breakpoints: { mobileWidth: number };
  layout: {
    cardRadiusPx: number;
    cardPaddingPx: [number, number];
    columnGapPx: number;
    gridInset: string;             // clamp(16px, 3vw, 36px)
    col1Minmax: string;            // minmax(220px, 300px)
    col2Minmax: string;            // minmax(200px, 260px)
  };
}

const smoothstep = (p: number): number => Math.max(0, Math.min(1, p * p * (3 - 2 * p)));
const seg = (p: number, a: number, b: number): number => Math.max(0, Math.min(1, (p - a) / (b - a)));

export const scrollMotionConfig: ScrollMotionConfig = {
  wrapperHeightVh: 260,
  smoothstep,
  seg,
  smoothingFactor: 0.1,
  smoothingEpsilon: 0.0002,
  reducedMotionFactor: 1,
  segments: {
    scrollHint: { a: 0.0, b: 0.10 },
    scrollProgressDots: { a: 0.0, b: 0.16 },
    globeMove: { a: 0.12, b: 0.50 },
    serverConn: { a: 0.26, b: 0.42 },
    alerts: { a: 0.31, b: 0.47 },
    radar: { a: 0.36, b: 0.52 },
    deviceInspector: { a: 0.41, b: 0.60 },
    tableRows: { start: 0.50, perRow: 0.012, maxVisible: 10 },
  },
  offsets: {
    scrollHint: { y: -10 },
    serverConn: { x: -30 },
    alerts: { x: -30, y: 14 },
    radar: { y: 26 },
    deviceInspector: { y: 50 },
    tableRow: { x: 10 },
    globe: {
      scaleTarget: 0.52,
      opacityTarget: 0.35,
      moveX: 40,   // px from right edge
      moveY: 40,   // px from top edge
      sizePx: 300,
    },
  },
  breakpoints: { mobileWidth: 800 },
  layout: {
    cardRadiusPx: 14,
    cardPaddingPx: [14, 16],
    columnGapPx: 12,
    gridInset: "clamp(16px, 3vw, 36px)",
    col1Minmax: "minmax(220px, 300px)",
    col2Minmax: "minmax(200px, 260px)",
  },
};

export const CSS_VARS = {
  progress: '--scroll-progress',
  motionOn: 'data-motion',
} as const;
