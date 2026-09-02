"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
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
  const [collaborators, setCollaborators] = useState<CoCreator[]>([]);
  const [activeInvites, setActiveInvites] = useState<CoCreatorInvite[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const reloadData = useCallback(() => {
    const list = collaborationService.getCollaborators(campaignId);
    setCollaborators([...list]);
  }, [campaignId]);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  const currentUserRole = useMemo<CoCreatorRole>(() => {
    const found = collaborators.find(
      (c) => c.stellarAddress.toLowerCase() === currentUserAddress.toLowerCase()
    );
    return found ? found.role : "OWNER"; // Default owner if matches or initial mock
  }, [collaborators, currentUserAddress]);

  const userPermissions = useMemo(() => {
    return ROLE_PERMISSIONS[currentUserRole];
  }, [currentUserRole]);

  const createInvite = useCallback(
    (role: CoCreatorRole, expiresInDays = 7) => {
      const invite = collaborationService.createInviteToken({
        campaignId,
        campaignTitle,
        role,
        invitedBy: currentUserAddress,
        invitedByName: "Campaign Owner",
        expiresInDays,
      });

      setActiveInvites((prev) => [invite, ...prev]);
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
