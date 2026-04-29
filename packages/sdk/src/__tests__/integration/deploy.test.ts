import { describe, it, expect, beforeAll } from 'vitest';
import { ContractDeployer } from '../../ContractDeployer';
import { TEST_CONFIG } from './setup';

describe('Deployer Integration (Soroban)', () => {
  let deployer: ContractDeployer;

  beforeAll(() => {
    deployer = new ContractDeployer({
      rpcUrl: TEST_CONFIG.rpcUrl,
      networkPassphrase: TEST_CONFIG.networkPassphrase,
    });
  });

  it('should upload WASM successfully', async () => {
    const wasmBuffer = Buffer.from([]); // replace with real wasm

    const result = await deployer.uploadWasm(
      wasmBuffer,
      TEST_CONFIG.secretKey
    );

    expect(result.wasmHash).toBeDefined();
  });

  it('should deploy contract instance', async () => {
    const wasmHash = 'SOME_HASH'; // from previous step

    const result = await deployer.deployContract({
      wasmHash,
      signer: TEST_CONFIG.secretKey,
      initParams: {},
    });

    expect(result.contractId).toBeDefined();
  });
});
