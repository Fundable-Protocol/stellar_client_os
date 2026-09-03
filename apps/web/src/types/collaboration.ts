export type CoCreatorRole = "OWNER" | "CO_CREATOR" | "EDITOR" | "VIEWER";

export interface CampaignPermissions {
  canEditDetails: boolean;
  canEditGoals: boolean;
  canEditTimeline: boolean;
  canManageCollaborators: boolean;
  canWithdrawFunds: boolean;
  canDeleteCampaign: boolean;
}

export const ROLE_PERMISSIONS: Record<CoCreatorRole, CampaignPermissions> = {
  OWNER: {
    canEditDetails: true,
    canEditGoals: true,
    canEditTimeline: true,
    canManageCollaborators: true,
    canWithdrawFunds: true,
    canDeleteCampaign: true,
  },
  CO_CREATOR: {
    canEditDetails: true,
    canEditGoals: true,
    canEditTimeline: true,
    canManageCollaborators: true,
    canWithdrawFunds: false,
    canDeleteCampaign: false,
  },
  EDITOR: {
    canEditDetails: true,
    canEditGoals: false,
    canEditTimeline: true,
    canManageCollaborators: false,
    canWithdrawFunds: false,
    canDeleteCampaign: false,
  },
  VIEWER: {
    canEditDetails: false,
    canEditGoals: false,
    canEditTimeline: false,
    canManageCollaborators: false,
    canWithdrawFunds: false,
    canDeleteCampaign: false,
  },
};

export interface CoCreator {
  id: string;
  campaignId: string;
  name: string;
  email?: string;
  stellarAddress: string;
  role: CoCreatorRole;
  avatarUrl?: string;
  joinedAt: number; // timestamp ms
  invitedBy: string;
}

export interface CoCreatorInvite {
  token: string;
  campaignId: string;
  campaignTitle: string;
  role: CoCreatorRole;
  invitedBy: string;
  invitedByName: string;
  createdAt: number;
  expiresAt: number;
  isUsed: boolean;
  maxUses?: number;
  usedCount?: number;
}
