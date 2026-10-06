/**
 * Species Verification Web Service
 *
 * Verifies submitted photo proofs against campaign declared species to prevent fraudulent claims (Issue #838).
 */

export interface SpeciesProofAudit {
  campaignId: number;
  plantingId: number;
  declaredSpecies: string[];
  submittedSpecies: string;
  hasMatchingDeclaration: boolean;
  photoVerified: boolean;
  status: 'Approved' | 'Rejected_Mismatch' | 'Pending_Audit';
}

export class SpeciesVerificationService {
  static auditSpeciesProof(
    campaignId: number,
    plantingId: number,
    declaredSpecies: string[],
    submittedSpecies: string,
    isPhotoValid: boolean
  ): SpeciesProofAudit {
    const hasMatchingDeclaration = declaredSpecies.length === 0 || declaredSpecies.includes(submittedSpecies);
    let status: SpeciesProofAudit['status'] = 'Pending_Audit';

    if (!hasMatchingDeclaration) {
      status = 'Rejected_Mismatch';
    } else if (isPhotoValid) {
      status = 'Approved';
    }

    return {
      campaignId,
      plantingId,
      declaredSpecies,
      submittedSpecies,
      hasMatchingDeclaration,
      photoVerified: isPhotoValid,
      status,
    };
  }
}
