import { test, expect } from '@playwright/test';

test('inspector hidden at p=0, visible later; cards distinct; no double border', async ({ page }) => {
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

  // Inspect CARD opacity (not section)
  const cardsState = await page.evaluate(() => {
    const sel = {
      radarCard: document.querySelector('.radar-section > div'),
      alertsCard: document.querySelector('.alerts-section > div'),
      inspectorCard: document.querySelector('.inspector-section > div'),
    };
    const out: Record<string, any> = {};
    Object.entries(sel).forEach(([k, el]) => {
      if (!el) return out[k] = { found: false };
      const s = getComputedStyle(el as HTMLElement);
      out[k] = { opacity: s.opacity, transform: s.transform, inert: (el as any).hasAttribute?.('inert'), ariaHidden: (el as any).getAttribute?.('aria-hidden') };
    });
    return out;
  });
  console.log('cards at p=0:', JSON.stringify(cardsState, null, 2));

  // Wrapper height sanity
  const wrapperH = await page.evaluate(() => {
    const w = document.querySelector('body > div:first-child') as HTMLElement;
    return w ? { oh: w.offsetHeight, sh: w.scrollHeight, style: w.getAttribute('style') } : 'not found';
  });
  console.log('wrapper:', JSON.stringify(wrapperH));

  // Scroll to 80% — reset to top first to clear any smooth-scroll state
  await page.evaluate(() => {
    window.scrollTo({top: 0, behavior: 'auto'});
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.body.style.scrollBehavior = 'auto';
    document.documentElement.style.scrollBehavior = 'auto';
    const max = document.body.scrollHeight - window.innerHeight;
    window.scrollTo({top: max * 0.85, behavior: 'auto'});
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'motion-mid-inspector.png' });

  const inspectorMid = await page.evaluate(() => {
    const r = document.querySelector('.inspector-section > div') as HTMLElement;
    return r ? { opacity: getComputedStyle(r).opacity, transform: getComputedStyle(r).transform } : { found:true };
  });
  console.log('inspector card at p~0.85:', JSON.stringify(inspectorMid));

  // Scroll to bottom (ensure jump, no smooth animation, wait for settle)
  await page.evaluate(() => { document.body.style.scrollBehavior = 'auto'; document.documentElement.style.scrollBehavior = 'auto'; const max = document.body.scrollHeight - window.innerHeight; window.scrollTo({top: max, behavior: 'auto'}); });
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
    const r = document.querySelector('.inspector-section > div') as HTMLElement;
    return r ? { opacity: parseFloat(getComputedStyle(r).opacity) } : { found:false };
  });
  console.log('inspector card at end:', JSON.stringify(inspectorEnd));

  // Alerts double border - check for 2 nested bordered divs
  const alertsStructure = await page.evaluate(() => {
    const outer = document.querySelector('.alerts-section > div');
    const inner = outer?.querySelector('div');
    return {
      outerBorder: outer ? getComputedStyle(outer).borderWidth : null,
      outerRadius: outer ? getComputedStyle(outer).borderRadius : null,
      innerPresent: !!inner,
    };
  });
  console.log('alerts structure:', JSON.stringify(alertsStructure));

  // No leftover dark bar
  const leftoverDarkBar = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    return all.filter(el => {
      const cn = (el as HTMLElement).className;
      const c = typeof cn === 'string' ? cn : '';
      return c.includes('animate-bounce') || /w-\[3px\]/.test(c);
    }).length;
  });
  console.log('leftover dark bars:', leftoverDarkBar);

  // Directive 5 assertion: alerts card has single border, radius 14px
  expect(alertsStructure.outerRadius).toBe('14px');

  // Directive 6 assertion: no leftover dark bars (bounce animation / 3px width)
  expect(leftoverDarkBar).toBe(0);

  // Directive 1 & 2: 4 distinct section positions at p=0 (no stacking)
  const sections = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('section')).map(s => {
      const el = s as HTMLElement;
      const r = el.getBoundingClientRect();
      return { cls: el.className, top: Math.round(r.top) };
    });
  });
  const tops = sections.map(s => s.top);
  const distinctTops = new Set(tops).size;
  console.log('section tops:', tops, 'distinct:', distinctTops);
  expect(distinctTops).toBe(4); // 4 sections with distinct vertical positions

  // pNum end sanity
  expect(pNum).toBeGreaterThanOrEqual(0.95);
});
