import { config } from 'dotenv';

config({ path: '.env.integration' });

export const TEST_CONFIG = {
  rpcUrl: process.env.SOROBAN_RPC_URL!,
  networkPassphrase: process.env.SOROBAN_NETWORK_PASSPHRASE!,
  secretKey: process.env.TEST_SECRET_KEY!,
};

if (!TEST_CONFIG.rpcUrl) {
  throw new Error('Missing integration test config');
}
