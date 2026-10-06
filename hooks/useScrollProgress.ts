import { useEffect, useState } from 'react';

export function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      // Calculate scroll progress across a 420vh total height
      // (assuming 320vh of scrollable content area)
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPosition = window.scrollY;
      const currentProgress = scrollableHeight > 0 ? scrollPosition / scrollableHeight : 0;

      setProgress(currentProgress);
      // Expose to CSS variables for component reactivity
      document.documentElement.style.setProperty('--scroll-progress', currentProgress.toString());
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return progress;
}
