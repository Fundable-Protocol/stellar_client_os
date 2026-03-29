import { test, expect } from '@playwright/test';
import { injectConnectedWallet, clearWalletState, mockRpcCalls } from './helpers/mock-wallet';

test.describe('Offramp', () => {
  test.describe('unauthenticated', () => {
    test.beforeEach(async ({ page }) => {
      await clearWalletState(page);
    });

    test('shows connect wallet prompt when not connected', async ({ page }) => {
      await page.goto('/offramp');
      await expect(page.getByText(/connect your stellar wallet/i)).toBeVisible();
    });
  });

  test.describe('authenticated', () => {
    test.beforeEach(async ({ page }) => {
      await injectConnectedWallet(page);
      await mockRpcCalls(page);

      // Mock the offramp backend API
      await page.route('**/api/**', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ banks: [], quote: null }),
        });
      });
    });

    test('renders Offramp page title', async ({ page }) => {
      await page.goto('/offramp');
      await expect(page.getByText('Offramp')).toBeVisible();
    });

    test('renders the offramp form in initial state', async ({ page }) => {
      await page.goto('/offramp');
      // The form step should be visible
      await expect(page.getByText(/withdraw stellar usdc/i)).toBeVisible();
    });

    test('shows info banner about supported countries', async ({ page }) => {
      await page.goto('/offramp');
      await expect(page.getByText(/nigeria|ghana|kenya/i)).toBeVisible();
    });

    test('shows info message about Allbridge', async ({ page }) => {
      await page.goto('/offramp');
      await expect(page.getByText(/allbridge/i)).toBeVisible();
    });
  });
});
