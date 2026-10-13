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

  // 5. Check all cards are present with correct data-testid (status bar + radar + alerts + inspector)
  const statusBarCard = await page.locator('[data-testid="status-bar"]').count();
  const radarCard = await page.locator('[data-testid="radar-card"]').count();
  const notificationsCard = await page.locator('[data-testid="notifications-card"]').count();
  const inspectorCard = await page.locator('[data-testid="inspector-card"]').count();

  console.log('Cards found - Status Bar:', statusBarCard, 'Radar:', radarCard, 'Notifications:', notificationsCard, 'Inspector:', inspectorCard);
  expect(statusBarCard).toBe(1);
  expect(radarCard).toBe(1);
  expect(notificationsCard).toBe(1);
  expect(inspectorCard).toBe(1);

  // 6. Check cards have animation setup via data-motion and data-in attributes (not inline styles)
  const slide2Section = await page.locator('section[data-testid="slide2-section"]');
  const slide2DataMotion = await slide2Section.getAttribute('data-motion');
  console.log('Slide 2 data-motion attribute:', slide2DataMotion);
  expect(slide2DataMotion).toBe('ready');

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
  // Page indicator dots intentionally OFF — globe remains uncluttered
  expect(pageIndicatorButtons.found).toBeFalsy();
  expect(pageIndicatorButtons.count).toBe(0);

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

  // 9. Verify no old motion CSS elements (only new data-motion="ready" on slide 2 is allowed)
  const oldMotionElements = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[data-motion]'));
    // Filter out the new slide2 section with data-motion="ready" (which is expected)
    const oldOnes = all.filter(el => {
      const attr = (el as HTMLElement).getAttribute('data-motion');
      const isSlide2 = (el as HTMLElement).getAttribute('data-testid') === 'slide2-section';
      return !(attr === 'ready' && isSlide2);
    });
    return oldOnes.length;
  });
  console.log('Old motion elements (excluding new slide2 data-motion="ready"):', oldMotionElements);
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
