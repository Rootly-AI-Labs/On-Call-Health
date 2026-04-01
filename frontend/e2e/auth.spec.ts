import { test, expect } from '@playwright/test';

const anonymousStorageState = { cookies: [], origins: [] };

test.describe('Authentication Flow', () => {
  test.describe('Public Auth Pages', () => {
    test.use({ storageState: anonymousStorageState });

    test.skip('should show login page', async ({ page }) => {
      // TODO: Enable this test once login UI is implemented
      // This test expects a form element on /auth/login
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      const form = page.locator('form').first();
      await expect(form, 'Login form should be visible on /auth/login page').toBeVisible();

      const inputs = form.locator('input');
      const inputCount = await inputs.count();
      expect(inputCount, 'Login form should have at least one input field').toBeGreaterThan(0);
    });

    test.skip('should validate required fields', async ({ page }) => {
      // TODO: Enable this test once login validation is implemented
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      const submitButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")').first();
      await expect(submitButton, 'Submit button should exist on login form').toBeVisible();

      await submitButton.click();
      await page.waitForTimeout(500);

      await expect(page, 'Should remain on login page after invalid submission').toHaveURL(/.*auth\/login.*/);
    });

    test('should load auth page without errors', async ({ page }) => {
      const response = await page.goto('/auth/login');

      // Check that page loads successfully
      expect(response?.status(), 'Auth page should return 200 status').toBe(200);

      await expect(
        page.getByRole('heading', { name: 'Sign in to On-Call Health' }),
        'Login heading should remain visible for signed-out visitors'
      ).toBeVisible();

      // Verify page loaded (has some content)
      const bodyText = await page.textContent('body');
      expect(bodyText?.length, 'Page should have content').toBeGreaterThan(0);
    });
  });

  test('should redirect authenticated users away from public auth pages', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page, 'Authenticated users should be routed into the app').toHaveURL(/\/dashboard(?:[/?#]|$)/);
  });
});
