import { describe, it, expect } from 'vitest';
import { SpeciesProofClient, DeclaredSpeciesDto } from '../SpeciesProofClient';

describe('SpeciesProofClient', () => {
  const declared: DeclaredSpeciesDto[] = [
    { speciesName: 'Oak', speciesCode: 'OAK_32', targetCount: 100 },
    { speciesName: 'Baobab', speciesCode: 'BAOB_32', targetCount: 200 },
  ];

  it('validates matching species proof', () => {
    expect(SpeciesProofClient.validateProofMatch(declared, 'OAK_32')).toBe(true);
    expect(SpeciesProofClient.validateProofMatch(declared, 'BAOB_32')).toBe(true);
  });

  it('rejects mismatched species proof to prevent fraud', () => {
    expect(SpeciesProofClient.validateProofMatch(declared, 'FAKE_PINE')).toBe(false);
  });

  it('validates photographic IPFS payload format', () => {
    expect(SpeciesProofClient.validateProofPayload('ipfs://bafy123', 'hash12345')).toBe(true);
    expect(SpeciesProofClient.validateProofPayload('', '')).toBe(false);
  });
});
