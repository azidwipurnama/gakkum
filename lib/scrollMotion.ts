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

/** Server connection card: enters 0.26-0.42 from left (-30px translateX) */
export function serverConnMotion(p: number): ElementMotionState {
  return enterMotion(p, cfg.segments.serverConn, { x: -30, y: 0 });
}

/** Alerts card: enters 0.31-0.47 from left-up (-30px x, +14px y) */
export function alertsMotion(p: number): ElementMotionState {
  return enterMotion(p, cfg.segments.alerts, { x: offsets.alerts.x, y: offsets.alerts.y });
}

/** Radar card: enters 0.36-0.52 from bottom (+26px translateY) */
export function radarMotion(p: number): ElementMotionState {
  return enterMotion(p, cfg.segments.radar, { x: 0, y: offsets.radar.y });
}

/** Device inspector: enters 0.41-0.60 from bottom (+50px translateY) */
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
 * Globe motion: 0.12-0.50 moves to top-right corner at scale 0.52, opacity 0.35.
 * Rotation continues throughout.
 */
export function globeMotion(p: number): { transform: string; opacity: number } {
  const e = seg(p, cfg.segments.globeMove.a, cfg.segments.globeMove.b);
  const eEase = smoothstep(e);

  // Scale: 1 → 0.52
  const scale = 1 - eEase * (1 - offsets.globe.scaleTarget);
  // Opacity: 1 → 0.35
  const opacity = 1 - eEase * (1 - offsets.globe.opacityTarget);

  // Move to top-right: x positive = right, y negative = up
  // At full progress: translate right by (vw/2 - 300/2 - 40) and up by (-(vh/2 - 300/2 - 40))
  // Use vw/vh for viewport-relative positioning
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 720;
  const halfGlobe = offsets.globe.sizePx / 2;
  const targetX = vw / 2 - halfGlobe - offsets.globe.moveX;     // right edge offset
  const targetY = -(vh / 2 - halfGlobe - offsets.globe.moveY);   // up, negative

  const tx = eEase * targetX;
  const ty = eEase * targetY;

  return {
    transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
    opacity,
  };
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
