import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { VideoAnchorService } from './video-anchor.service';
import { Horizon, Account, Keypair } from '@stellar/stellar-sdk';

describe('VideoAnchorService', () => {
  const secretKey = 'SDY5JIORKMX3U5FATYRQCZWJECAS4BKZP7PTYRF2T42NIWQYGFMSZU34';
  const serverUrl = 'https://horizon-testnet.stellar.org';
  const validPubKey = 'GBIH62I7UM75JELC6BSQSOGGTQULDR7M2QNCWJDTMPEYNAK4UGJO6FCA';

  beforeEach(() => {
    vi.spyOn(Horizon.Server.prototype, 'loadAccount').mockResolvedValue(new Account(validPubKey, '1'));
    vi.spyOn(Horizon.Server.prototype, 'submitTransaction').mockResolvedValue({ successful: true, hash: 'mocked-hash' } as any);
    
    // Mock Keypair to avoid noble/curves Uint8Array vitest context issues
    vi.spyOn(Keypair, 'fromSecret').mockReturnValue({
      publicKey: () => validPubKey,
      sign: vi.fn(),
      signDecorated: vi.fn().mockReturnValue({ hint: vi.fn(), signature: vi.fn() }),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should construct the anchoring payload correctly', async () => {
    const service = new VideoAnchorService(serverUrl, secretKey);
    const campaignId = 'camp-123';
    const verifierId = 'ver-456';
    const timestamp = '2026-09-30T11:35:52Z';
    const videoHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    const { tx, result } = await service.anchorVideoProof(campaignId, verifierId, timestamp, videoHash);

    // Verify transaction contains the correct operations
    expect(tx.operations.length).toBe(4);
    
    // Check campaign_id
    expect(tx.operations[0].type).toBe('manageData');
    expect((tx.operations[0] as any).name).toBe('campaign_id');
    expect((tx.operations[0] as any).value.toString()).toBe(campaignId);

    // Check verifier_id
    expect(tx.operations[1].type).toBe('manageData');
    expect((tx.operations[1] as any).name).toBe('verifier_id');
    expect((tx.operations[1] as any).value.toString()).toBe(verifierId);

    // Check timestamp
    expect(tx.operations[2].type).toBe('manageData');
    expect((tx.operations[2] as any).name).toBe('timestamp');
    expect((tx.operations[2] as any).value.toString()).toBe(timestamp);

    // Check video_hash
    expect(tx.operations[3].type).toBe('manageData');
    expect((tx.operations[3] as any).name).toBe('video_hash');
    expect((tx.operations[3] as any).value.toString()).toBe(videoHash);

    // Verify the mock was called
    expect(result.successful).toBe(true);
    expect(result.hash).toBe('mocked-hash');
  });
});
