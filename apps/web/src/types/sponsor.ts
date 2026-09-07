export type SponsorTier = "PLATINUM" | "GOLD" | "SILVER" | "BRONZE";

export interface Sponsor {
  id: string;
  campaignId: string;
  name?: string;
  address: string;
  avatarUrl?: string;
  amount: string;
  token: string;
  tier: SponsorTier;
  sponsoredAt: number; // Unix timestamp ms
  message?: string;
  isRecent?: boolean; // Highlight badge for live incoming sponsors
}

export function calculateSponsorTier(amountStr: string): SponsorTier {
  const num = parseFloat(amountStr) || 0;
  if (num >= 10000) return "PLATINUM";
  if (num >= 2500) return "GOLD";
  if (num >= 500) return "SILVER";
  return "BRONZE";
}

export function formatTruncatedAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const INITIAL_MOCK_SPONSORS: Sponsor[] = [
  {
    id: "sp-1",
    campaignId: "camp-101",
    name: "Satoshi Forestry Fund",
    address: "GD6W...X892",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
    amount: "15000",
    token: "XLM",
    tier: "PLATINUM",
    sponsoredAt: Date.now() - 15 * 60000,
    message: "Supporting carbon offset initiatives on Stellar network!",
  },
  {
    id: "sp-2",
    campaignId: "camp-101",
    name: "EcoDAO Ventures",
    address: "GA7B...M221",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80",
    amount: "5000",
    token: "USDC",
    tier: "GOLD",
    sponsoredAt: Date.now() - 2 * 3600000,
    message: "Keep up the amazing work for clean water access.",
  },
  {
    id: "sp-3",
    campaignId: "camp-101",
    name: "Elena Rostova",
    address: "GB88...K992",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
    amount: "1000",
    token: "XLM",
    tier: "SILVER",
    sponsoredAt: Date.now() - 5 * 3600000,
  },
  {
    id: "sp-4",
    campaignId: "camp-101",
    address: "GC11...P443",
    amount: "250",
    token: "XLM",
    tier: "BRONZE",
    sponsoredAt: Date.now() - 12 * 3600000,
    message: "Small contributions add up!",
  },
  {
    id: "sp-5",
    campaignId: "camp-101",
    name: "GreenFuture Capital",
    address: "GD99...Z100",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80",
    amount: "12500",
    token: "XLM",
    tier: "PLATINUM",
    sponsoredAt: Date.now() - 24 * 3600000,
  },
  {
    id: "sp-6",
    campaignId: "camp-101",
    name: "Marcus Vance",
    address: "GB44...R771",
    amount: "600",
    token: "USDC",
    tier: "SILVER",
    sponsoredAt: Date.now() - 36 * 3600000,
  },
];
