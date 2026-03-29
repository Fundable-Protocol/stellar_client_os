import { test, expect } from '@playwright/test';
import { clearWalletState, injectConnectedWallet, MOCK_ADDRESS } from './helpers/mock-wallet';

test.describe('Wallet Connection', () => {
  test.describe('disconnected state', () => {
    test.beforeEach(async ({ page }) => {
      await clearWalletState(page);
    });

    test('shows Connect Wallet button in navbar when disconnected', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
    });

    test('clicking Connect Wallet opens the wallet modal', async ({ page }) => {
      await page.goto('/dashboard');
      await page.getByRole('button', { name: /connect wallet/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('Connect Wallet')).toBeVisible();
    });

    test('wallet modal lists supported wallets', async ({ page }) => {
      await page.goto('/dashboard');
      await page.getByRole('button', { name: /connect wallet/i }).click();

      const wallets = ['Freighter', 'Albedo', 'xBull', 'Rabet', 'Lobstr'];
      for (const wallet of wallets) {
        await expect(page.getByText(wallet)).toBeVisible();
      }
    });

    test('Connect Now button is disabled until a wallet is selected', async ({ page }) => {
      await page.goto('/dashboard');
      await page.getByRole('button', { name: /connect wallet/i }).click();
      await expect(page.getByRole('button', { name: /connect now/i })).toBeDisabled();
    });

    test('selecting a wallet enables the Connect Now button', async ({ page }) => {
      await page.goto('/dashboard');
      await page.getByRole('button', { name: /connect wallet/i }).click();
      await page.getByText('Freighter').click();
      await expect(page.getByRole('button', { name: /connect now/i })).toBeEnabled();
    });

    test('closing the modal hides it', async ({ page }) => {
      await page.goto('/dashboard');
      await page.getByRole('button', { name: /connect wallet/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // Close via Escape key
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });

    test('protected pages show connect wallet prompt when disconnected', async ({ page }) => {
      const protectedPages = ['/payment-stream', '/offramp', '/distribution'];
      for (const path of protectedPages) {
        await page.goto(path);
        await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
      }
    });
  });

  test.describe('connected state', () => {
    test.beforeEach(async ({ page }) => {
      await injectConnectedWallet(page);
    });

    test('shows truncated address in navbar when connected', async ({ page }) => {
      await page.goto('/dashboard');
      // Address GAAAAAA...AWHF should be truncated as GAAA...AWHF
      const truncated = `${MOCK_ADDRESS.slice(0, 4)}...${MOCK_ADDRESS.slice(-4)}`;
      await expect(page.getByText(truncated)).toBeVisible();
    });

    test('does not show Connect Wallet button when connected', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByRole('button', { name: /connect wallet/i })).not.toBeVisible();
    });

    test('clicking address shows disconnect option', async ({ page }) => {
      await page.goto('/dashboard');
      const truncated = `${MOCK_ADDRESS.slice(0, 4)}...${MOCK_ADDRESS.slice(-4)}`;
      await page.getByText(truncated).click();
      await expect(page.getByRole('menuitem', { name: /disconnect/i })).toBeVisible();
    });

    test('disconnecting clears address from navbar', async ({ page }) => {
      await page.goto('/dashboard');
      const truncated = `${MOCK_ADDRESS.slice(0, 4)}...${MOCK_ADDRESS.slice(-4)}`;
      await page.getByText(truncated).click();
      await page.getByRole('menuitem', { name: /disconnect/i }).click();
      await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
    });
  });
});
