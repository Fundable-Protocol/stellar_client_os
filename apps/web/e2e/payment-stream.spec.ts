import { test, expect } from '@playwright/test';
import { injectConnectedWallet, clearWalletState, mockRpcCalls } from './helpers/mock-wallet';

const VALID_RECIPIENT = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

test.describe('Payment Stream', () => {
  test.describe('unauthenticated', () => {
    test.beforeEach(async ({ page }) => {
      await clearWalletState(page);
    });

    test('shows connect wallet prompt when not connected', async ({ page }) => {
      await page.goto('/payment-stream');
      await expect(page.getByText(/connect your stellar wallet/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
    });
  });

  test.describe('authenticated', () => {
    test.beforeEach(async ({ page }) => {
      await injectConnectedWallet(page);
      await mockRpcCalls(page);
    });

    test('renders Payment Streams page title', async ({ page }) => {
      await page.goto('/payment-stream');
      await expect(page.getByText('Payment Streams')).toBeVisible();
    });

    test('renders the stream creation form', async ({ page }) => {
      await page.goto('/payment-stream');
      await expect(page.getByPlaceholder(/monthly salary/i)).toBeVisible();
      await expect(page.getByPlaceholder(/enter total amount/i)).toBeVisible();
      await expect(page.getByPlaceholder(/GXXX/i)).toBeVisible();
    });

    test('Proceed button is disabled when form is empty', async ({ page }) => {
      await page.goto('/payment-stream');
      await expect(page.getByRole('button', { name: /proceed/i })).toBeDisabled();
    });

    test('filling the form enables the Proceed button', async ({ page }) => {
      await page.goto('/payment-stream');

      await page.getByPlaceholder(/monthly salary/i).fill('Test Stream');
      await page.getByPlaceholder(/enter total amount/i).fill('100');
      await page.getByPlaceholder(/GXXX/i).fill(VALID_RECIPIENT);

      // Fill duration value
      await page.locator('input[placeholder="Value eg. 1"]').fill('30');

      // Select duration unit via the dropdown
      await page.locator('button[role="combobox"]').last().click();
      await page.getByRole('option', { name: /day/i }).first().click();

      await expect(page.getByRole('button', { name: /proceed/i })).toBeEnabled();
    });

    test('shows end time preview after valid duration is entered', async ({ page }) => {
      await page.goto('/payment-stream');

      await page.locator('input[placeholder="Value eg. 1"]').fill('7');
      await page.locator('button[role="combobox"]').last().click();
      await page.getByRole('option', { name: /day/i }).first().click();

      await expect(page.getByText(/stream will end/i)).toBeVisible();
    });

    test('shows validation error for invalid duration', async ({ page }) => {
      await page.goto('/payment-stream');

      // Enter a past/invalid duration value
      await page.locator('input[placeholder="Value eg. 1"]').fill('0');
      await page.locator('button[role="combobox"]').last().click();
      await page.getByRole('option', { name: /day/i }).first().click();

      // Should show an error or keep button disabled
      await expect(page.getByRole('button', { name: /proceed/i })).toBeDisabled();
    });

    test('shows beta warning banner on mainnet info message', async ({ page }) => {
      await page.goto('/payment-stream');
      // The page has a beta warning info message
      await expect(page.getByText(/beta/i)).toBeVisible();
    });
  });
});
