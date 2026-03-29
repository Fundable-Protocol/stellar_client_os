import { test, expect } from '@playwright/test';
import { injectConnectedWallet, clearWalletState, mockRpcCalls } from './helpers/mock-wallet';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('Distribution', () => {
  test.describe('unauthenticated', () => {
    test.beforeEach(async ({ page }) => {
      await clearWalletState(page);
    });

    test('shows connect wallet prompt when not connected', async ({ page }) => {
      await page.goto('/distribution');
      await expect(page.getByText(/connect your stellar wallet/i)).toBeVisible();
    });
  });

  test.describe('authenticated', () => {
    test.beforeEach(async ({ page }) => {
      await injectConnectedWallet(page);
      await mockRpcCalls(page);
    });

    test('renders Create Distribution heading', async ({ page }) => {
      await page.goto('/distribution');
      await expect(page.getByText('Create Distribution')).toBeVisible();
    });

    test('renders recipient table with default rows', async ({ page }) => {
      await page.goto('/distribution');
      // Default 2 recipient rows are added on mount
      const rows = page.locator('tbody tr');
      await expect(rows).toHaveCount(2);
    });

    test('Add Row button adds a new recipient row', async ({ page }) => {
      await page.goto('/distribution');
      await page.getByRole('button', { name: /add row/i }).click();
      const rows = page.locator('tbody tr');
      await expect(rows).toHaveCount(3);
    });

    test('delete button removes a recipient row', async ({ page }) => {
      await page.goto('/distribution');
      // Add a third row first so we can delete without going below 2
      await page.getByRole('button', { name: /add row/i }).click();
      await expect(page.locator('tbody tr')).toHaveCount(3);

      // Click the first delete button
      await page.locator('tbody tr').first().getByRole('button').click();
      await expect(page.locator('tbody tr')).toHaveCount(2);
    });

    test('can switch between Equal and Weighted distribution types', async ({ page }) => {
      await page.goto('/distribution');

      // Default is equal
      await expect(page.getByRole('button', { name: 'Equal' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Weighted' })).toBeVisible();

      // Switch to weighted
      await page.getByRole('button', { name: 'Weighted' }).click();
      // In weighted mode, amount column header changes
      await expect(page.getByText('Amount').first()).toBeVisible();
    });

    test('equal mode shows amount per address input', async ({ page }) => {
      await page.goto('/distribution');
      await page.getByRole('button', { name: 'Equal' }).click();
      await expect(page.getByPlaceholder('Amount')).toBeVisible();
    });

    test('Distribute Token button is disabled with empty recipients', async ({ page }) => {
      await page.goto('/distribution');
      // Remove all rows
      const deleteButtons = page.locator('tbody tr button');
      const count = await deleteButtons.count();
      for (let i = 0; i < count; i++) {
        await page.locator('tbody tr button').first().click();
      }
      await expect(page.getByRole('button', { name: /distribute token/i })).toBeDisabled();
    });

    test('CSV upload area is visible', async ({ page }) => {
      await page.goto('/distribution');
      await expect(page.getByText(/drag and drop a csv file/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /select file/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /download template/i })).toBeVisible();
    });

    test('uploading a valid CSV adds recipients', async ({ page }) => {
      await page.goto('/distribution');

      // Create a temp CSV file
      const csvContent = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF\nGBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\n';
      const tmpFile = path.join(os.tmpdir(), 'test-recipients.csv');
      fs.writeFileSync(tmpFile, csvContent);

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(tmpFile);

      // Should show success message
      await expect(page.getByText(/successfully imported/i)).toBeVisible({ timeout: 5000 });

      fs.unlinkSync(tmpFile);
    });

    test('uploading an invalid CSV shows error', async ({ page }) => {
      await page.goto('/distribution');

      const csvContent = 'not-a-valid-address\nalso-invalid\n';
      const tmpFile = path.join(os.tmpdir(), 'bad-recipients.csv');
      fs.writeFileSync(tmpFile, csvContent);

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(tmpFile);

      // Should show error state
      await expect(
        page.getByText(/error|invalid|failed/i).first()
      ).toBeVisible({ timeout: 5000 });

      fs.unlinkSync(tmpFile);
    });

    test('token selector is visible and functional', async ({ page }) => {
      await page.goto('/distribution');
      await expect(page.getByRole('combobox').first()).toBeVisible();
    });
  });
});
