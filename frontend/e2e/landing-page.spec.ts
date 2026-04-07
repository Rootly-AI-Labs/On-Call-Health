import { test, expect } from '@playwright/test';

const anonymousStorageState = { cookies: [], origins: [] };

test.describe('Landing Page', () => {
  test.use({ storageState: anonymousStorageState });

  test('should load and display main heading', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that the main heading is visible
    const heading = page.locator('h1').first();
    await expect(heading, 'Main heading should be visible on landing page').toBeVisible();

    // Verify heading has content
    const headingText = await heading.textContent();
    expect(headingText, 'Main heading should contain text').toBeTruthy();
  });

  test('should load without errors', async ({ page }) => {
    const response = await page.goto('/');

    // Check that page loads successfully
    expect(response?.status(), 'Landing page should return 200 status').toBe(200);

    // Verify page has content
    const bodyText = await page.textContent('body');
    expect(bodyText?.length, 'Page should have content').toBeGreaterThan(0);
  });

  test('should have interactive elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for any interactive elements (buttons or links)
    const interactiveElements = page.locator('button, a[href], input, select, textarea');
    const elementCount = await interactiveElements.count();

    expect(elementCount, 'Landing page should have at least one interactive element').toBeGreaterThan(0);
  });

  // Skipped tests - enable when features are implemented
  test.skip('should have working navigation', async ({ page }) => {
    // TODO: Enable this test once navigation is implemented
    await page.goto('/');

    const nav = page.locator('nav, [role="navigation"]').first();
    await expect(nav, 'Navigation should be visible on landing page').toBeVisible();

    const navLinks = nav.locator('a');
    const linkCount = await navLinks.count();
    expect(linkCount, 'Navigation should contain at least one link').toBeGreaterThan(0);
  });

  test.skip('should display call-to-action buttons', async ({ page }) => {
    // TODO: Enable this test and customize selectors for your CTA buttons
    await page.goto('/');

    const buttons = page.locator('button, a[role="button"], a.btn, button.btn');
    const buttonCount = await buttons.count();

    expect(buttonCount, 'Landing page should have at least one CTA button').toBeGreaterThan(0);

    const firstButton = buttons.first();
    await expect(firstButton, 'First CTA button should be visible').toBeVisible();

    const buttonText = await firstButton.textContent();
    expect(buttonText?.trim(), 'CTA button should have text content').toBeTruthy();
  });
});
