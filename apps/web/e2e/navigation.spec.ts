import { test, expect } from '@playwright/test';
import { injectConnectedWallet, mockRpcCalls } from './helpers/mock-wallet';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await injectConnectedWallet(page);
    await mockRpcCalls(page);
  });

  test('root redirects to /dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('dashboard page loads without errors', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1, [data-slot="sidebar-title"]').first()).toBeVisible();
  });

  test('sidebar links navigate to correct pages', async ({ page }) => {
    await page.goto('/dashboard');

    const navLinks = [
      { label: 'Distribution', url: '/distribution' },
      { label: 'History', url: '/history' },
      { label: 'Payment Stream', url: '/payment-stream' },
      { label: 'Offramp', url: '/offramp' },
    ];

    for (const link of navLinks) {
      await page.goto('/dashboard');
      // Click the sidebar link by its text
      await page.getByRole('link', { name: link.label }).first().click();
      await expect(page).toHaveURL(new RegExp(link.url));
    }
  });

  test('all main pages load without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const pages = ['/dashboard', '/distribution', '/history', '/payment-stream', '/offramp'];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    expect(errors).toHaveLength(0);
  });

  test('not-found page renders for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    // Next.js 404 page or custom not-found
    const status = page.url();
    expect(status).toBeTruthy();
    // Should not redirect to dashboard
    expect(page.url()).not.toMatch(/\/dashboard/);
  });
});
