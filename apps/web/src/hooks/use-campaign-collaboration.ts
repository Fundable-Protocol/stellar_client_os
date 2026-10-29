"use client";

import { useState, useCallback, useMemo } from "react";
import { CoCreator, CoCreatorInvite, CoCreatorRole, ROLE_PERMISSIONS } from "@/types/collaboration";
import { collaborationService } from "@/services/campaign-collaboration.service";

export interface UseCampaignCollaborationOptions {
  campaignId: string;
  campaignTitle?: string;
  currentUserAddress?: string;
}

export function useCampaignCollaboration({
  campaignId,
  campaignTitle = "Save the Amazon RainForest Reserve",
  currentUserAddress = "GD6W...X892",
}: UseCampaignCollaborationOptions) {
  const [prevCampaignId, setPrevCampaignId] = useState(campaignId);
  const [collaborators, setCollaborators] = useState<CoCreator[]>(() => [
    ...collaborationService.getCollaborators(campaignId),
  ]);
  const [activeInvites, setActiveInvites] = useState<CoCreatorInvite[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  if (prevCampaignId !== campaignId) {
    setPrevCampaignId(campaignId);
    const list = collaborationService.getCollaborators(campaignId);
    setCollaborators([...list]);
  }

  const reloadData = useCallback(() => {
    const list = collaborationService.getCollaborators(campaignId);
    setCollaborators([...list]);
  }, [campaignId]);

  const currentUserRole = useMemo<CoCreatorRole>(() => {
    const found = collaborators.find(
      (c) => c.stellarAddress.toLowerCase() === currentUserAddress.toLowerCase()
    );
    return found ? found.role : "OWNER";
  }, [collaborators, currentUserAddress]);

  const userPermissions = useMemo(() => {
    return ROLE_PERMISSIONS[currentUserRole];
  }, [currentUserRole]);

  const createInvite = useCallback(
    async (role: CoCreatorRole, expiresInDays = 7, inviteeEmail?: string) => {
      // Create the invitation server-side so the backend can deliver it by
      // email (#1197). Falls back to the local in-memory service if the API is
      // unavailable (e.g. during static demo rendering).
      let invite: CoCreatorInvite;
      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/collaborators`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            invitedBy: currentUserAddress,
            invitedByName: "Campaign Owner",
            inviteeEmail,
            expiresInDays,
            campaignTitle,
            origin: typeof window !== "undefined" ? window.location.origin : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.invite) throw new Error(json.error || "invite failed");
        invite = json.invite as CoCreatorInvite;
      } catch {
        invite = collaborationService.createInviteToken({
          campaignId,
          campaignTitle,
          role,
          invitedBy: currentUserAddress,
          invitedByName: "Campaign Owner",
          inviteeEmail,
          expiresInDays,
        });
      }

      setActiveInvites((prev) => [invite, ...prev.filter((i) => i.token !== invite.token)]);
      return invite;
    },
    [campaignId, campaignTitle, currentUserAddress]
  );

  const getShareableUrl = useCallback((token: string) => {
    if (typeof window === "undefined") return `/campaigns/invite/${token}`;
    return `${window.location.origin}/campaigns/invite/${token}`;
  }, []);

  const copyInviteLink = useCallback(
    (token: string) => {
      const url = getShareableUrl(token);
      navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2500);
    },
    [getShareableUrl]
  );

  const removeCollaborator = useCallback(
    (collaboratorId: string) => {
      collaborationService.removeCollaborator(campaignId, collaboratorId);
      reloadData();
    },
    [campaignId, reloadData]
  );

  const updateRole = useCallback(
    (collaboratorId: string, newRole: CoCreatorRole) => {
      collaborationService.updateRole(campaignId, collaboratorId, newRole);
      reloadData();
    },
    [campaignId, reloadData]
  );

  return {
    collaborators,
    activeInvites,
    currentUserRole,
    userPermissions,
    copiedToken,
    createInvite,
    getShareableUrl,
    copyInviteLink,
    removeCollaborator,
    updateRole,
    reloadData,
  };
}
