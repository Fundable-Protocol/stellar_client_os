import { useState, useEffect, useCallback } from 'react';
import { CampaignCompletionNFT, SponsorPersonalImpactNFT } from '@/types/impact-nft';

export interface UseCampaignImpactNFTReturn {
  completionNFT: CampaignCompletionNFT | null;
  personalImpactNFT: SponsorPersonalImpactNFT | null;
  isLoading: boolean;
  isMintingCompletion: boolean;
  isMintingPersonal: boolean;
  error: string | null;
  mintCompletionNFT: () => Promise<CampaignCompletionNFT | null>;
  mintPersonalImpactNFT: (addressOverride?: string) => Promise<SponsorPersonalImpactNFT | null>;
  refetch: () => Promise<void>;
}

export function useCampaignImpactNFT(
  campaignId: string,
  sponsorAddress?: string
): UseCampaignImpactNFTReturn {
  const [completionNFT, setCompletionNFT] = useState<CampaignCompletionNFT | null>(null);
  const [personalImpactNFT, setPersonalImpactNFT] = useState<SponsorPersonalImpactNFT | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMintingCompletion, setIsMintingCompletion] = useState<boolean>(false);
  const [isMintingPersonal, setIsMintingPersonal] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNFTs = useCallback(async () => {
    if (!campaignId) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch Completion NFT
      const compRes = await fetch(`/api/campaigns/${campaignId}/completion-nft`);
      if (compRes.ok) {
        const compData = await compRes.json();
        if (compData.success && compData.nft) {
          setCompletionNFT(compData.nft);
        }
      } else if (compRes.status !== 404) {
        const errData = await compRes.json().catch(() => ({}));
        console.warn('Failed to fetch completion NFT:', errData.error);
      }

      // 2. Fetch Personal Impact NFT if sponsorAddress provided
      if (sponsorAddress) {
        const persRes = await fetch(
          `/api/campaigns/${campaignId}/personal-impact-nft?sponsorAddress=${encodeURIComponent(sponsorAddress)}`
        );
        if (persRes.ok) {
          const persData = await persRes.json();
          if (persData.success && persData.nft) {
            setPersonalImpactNFT(persData.nft);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching impact NFTs');
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, sponsorAddress]);

  useEffect(() => {
    void fetchNFTs();
  }, [fetchNFTs]);

  const mintCompletionNFT = async (): Promise<CampaignCompletionNFT | null> => {
    setIsMintingCompletion(true);
    setError(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/completion-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to mint campaign completion NFT');
      }

      setCompletionNFT(data.nft);
      return data.nft;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsMintingCompletion(false);
    }
  };

  const mintPersonalImpactNFT = async (addressOverride?: string): Promise<SponsorPersonalImpactNFT | null> => {
    const targetAddress = addressOverride || sponsorAddress;
    if (!targetAddress) {
      setError('Sponsor address is required to mint personal impact NFT');
      return null;
    }

    setIsMintingPersonal(true);
    setError(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/personal-impact-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorAddress: targetAddress }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to mint personal impact NFT');
      }

      setPersonalImpactNFT(data.nft);
      return data.nft;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsMintingPersonal(false);
    }
  };

  return {
    completionNFT,
    personalImpactNFT,
    isLoading,
    isMintingCompletion,
    isMintingPersonal,
    error,
    mintCompletionNFT,
    mintPersonalImpactNFT,
    refetch: fetchNFTs,
  };
}
