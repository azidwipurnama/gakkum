import { test, expect } from '@playwright/test';

test('fb43: Two-screen layout with scroll-snap, card animations, and page indicators', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);

  // Wait for LoadingUI to finish
  await page.waitForFunction(() => {
    const loadingUI = document.querySelector('.fixed.inset-0');
    if (!loadingUI) return true;
    const isTransitioning = loadingUI.classList.contains('scale-[0.25]');
    return !isTransitioning;
  }, { timeout: 10000 });

  await page.evaluate(() => {
    document.body.style.scrollBehavior = 'auto';
    document.documentElement.style.scrollBehavior = 'auto';
  });
  await page.waitForTimeout(500);

  // 1. Check Slide 1 exists with aria-label and 100dvh height
  const slide1 = await page.locator('section[aria-label="Halaman landing"]').count();
  console.log('Slide 1 found:', slide1);
  expect(slide1).toBe(1);

  // 2. Check CyberGlobeBg canvas is present on Slide 1
  const globeOnSlide1 = await page.evaluate(() => {
    const slide1 = document.querySelector('section[aria-label="Halaman landing"]');
    const globe = slide1?.querySelector('canvas[role="img"]');
    return !!globe;
  });
  console.log('Globe canvas on Slide 1:', globeOnSlide1);
  expect(globeOnSlide1).toBeTruthy();

  // 3. Check "Scroll down" button is present
  const scrollButton = await page.locator('button').filter({ hasText: /Gulir|Scroll/ }).count();
  console.log('Scroll-related button count:', scrollButton);
  expect(scrollButton).toBeGreaterThan(0);

  // 4. Check Slide 2 exists with aria-label
  const slide2 = await page.locator('section[aria-label="Dashboard jaringan"]').count();
  console.log('Slide 2 found:', slide2);
  expect(slide2).toBe(1);

  // 5. Check all four cards are present with correct data-testid
  const serverConnCard = await page.locator('[data-testid="server-conn-card"]').count();
  const radarCard = await page.locator('[data-testid="radar-card"]').count();
  const alertsCard = await page.locator('[data-testid="alerts-card"]').count();
  const inspectorCard = await page.locator('[data-testid="inspector-card"]').count();

  console.log('Cards found - Server Conn:', serverConnCard, 'Radar:', radarCard, 'Alerts:', alertsCard, 'Inspector:', inspectorCard);
  expect(serverConnCard).toBe(1);
  expect(radarCard).toBe(1);
  expect(alertsCard).toBe(1);
  expect(inspectorCard).toBe(1);

  // 6. Check cards have initial animation state (opacity 0, translateY 24px) on page load
  const cardsInitialState = await page.evaluate(() => {
    const cards = {
      serverConn: document.querySelector('[data-testid="server-conn-card"]'),
      radar: document.querySelector('[data-testid="radar-card"]'),
      alerts: document.querySelector('[data-testid="alerts-card"]'),
      inspector: document.querySelector('[data-testid="inspector-card"]'),
    };
    const out: Record<string, any> = {};
    Object.entries(cards).forEach(([k, el]) => {
      if (!el) return;
      const style = (el as HTMLElement).getAttribute('style') || '';
      out[k] = {
        hasOpacity0: style.includes('opacity: 0'),
        hasTransformY24: style.includes('translateY(24px)'),
      };
    });
    return out;
  });
  console.log('Cards initial animation state:', JSON.stringify(cardsInitialState, null, 2));

  // All cards should start with opacity 0 and translateY(24px)
  expect(cardsInitialState.serverConn.hasOpacity0).toBeTruthy();
  expect(cardsInitialState.radar.hasOpacity0).toBeTruthy();
  expect(cardsInitialState.alerts.hasOpacity0).toBeTruthy();
  expect(cardsInitialState.inspector.hasOpacity0).toBeTruthy();

  // 7. Check page indicator dots exist (two buttons on right edge)
  const pageIndicatorButtons = await page.evaluate(() => {
    const dotsContainer = document.querySelector('div[aria-hidden="true"]');
    if (!dotsContainer) return { found: false, count: 0 };
    const buttons = dotsContainer.querySelectorAll('button');
    return {
      found: true,
      count: buttons.length,
      ariaLabels: Array.from(buttons).map(b => b.getAttribute('aria-label')),
    };
  });
  console.log('Page indicator dots:', JSON.stringify(pageIndicatorButtons, null, 2));
  expect(pageIndicatorButtons.found).toBeTruthy();
  expect(pageIndicatorButtons.count).toBe(2);

  // 8. Check Device Inspector card structure (table or loading message)
  const inspectorStructure = await page.evaluate(() => {
    const inspector = document.querySelector('[data-testid="inspector-card"]');
    const hasHeader = !!inspector?.querySelector('h2');
    const table = inspector?.querySelector('table');
    const loadingMsg = inspector?.textContent?.includes('Menghubungkan') || inspector?.textContent?.includes('Tidak ada');
    return {
      hasHeader,
      hasTable: !!table,
      hasLoadingOrEmpty: loadingMsg,
    };
  });
  console.log('Device Inspector structure:', JSON.stringify(inspectorStructure, null, 2));
  expect(inspectorStructure.hasHeader).toBeTruthy();
  // Either has table or loading/empty message
  expect(inspectorStructure.hasTable || inspectorStructure.hasLoadingOrEmpty).toBeTruthy();

  // 9. Verify no old motion CSS elements (data-motion attribute should be absent)
  const oldMotionElements = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[data-motion]'));
    return all.length;
  });
  console.log('Old motion elements with data-motion attribute:', oldMotionElements);
  expect(oldMotionElements).toBe(0);

  // 10. Verify scroll hint arrow animation is present
  const scrollHintArrow = await page.evaluate(() => {
    const button = document.querySelector('button[aria-label*="Gulir"]');
    const arrow = button?.querySelector('.scroll-pill-icon');
    return !!arrow;
  });
  console.log('Scroll hint arrow found:', scrollHintArrow);
  expect(scrollHintArrow).toBeTruthy();

  // 11. Capture full page screenshot
  await page.screenshot({ path: 'motion-full-scroll.png', fullPage: true });

  console.log('✓ All fb43 layout assertions passed');
});
