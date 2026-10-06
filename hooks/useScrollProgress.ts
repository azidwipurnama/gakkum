// Scroll-progress engine for the dashboard.
// - Single requestAnimationFrame (shared loop).
// - Passive scroll listener.
// - Resize updates cached heights (no getBoundingClientRect in the rAF loop).
// - Writes progress directly to element ref via CSS variable (no setState per frame).
// - Cleans up all listeners on unmount.
//
// Usage: pass a ref to the wrapper element that has height ~wrapperHeightVh.
//        Sets data-motion="on" on the provided container ref once first frame runs.

import { useEffect, useRef, RefObject } from "react";

interface UseScrollProgressResult {
  p: number; // latest smoothed progress (also exposed via CSS var on target)
  isReady: boolean;
}

type Options = {
  /** Wrapper ref whose scrollHeight defines the scroll distance. */
  wrapperRef: RefObject<HTMLDivElement | null>;
  /** Stage/container ref that receives data-motion="on" + --scroll-progress var. */
  targetRef: RefObject<HTMLDivElement | null>;
  /** Called every smoothed frame with the current progress (for element transforms). */
  onProgress?: (p: number) => void;
  /** Enable debug overlay when ?motion=debug or __NEXT_DEV__ */
  debug?: boolean;
};

export function useScrollProgress({ wrapperRef, targetRef, onProgress }: Options): UseScrollProgressResult {
  const pRef = useRef(0);
  const targetPRef = useRef(0);
  const isReduced = useRef(false);
  const rafRef = useRef<number | null>(null);
  const cached = useRef<{
    wrapperHeight: number;
    vh: number;
    lastScrollY: number;
    diffAccum: number;
  }>({ wrapperHeight: 0, vh: 0, lastScrollY: 0, diffAccum: 0 });

  const isReadyRef = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const target = targetRef.current;
    if (!wrapper || !target) return;

    // Reduced motion check
    isReduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const updateCache = () => {
      cached.current.wrapperHeight = wrapper.offsetHeight || wrapper.scrollHeight || 1;
      cached.current.vh = window.innerHeight || document.documentElement.clientHeight;
    };
    updateCache();
    window.addEventListener("resize", updateCache);

    // Write progress to CSS variable + data-motion attribute on both target and :root
    const apply = (progress: number, motionOn: boolean) => {
      pRef.current = progress;
      if (motionOn) {
        target.setAttribute("data-motion", "on");
        // Expose on :root so other components (e.g. globe) can read without prop updates
        document.documentElement.setAttribute("data-motion", "on");
      }
      target.style.setProperty("--scroll-progress", String(progress));
      document.documentElement.style.setProperty("--scroll-progress", String(progress));
    };

    // Main animation loop.
    const tick = () => {
      const { wrapperHeight, vh } = cached.current;
      const scrollable = Math.max(1, wrapperHeight - vh);
      const raw = window.scrollY / scrollable;
      // Clamp 0..1
      const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw;

      if (!isReadyRef.current) {
        isReadyRef.current = true;
        apply(0, true);
      }

      // Smoothing
      const factor = isReduced.current ? 1 : 0.1;
      targetPRef.current += (clamped - targetPRef.current) * factor;

      // Stop when close enough
      if (Math.abs(targetPRef.current - clamped) < 0.0002) {
        targetPRef.current = clamped;
      }

      apply(targetPRef.current, true);

      // Invoke consumer callback for element transforms (no setState per frame)
      if (onProgress) {
        onProgress(targetPRef.current);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    // Passive scroll listener — only invalidates cache distance, doesn't do heavy work
    const onScroll = () => {
      const { wrapperHeight, vh } = cached.current;
      const scrollable = Math.max(1, wrapperHeight - vh);
      const raw = window.scrollY / scrollable;
      const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw;

      cached.current.lastScrollY = window.scrollY;
      cached.current.diffAccum += Math.abs(clamped - (targetPRef.current || 0));
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Start loop immediately so first frame sets data-motion="on"
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      window.removeEventListener("resize", updateCache);
      window.removeEventListener("scroll", onScroll);
      // Cleanup: remove data-motion (fallback to static layout) + CSS vars
      if (target) {
        target.removeAttribute("data-motion");
        target.style.removeProperty("--scroll-progress");
        document.documentElement.removeAttribute("data-motion");
        document.documentElement.style.removeProperty("--scroll-progress");
      }
    };
  }, [wrapperRef, targetRef]);

  return { p: pRef.current, isReady: isReadyRef.current };
}
