import { test, expect } from '@playwright/test';

/**
 * Smoke tests - verify the app loads and basic functionality works
 */

const anonymousStorageState = { cookies: [], origins: [] };

test.describe('Smoke Tests', () => {
  test.use({ storageState: anonymousStorageState });

  test('landing page has correct title', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle('On-Call Health');
  });

  test('landing page shows main heading with expected text', async ({ page }) => {
    await page.goto('/');

    // Look for the specific heading text
    const heading = page.locator('h1:has-text("Catch exhaustion")');
    await expect(heading).toBeVisible();

    // Verify full text
    const headingText = await heading.textContent();
    expect(headingText).toContain('before it burns out');
  });

  test('landing page has GitHub link', async ({ page }) => {
    await page.goto('/');

    // Find GitHub link
    const githubLink = page.locator('a[href*="github.com/Rootly-AI-Labs"]');
    await expect(githubLink.first()).toBeVisible();
  });

  test('landing page has sign in buttons', async ({ page }) => {
    await page.goto('/');

    // Check for Google sign in button
    const googleButton = page.locator('button:has-text("Sign in with Google")');
    await expect(googleButton).toBeVisible();

    // Check for GitHub sign in button
    const githubButton = page.locator('button:has-text("Sign in with GitHub")');
    await expect(githubButton).toBeVisible();
  });

  test('landing page video is present', async ({ page }) => {
    await page.goto('/');

    // Check video element exists
    const video = page.locator('video');
    await expect(video).toBeVisible();

    // Verify video has source
    const videoSrc = await video.locator('source').getAttribute('src');
    expect(videoSrc).toContain('.mp4');
  });
});
