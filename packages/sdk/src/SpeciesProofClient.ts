/**
 * Fundable Stellar SDK - Tree Species Verification Proof Client
 *
 * Implements anti-fraud species proof validation and declared species requirements (Issue #838).
 */

export interface DeclaredSpeciesDto {
  speciesName: string;
  speciesCode: string;
  targetCount: number;
}

export interface VerificationProofDto {
  plantingId: number;
  speciesCode: string;
  photoIpfsCid: string;
  photoHash: string;
  isVerified: boolean;
}

export class SpeciesProofClient {
  constructor(
    public readonly contractAddress: string,
    public readonly rpcUrl?: string
  ) {}

  /**
   * Validate that proof matches one of the campaign declared species codes.
   */
  static validateProofMatch(declaredList: DeclaredSpeciesDto[], proofCode: string): boolean {
    if (!declaredList || declaredList.length === 0) return true;
    return declaredList.some(d => d.speciesCode.toLowerCase() === proofCode.toLowerCase());
  }

  /**
   * Check photo CID and hash validity.
   */
  static validateProofPayload(photoIpfsCid: string, photoHash: string): boolean {
    return Boolean(photoIpfsCid && photoIpfsCid.length > 5 && photoHash && photoHash.length >= 8);
  }
}
