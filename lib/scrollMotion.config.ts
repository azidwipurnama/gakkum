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
    globeMove: Segment;            // 0.12-0.50: globe moves to page-2 col-3 center
    radar: Segment;                // 0.26-0.42: Radar enters from top-left
    alerts: Segment;               // 0.31-0.47: Alerts enters from bottom
    deviceInspector: Segment;      // 0.38-0.56: Device inspector enters from bottom
    tableRows: {
      start: number;               // 0.46: first row begins
      perRow: number;              // 0.012: stagger per row
      maxVisible: number;          // max rows to stagger
    };
  };
  offsets: {
    scrollHint: { y: number };
    radar: { x: number; y: number };    // Radar enter from top-left (-30, +14)
    alerts: { y: number };              // Alerts enter from bottom (+26)
    deviceInspector: { y: number };
    tableRow: { x: number };
    globe: {
      scaleTarget: number;
      opacityTarget: number;
      moveX: number;
      moveY: number;
      sizePx: number;
      sizeMaxPx: number;
      sizeMinPx: number;
      opacityTargetMobile: number;
      scaleTargetMobile: number;
      // Page-2 target sizing: 90% of first-row height, clamped 260-400px
      page2Row1HeightVh: number;     // 36vh
      page2Row1HeightMin: number;    // 260px
      page2Row1HeightMax: number;    // 340px
      globeSizeRatio: number;        // 0.9 (90% of row height)
      globeSizeMin: number;          // 260px
      globeSizeMax: number;          // 400px
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
    // First row height: clamp(260px, 36vh, 340px)
    row1Height: string;
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
    radar: { a: 0.26, b: 0.42 },        // Radar enters 0.26-0.42 (top-left: -30x, +14y)
    alerts: { a: 0.31, b: 0.47 },       // Alerts enters 0.31-0.47 (from bottom: +26y)
    deviceInspector: { a: 0.38, b: 0.56 },
    tableRows: { start: 0.46, perRow: 0.012, maxVisible: 10 },
  },
  offsets: {
    scrollHint: { y: -10 },
    radar: { x: -30, y: 14 },   // Radar masuk dari kiri-atas
    alerts: { y: 26 },          // Alerts masuk dari bawah
    deviceInspector: { y: 50 }, // Inspector masuk dari bawah
    tableRow: { x: 10 },
    globe: {
      scaleTarget: 0.65,
      opacityTarget: 0.92,
      moveX: 40,
      moveY: 40,
      sizePx: 300,
      sizeMaxPx: 400,
      sizeMinPx: 260,
      // Page-2 target sizing: globe = 90% of first-row height, clamped 260-400px
      page2Row1HeightVh: 36,
      page2Row1HeightMin: 260,
      page2Row1HeightMax: 340,
      globeSizeRatio: 0.9,
      globeSizeMin: 260,
      globeSizeMax: 400,
      opacityTargetMobile: 0.5,
      scaleTargetMobile: 0.4,
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
    // First row height: clamp(260px, 36vh, 340px)
    row1Height: "clamp(260px, 36vh, 340px)",
  },
};

export const CSS_VARS = {
  progress: '--scroll-progress',
  motionOn: 'data-motion',
} as const;
