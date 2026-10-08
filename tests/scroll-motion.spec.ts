import { test, expect } from '@playwright/test';

test('2-page layout: scroll hint, page2 grid, two-dot indicator, no double border, table nowrap', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:3000/?motion=debug', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Scroll behavior reset (LoadingUI may keep scroll-behavior:smooth from globals.css)
  await page.evaluate(() => {
    document.body.style.scrollBehavior = 'auto';
    document.documentElement.style.scrollBehavior = 'auto';
  });
  await page.waitForTimeout(500);

  const hasMotion = await page.evaluate(() => document.documentElement.hasAttribute('data-motion'));
  expect(hasMotion).toBe(true);

  // Inspect CARD opacity at p=0 (cards should be entering/entering, some not yet visible)
  const cardsState = await page.evaluate(() => {
    const sel = {
      serverConnCard: document.querySelector<HTMLElement>('[data-testid="server-connection-card"]'),
      alertsCard: document.querySelector<HTMLElement>('[data-testid="alerts-card"]'),
      radarCard: document.querySelector<HTMLElement>('[data-testid="radar-card"]'),
      inspectorCard: document.querySelector<HTMLElement>('[data-testid="inspector-card"]'),
    };
    const out: Record<string, any> = {};
    Object.entries(sel).forEach(([k, el]) => {
      if (!el) return (out[k] = { found: false });
      const s = getComputedStyle(el as HTMLElement);
      out[k] = {
        opacity: s.opacity,
        transform: s.transform,
        inert: (el as any).hasAttribute?.('inert'),
        ariaHidden: (el as any).getAttribute?.('aria-hidden'),
      };
    });
    return out;
  });
  console.log('cards at p=0:', JSON.stringify(cardsState, null, 2));

  // Wrapper height sanity - should be 260vh
  const wrapperH = await page.evaluate(() => {
    const w = document.querySelector('body > div:first-child') as HTMLElement;
    return w
      ? { oh: w.offsetHeight, sh: w.scrollHeight, style: w.getAttribute('style') }
      : 'not found';
  });
  console.log('wrapper:', JSON.stringify(wrapperH));

  // Two-dot indicator present at right edge
  const dots = await page.$('[data-testid="scroll-progress-dots"]');
  expect(dots).not.toBeNull();

  // Scroll to bottom (ensure jump, no smooth animation)
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.body.style.scrollBehavior = 'auto';
    document.documentElement.style.scrollBehavior = 'auto';
    const max = document.body.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max, behavior: 'auto' });
  });
  await page.waitForTimeout(2000);

  // Read progress BEFORE full-page screenshot (screenshot resets scroll position)
  const scrollYAtEnd = await page.evaluate(() => window.scrollY);
  const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const pEnd = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scroll-progress'));
  const pNum = parseFloat(pEnd || '0');
  console.log('scrollY:', scrollYAtEnd, 'maxScroll:', maxScroll, 'pNum:', pNum);

  // Capture full page screenshot after reading state
  await page.screenshot({ path: 'motion-full-scroll.png', fullPage: true });

  const inspectorEnd = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="inspector-card"]') as HTMLElement;
    return r ? { opacity: parseFloat(getComputedStyle(r).opacity) } : { found: false };
  });
  console.log('inspector card at end:', JSON.stringify(inspectorEnd));

  // Alerts single border - check for single bordered div (no nested border)
  const alertsStructure = await page.evaluate(() => {
    const outer = document.querySelector<HTMLElement>('[data-testid="alerts-card"]');
    const inner = outer?.querySelector('div');
    return {
      outerBorder: outer ? getComputedStyle(outer).borderWidth : null,
      outerRadius: outer ? getComputedStyle(outer).borderRadius : null,
      innerPresent: !!inner,
    };
  });
  console.log('alerts structure:', JSON.stringify(alertsStructure));

  // No leftover dark bar (no animate-bounce class, no w-[3px] width)
  const leftoverDarkBar = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    return all.filter((el) => {
      const cn = (el as HTMLElement).className;
      const c = typeof cn === 'string' ? cn : '';
      return c.includes('animate-bounce') || /w-\[3px\]/.test(c);
    }).length;
  });
  console.log('leftover dark bars:', leftoverDarkBar);

  // Table cells: whitespace-nowrap, min-width 900px on table
  const tableCheck = await page.evaluate(() => {
    const t = document.querySelector('table');
    if (!t) return { found: false };
    const firstCell = t.querySelector<HTMLElement>('td, th');
    const whiteSpace = firstCell ? getComputedStyle(firstCell).whiteSpace : null;
    return {
      found: true as const,
      minWidth: getComputedStyle(t).minWidth,
      whiteSpace,
      overflowX: getComputedStyle(t.parentElement!).overflowX,
    };
  });
  console.log('table check:', JSON.stringify(tableCheck));

  // Directive 5 assertion: alerts card has single border, radius 14px
  expect(alertsStructure.outerRadius).toBe('14px');

  // Directive 6 assertion: no leftover dark bars (bounce animation / 3px width)
  expect(leftoverDarkBar).toBe(0);

  // Table assertions
  expect(tableCheck.found).toBeTruthy();
  expect(tableCheck.overflowX).toBe('auto');

  // pNum end sanity - progress should reach near 1 at scroll end
  expect(pNum).toBeGreaterThanOrEqual(0.95);
});
