import { Page } from '@playwright/test';

export const MOCK_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/**
 * Injects a connected wallet state into localStorage before the page loads.
 * This bypasses the real browser extension entirely.
 */
export async function injectConnectedWallet(page: Page, address = MOCK_ADDRESS) {
  await page.addInitScript((addr) => {
    localStorage.setItem('stellar_wallet_address', addr);
    localStorage.setItem('stellar_wallet_id', 'freighter');
    localStorage.setItem('stellar_wallet_network', 'Test SDF Network ; September 2015');
  }, address);
}

/**
 * Clears wallet state so the page loads as disconnected.
 */
export async function clearWalletState(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('stellar_wallet_address');
    localStorage.removeItem('stellar_wallet_id');
    localStorage.removeItem('stellar_wallet_network');
  });
}

/**
 * Mocks all Soroban RPC calls so no real network requests are made.
 */
export async function mockRpcCalls(page: Page) {
  await page.route('**/soroban-testnet.stellar.org/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: { status: 'SUCCESS', ledger: 1 } }),
    });
  });

  await page.route('**/horizon-testnet.stellar.org/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ _embedded: { records: [] } }),
    });
  });
}
