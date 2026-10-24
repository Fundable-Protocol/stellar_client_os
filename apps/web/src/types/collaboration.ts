export type CoCreatorRole =
  | "OWNER"
  | "CO_CREATOR"
  | "EDITOR"
  | "ANALYST"
  | "SUPPORT"
  | "VIEWER";

export interface CampaignPermissions {
  canEditDetails: boolean;
  canEditGoals: boolean;
  canEditTimeline: boolean;
  canManageCollaborators: boolean;
  canWithdrawFunds: boolean;
  canDeleteCampaign: boolean;
  /** View analytics, reports and milestone proof. ANALYST-only by default. */
  canViewAnalytics?: boolean;
  /** Handle supporter questions and moderation. SUPPORT-only by default. */
  canModerateSupport?: boolean;
}

/** All roles that can be granted to an invited co-manager. */
export const INVITABLE_ROLES: CoCreatorRole[] = [
  "CO_CREATOR",
  "EDITOR",
  "ANALYST",
  "SUPPORT",
  "VIEWER",
];

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
  ANALYST: {
    canEditDetails: false,
    canEditGoals: false,
    canEditTimeline: false,
    canManageCollaborators: false,
    canWithdrawFunds: false,
    canDeleteCampaign: false,
    canViewAnalytics: true,
  },
  SUPPORT: {
    canEditDetails: false,
    canEditGoals: false,
    canEditTimeline: false,
    canManageCollaborators: false,
    canWithdrawFunds: false,
    canDeleteCampaign: false,
    canModerateSupport: true,
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
  /** Email address the invitation was sent to, if it was sent via email. */
  inviteeEmail?: string;
  createdAt: number;
  expiresAt: number;
  isUsed: boolean;
  maxUses?: number;
  usedCount?: number;
}

export type CampaignPermissionKey = keyof CampaignPermissions;

/**
 * Returns true if `role` grants the requested `permission`.
 * Missing optional permission flags default to `false`.
 */
export function hasPermission(
  role: CoCreatorRole,
  permission: CampaignPermissionKey
): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return Boolean(perms[permission]);
}

export function formatTruncatedAddress(address: string): string {
  if (!address || address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
