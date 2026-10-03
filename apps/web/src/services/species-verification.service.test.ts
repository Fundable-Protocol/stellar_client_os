import { describe, it, expect } from 'vitest';
import { SpeciesVerificationService } from './species-verification.service';

describe('SpeciesVerificationService', () => {
  it('approves verification when photo matches declared species', () => {
    const audit = SpeciesVerificationService.auditSpeciesProof(
      838,
      1,
      ['Oak', 'Baobab'],
      'Baobab',
      true
    );
    expect(audit.status).toBe('Approved');
    expect(audit.hasMatchingDeclaration).toBe(true);
  });

  it('rejects verification when submitted species does not match declaration', () => {
    const audit = SpeciesVerificationService.auditSpeciesProof(
      838,
      1,
      ['Oak', 'Baobab'],
      'Eucalyptus',
      true
    );
    expect(audit.status).toBe('Rejected_Mismatch');
    expect(audit.hasMatchingDeclaration).toBe(false);
  });
});
