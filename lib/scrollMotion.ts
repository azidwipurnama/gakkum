// Scroll-motion derivation helpers.
// Reads the CSS variable --scroll-progress from the stage element (set by useScrollProgress)
// and returns { transform, opacity, visibility, inert/aria } for each element.
//
// Per ATURAN KERAS: transform & opacity only.
// Elements fall back to static layout when data-motion="on" is absent (the hook removes it
// on unmount / when p is invalid).

import { scrollMotionConfig as cfg, Segment } from "./scrollMotion.config";

const { smoothstep, seg, offsets } = cfg;
const tableRows = cfg.segments.tableRows;

export interface ElementMotionState {
  transform: string;           // CSS transform string (translate / scale) — opacity only
  opacity: number;             // 0..1
  // Accessibility gating
  ariaHidden: boolean;         // true when opacity ~ 0 (screen readers skip)
  inert: boolean;              // JS-applied; set via style.inert in React (polyfill if needed)
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
 * Motion state for an element that enters and leaves during scroll.
 * enter: visible inside [a..b], fully visible at midpoint.
 * exit:  fades out inside [a..b] after enter completes.
 */
export function enterExitMotion(
  p: number,
  enter: Segment,
  exit?: Segment
): ElementMotionState {
  const e = seg(p, enter.a, enter.b);
  const eEase = smoothstep(e);

  let opacity = eEase;
  let translateY = 0;
  let translateX = 0;

  if (exit && p > exit.a) {
    const x = seg(p, exit.a, exit.b);
    const xEase = smoothstep(x);
    opacity = 1 - xEase; // fade out toward exit.b
    // Optionally translate further out by exit offset — not specified per element, keep default
  }

  return {
    transform: `none`,
    opacity,
    ariaHidden: opacity < 0.01,
    inert: opacity < 0.01,
  };
}

/** Radar: enters 0.16-0.32 via +40px translateX, exits 0.50-0.62 with -24px + fade */
export function radarMotion(p: number): ElementMotionState {
  const enter = seg(p, cfg.segments.radar.a, cfg.segments.radar.b);
  const enterEase = smoothstep(enter);
  const enterTranslate = (1 - enterEase) * offsets.radarIn.x;

  let opacity = enterEase;
  let translateX = enterTranslate;

  // Exit: 0.50-0.62
  if (p > cfg.segments.radarOut.a) {
    const x = seg(p, cfg.segments.radarOut.a, cfg.segments.radarOut.b);
    const xEase = smoothstep(x);
    opacity = 1 - xEase;
    translateX = -offsets.radarOut.x * xEase; // slide to -24px as it fades
  }

  // Clamp so card is always at least semi-visible (prevents fully-invisible state at p=0)
  opacity = Math.max(0.7, opacity);

  return {
    transform: `translateX(${translateX}px)`,
    opacity,
    ariaHidden: opacity < 0.01,
    inert: opacity < 0.01,
  };
}

/** Alerts: enters 0.30-0.42 via -30px translateX, +16px translateY */
export function alertsMotion(p: number): ElementMotionState {
  const e = seg(p, cfg.segments.alerts.a, cfg.segments.alerts.b);
  const eEase = smoothstep(e);
  const translateX = (1 - eEase) * offsets.alertsIn.x;   // -30 -> 0
  const translateY = (1 - eEase) * offsets.alertsIn.y;   // +16 -> 0
  const opacity = Math.max(0.7, eEase); // always visible fallback

  return {
    transform: `translate(${translateX}px, ${translateY}px)`,
    opacity,
    ariaHidden: opacity < 0.01,
    inert: opacity < 0.01,
  };
}

/** Device inspector: enters 0.58-0.76 via +60px translateY */
export function deviceInspectorMotion(p: number): ElementMotionState {
  const e = seg(p, cfg.segments.deviceInspector.a, cfg.segments.deviceInspector.b);
  const eEase = smoothstep(e);
  const translateY = (1 - eEase) * offsets.deviceInspector.y; // +60 -> 0
  const opacity = Math.max(0.7, eEase); // always visible fallback

  return {
    transform: `translateY(${translateY}px)`,
    opacity,
    ariaHidden: opacity < 0.01,
    inert: opacity < 0.01,
  };
}

/** Scroll hint text: fades out 0.00-0.10 via translateY */
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
 * Table row staggered entry.
 * row i appears starting at start + i*perRow, fully visible at start + i*perRow + (fadeInEnd-start).
 * Max first 10 rows get staggered; beyond that, still show but no stagger timing beyond.
 */
export function tableRowMotion(rowIndex: number, p: number): ElementMotionState {
  if (rowIndex >= cfg.segments.tableRows.maxVisible) {
    // Rows beyond max still visible (opacity 1) — only first 10 stagger
    return { transform: "none", opacity: 1, ariaHidden: false, inert: false };
  }
  const enterStart = cfg.segments.tableRows.start + rowIndex * cfg.segments.tableRows.perRow;
  const enterEnd = enterStart + (cfg.segments.tableRows.fadeInEnd - cfg.segments.tableRows.start);
  const e = seg(p, enterStart, enterEnd);
  const eEase = smoothstep(e);
  const translateX = (1 - eEase) * offsets.tableRow.x; // -10 -> 0
  const opacity = Math.max(0.8, eEase); // always visible fallback
  return {
    transform: `translateX(${translateX}px)`,
    opacity,
    ariaHidden: opacity < 0.01,
    inert: opacity < 0.01,
  };
}
