import { test, expect } from '@playwright/test';
import { injectConnectedWallet, clearWalletState, mockRpcCalls } from './helpers/mock-wallet';

test.describe('History Page', () => {
  test.describe('unauthenticated', () => {
    test.beforeEach(async ({ page }) => {
      await clearWalletState(page);
    });

    test('shows connect wallet prompt when not connected', async ({ page }) => {
      await page.goto('/history');
      await expect(page.getByText(/connect your wallet/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
    });
  });

  test.describe('authenticated', () => {
    test.beforeEach(async ({ page }) => {
      await injectConnectedWallet(page);
      await mockRpcCalls(page);
    });

    test('renders Transaction History title', async ({ page }) => {
      await page.goto('/history');
      await expect(page.getByText('Transaction History')).toBeVisible();
    });

    test('renders filter controls', async ({ page }) => {
      await page.goto('/history');
      await expect(page.getByText('Type')).toBeVisible();
      await expect(page.getByText('Token')).toBeVisible();
      await expect(page.getByText('Status')).toBeVisible();
      await expect(page.getByText('From')).toBeVisible();
      await expect(page.getByText('To')).toBeVisible();
    });

    test('type filter has correct options', async ({ page }) => {
      await page.goto('/history');
      // Open the Type filter dropdown
      await page.locator('[placeholder="Type"]').click();
      await expect(page.getByRole('option', { name: 'All Types' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Streams' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Distributions' })).toBeVisible();
    });

    test('status filter has correct options', async ({ page }) => {
      await page.goto('/history');
      await page.locator('[placeholder="Status"]').click();
      await expect(page.getByRole('option', { name: 'All Statuses' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Completed' })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Active' })).toBeVisible();
    });

    test('date range inputs accept values', async ({ page }) => {
      await page.goto('/history');
      await page.locator('input[type="date"]').first().fill('2025-01-01');
      await page.locator('input[type="date"]').last().fill('2025-12-31');
      // Verify values were set
      await expect(page.locator('input[type="date"]').first()).toHaveValue('2025-01-01');
      await expect(page.locator('input[type="date"]').last()).toHaveValue('2025-12-31');
    });

    test('Reset button appears when filters are active', async ({ page }) => {
      await page.goto('/history');
      // Apply a filter
      await page.locator('[placeholder="Type"]').click();
      await page.getByRole('option', { name: 'Streams' }).click();
      await expect(page.getByRole('button', { name: /reset/i })).toBeVisible();
    });

    test('Reset button clears all filters', async ({ page }) => {
      await page.goto('/history');
      // Apply filters
      await page.locator('[placeholder="Type"]').click();
      await page.getByRole('option', { name: 'Streams' }).click();
      await page.locator('input[type="date"]').first().fill('2025-01-01');

      // Reset
      await page.getByRole('button', { name: /reset/i }).click();

      // Filters should be cleared from URL
      await expect(page).not.toHaveURL(/type=Stream/);
      await expect(page).not.toHaveURL(/from=2025/);
    });

    test('filters are reflected in the URL', async ({ page }) => {
      await page.goto('/history');
      await page.locator('[placeholder="Type"]').click();
      await page.getByRole('option', { name: 'Streams' }).click();
      await expect(page).toHaveURL(/type=Stream/);
    });

    test('empty state renders without crashing when no transactions', async ({ page }) => {
      await page.goto('/history');
      // With mocked RPC returning empty, the table should render without errors
      await page.waitForLoadState('networkidle');
      // Page should still be visible
      await expect(page.getByText('Transaction History')).toBeVisible();
    });
  });
});
