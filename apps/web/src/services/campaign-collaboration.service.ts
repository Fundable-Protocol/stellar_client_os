import { CoCreator, CoCreatorInvite, CoCreatorRole } from "@/types/collaboration";

const initialCollaborators: CoCreator[] = [
  {
    id: "col-1",
    campaignId: "camp-101",
    name: "Alex Rivera (Owner)",
    email: "alex@fundable.org",
    stellarAddress: "GD6W...X892",
    role: "OWNER",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
    joinedAt: Date.now() - 30 * 86400000,
    invitedBy: "SYSTEM",
  },
  {
    id: "col-2",
    campaignId: "camp-101",
    name: "Dr. Maya Lin",
    email: "maya@rainforest.org",
    stellarAddress: "GB88...K992",
    role: "CO_CREATOR",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
    joinedAt: Date.now() - 10 * 86400000,
    invitedBy: "GD6W...X892",
  },
];

const initialInvites: CoCreatorInvite[] = [
  {
    token: "inv_demo_token_123",
    campaignId: "camp-101",
    campaignTitle: "Save the Amazon RainForest Reserve",
    role: "CO_CREATOR",
    invitedBy: "GD6W...X892",
    invitedByName: "Alex Rivera",
    createdAt: Date.now() - 3600000,
    expiresAt: Date.now() + 7 * 86400000,
    isUsed: false,
    maxUses: 5,
    usedCount: 1,
  },
];

class CampaignCollaborationService {
  private collaborators = new Map<string, CoCreator[]>();
  private invites = new Map<string, CoCreatorInvite>();

  constructor() {
    this.collaborators.set("camp-101", initialCollaborators);
    initialInvites.forEach((inv) => this.invites.set(inv.token, inv));
  }

  getCollaborators(campaignId: string): CoCreator[] {
    return this.collaborators.get(campaignId) || [];
  }

  createInviteToken(params: {
    campaignId: string;
    campaignTitle: string;
    role: CoCreatorRole;
    invitedBy: string;
    invitedByName: string;
    expiresInDays?: number;
  }): CoCreatorInvite {
    const token = `inv_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
    const days = params.expiresInDays || 7;
    const invite: CoCreatorInvite = {
      token,
      campaignId: params.campaignId,
      campaignTitle: params.campaignTitle,
      role: params.role,
      invitedBy: params.invitedBy,
      invitedByName: params.invitedByName,
      createdAt: Date.now(),
      expiresAt: Date.now() + days * 86400000,
      isUsed: false,
      maxUses: 10,
      usedCount: 0,
    };

    this.invites.set(token, invite);
    return invite;
  }

  getInviteByToken(token: string): CoCreatorInvite | null {
    const invite = this.invites.get(token);
    if (!invite) return null;
    if (invite.expiresAt < Date.now()) return null;
    return invite;
  }

  acceptInvite(token: string, user: { name: string; email?: string; stellarAddress: string }): { success: boolean; collaborator?: CoCreator; error?: string } {
    const invite = this.getInviteByToken(token);
    if (!invite) {
      return { success: false, error: "Invitation token is invalid or expired." };
    }

    const currentList = this.collaborators.get(invite.campaignId) || [];
    const existing = currentList.find((c) => c.stellarAddress.toLowerCase() === user.stellarAddress.toLowerCase());
    if (existing) {
      return { success: true, collaborator: existing };
    }

    const newCollaborator: CoCreator = {
      id: `col-${Date.now()}`,
      campaignId: invite.campaignId,
      name: user.name,
      email: user.email,
      stellarAddress: user.stellarAddress,
      role: invite.role,
      joinedAt: Date.now(),
      invitedBy: invite.invitedBy,
    };

    currentList.push(newCollaborator);
    this.collaborators.set(invite.campaignId, currentList);

    invite.usedCount = (invite.usedCount || 0) + 1;
    if (invite.maxUses && invite.usedCount >= invite.maxUses) {
      invite.isUsed = true;
    }

    return { success: true, collaborator: newCollaborator };
  }

  removeCollaborator(campaignId: string, collaboratorId: string): boolean {
    const list = this.collaborators.get(campaignId) || [];
    const updated = list.filter((c) => c.id !== collaboratorId && c.role !== "OWNER");
    this.collaborators.set(campaignId, updated);
    return true;
  }

  updateRole(campaignId: string, collaboratorId: string, newRole: CoCreatorRole): boolean {
    const list = this.collaborators.get(campaignId) || [];
    const item = list.find((c) => c.id === collaboratorId);
    if (item && item.role !== "OWNER") {
      item.role = newRole;
      return true;
    }
    return false;
  }
}

export const collaborationService = new CampaignCollaborationService();
