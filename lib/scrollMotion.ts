// Scroll-motion derivation helpers.
// Reads the CSS variable --scroll-progress from the stage element (set by useScrollProgress)
// and returns { transform, opacity, ariaHidden, inert } for each element.
//
// Per ATURAN KERAS: transform & opacity only.
// Elements fall back to static layout when data-motion="on" is absent (the hook removes it
// on unmount / when p is invalid). All elements stay visible and usable without JS.

import { scrollMotionConfig as cfg, Segment } from "./scrollMotion.config";

const { smoothstep, seg, offsets } = cfg;

export interface ElementMotionState {
  transform: string;           // CSS transform string (translate / scale)
  opacity: number;             // 0..1
  ariaHidden: boolean;         // true when opacity ~ 0 (screen readers skip)
  inert: boolean;              // set via attribute (polyfill if needed)
}

/** Read raw progress from stage element's CSS variable. Returns clamped 0..1. */
export function readProgress(stageEl: HTMLElement | null): number {
  if (!stageEl) return 0;
  let raw = stageEl.style.getPropertyValue("--scroll-progress");
  if (!raw) return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Standard enter-only motion: element is at rest (translated out) before segment, at zero after.
 * translateStart: offset at segment start (e.g. -30px); translateEnd: final (0,0).
 * fadeIn: true = opacity ramps 0→1 across segment.
 */
function enterMotion(
  p: number,
  seg_: Segment,
  translateStart: { x: number; y: number },
  fadeIn = true
): ElementMotionState {
  const e = seg(p, seg_.a, seg_.b);
  const eEase = smoothstep(e);

  // Translate from start offset toward (0,0)
  const tx = (1 - eEase) * translateStart.x;
  const ty = (1 - eEase) * translateStart.y;
  const opacity = fadeIn ? eEase : 1;

  return {
    transform: `translate(${tx}px, ${ty}px)`,
    opacity,
    ariaHidden: opacity < 0.01,
    inert: opacity < 0.01,
  };
}

/** Radar card: enters 0.26-0.42 from top-left (-30px x, +14px y) */
export function radarMotion(p: number): ElementMotionState {
  return enterMotion(p, cfg.segments.radar, { x: offsets.radar.x, y: offsets.radar.y });
}

/** Alerts card: enters 0.31-0.47 from bottom (+26px translateY) */
export function alertsMotion(p: number): ElementMotionState {
  return enterMotion(p, cfg.segments.alerts, { x: 0, y: offsets.alerts.y });
}

/** Device inspector: enters 0.38-0.56 from bottom (+50px translateY) */
export function deviceInspectorMotion(p: number): ElementMotionState {
  return enterMotion(p, cfg.segments.deviceInspector, { x: 0, y: offsets.deviceInspector.y });
}

/** Scroll hint text: fades out 0.00-0.10 via translateY, slides up slightly */
export function scrollHintMotion(p: number): ElementMotionState {
  const e = seg(p, cfg.segments.scrollHint.a, cfg.segments.scrollHint.b);
  const eEase = smoothstep(e);
  const opacity = 1 - eEase;
  const translateY = -eEase * offsets.scrollHint.y;
  return {
    transform: `translateY(${translateY}px)`,
    opacity,
    ariaHidden: opacity < 0.5 ? false : true, // keep readable until half-faded
    inert: false,
  };
}

/**
 * Two-dot scroll-progress indicator for the right edge.
 * - Top dot: active indicator, slides down as progress 0→1
 * - Bottom dot: static end marker
 * Both fade in over 0.00-0.16, then stay visible (opacity 1) until end.
 */
export function scrollProgressDotsMotion(p: number): { opacity: number } {
  const e = seg(p, cfg.segments.scrollProgressDots.a, cfg.segments.scrollProgressDots.b);
  const eEase = smoothstep(e);
  return { opacity: eEase };
}

/**
 * Globe motion: 0.12-0.50 animates scale & opacity, and translates the globe
 * from page-1 center toward the empty column-3 in page-2.
 * The container already has base positioning (left:50%, top:48%, translate(-50%,-50%)).
 * This function returns an ADDITIONAL translate offset to stack on top in the RAF loop.
 *
 * Page-2 target: globe center lands in the middle of col-3, vertical-middle of first row.
 * Page-1 size: min(74vh, 560px, 92vw).  Page-2 end scale ~0.65, opacity ≥0.92.
 * Mobile (<800px): scale ~0.4, opacity 0.5, behind cards.
 *
 * Page-2 globe size: 90% of first-row height, clamped 260-400px.
 * First-row height = clamp(260px, 36vh, 340px).
 */
export function globeMotion(p: number): { translate: string; scale: number; opacity: number } {
  const e = seg(p, cfg.segments.globeMove.a, cfg.segments.globeMove.b);
  const eEase = smoothstep(e);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 720;
  const isMobile = vw < cfg.breakpoints.mobileWidth;

  // Scale
  const scale = isMobile
    ? 1 - eEase * (1 - offsets.globe.scaleTargetMobile)
    : 1 - eEase * (1 - offsets.globe.scaleTarget);

  // Opacity
  const opacity = isMobile
    ? 1 - eEase * (1 - offsets.globe.opacityTargetMobile)
    : 1 - eEase * (1 - offsets.globe.opacityTarget);

  // Translate from center (page-1) toward center-of-col-3 (page-2).
  // Col-3 starts after col-1 (minmax 220-300) + col-2 (minmax 200-260) + 2 gaps (12px each).
  const col1w = Math.min(300, Math.max(220, vw * 0.28));       // approx
  const col2w = Math.min(260, Math.max(200, vw * 0.22));        // approx
  const gap = cfg.layout.columnGapPx;
  const col3Left = col1w + gap + col2w + gap;
  const col3Width = vw - col3Left;
  const col3CenterX = col3Left + col3Width / 2;

  // Vertical: middle of first row (approx at 20% from top of page2)
  const targetX = col3CenterX - vw / 2;  // additional translate from center
  const targetY = (vh * 0.20) - vh / 2;   // additional translate from center down slightly to first row

  const tx = eEase * targetX;
  const ty = eEase * targetY;

  return {
    translate: `translate(${tx}px, ${ty}px)`,
    scale,
    opacity,
  };
}

/**
 * Compute the page-2 globe target size: 90% of the first-row height,
 * where first-row height = clamp(260px, 36vh, 340px).  Clamped 260-400px.
 */
export function globePage2Size(): number {
  const vh = typeof window !== "undefined" ? window.innerHeight : 720;
  const g = cfg.offsets.globe;
  const row1H = Math.max(g.page2Row1HeightMin, Math.min(g.page2Row1HeightMax, vh * g.page2Row1HeightVh / 100));
  return Math.max(g.globeSizeMin, Math.min(g.globeSizeMax, row1H * g.globeSizeRatio));
}

/**
 * Table row staggered entry.
 * Row i begins entering at start + i*perRow, each with a left-translate fade.
 * Max maxVisible rows stagger; beyond that still visible.
 */
export function tableRowMotion(rowIndex: number, p: number): ElementMotionState {
  if (rowIndex >= cfg.segments.tableRows.maxVisible) {
    return { transform: "none", opacity: 1, ariaHidden: false, inert: false };
  }
  // Each row: enter from -10px translateX, starts at 0.50 + i*0.012
  const enterStart = cfg.segments.tableRows.start + rowIndex * cfg.segments.tableRows.perRow;
  const enterEnd = enterStart + 0.12; // ~0.12 progress for each row to fully appear
  const e = seg(p, enterStart, enterEnd);
  const eEase = smoothstep(e);
  const translateX = (1 - eEase) * offsets.tableRow.x; // -10 → 0
  const opacity = eEase;
  return {
    transform: `translateX(${translateX}px)`,
    opacity,
    ariaHidden: opacity < 0.01,
    inert: opacity < 0.01,
  };
}
