import { randomUUID } from "node:crypto";
import type {
  VerifiedCampaignDiscussionActor,
  VerifiedCampaignDiscussionVoter,
} from "./campaign-discussion-auth.service";

export interface CampaignDiscussionComment {
  id: string;
  campaignId: string;
  parentId: string | null;
  authorName: string;
  authorAddress?: string;
  content: string;
  createdAt: number;
  upvotes: number;
  hasUpvoted: boolean;
  isCreatorReply: boolean;
  officialAnswer: boolean;
  pinned: boolean;
}

interface StoredCampaignDiscussionComment extends Omit<CampaignDiscussionComment, "hasUpvoted"> {
  voterIds: Set<string>;
}

const discussions = new Map<string, StoredCampaignDiscussionComment[]>();

export const DISCUSSION_CONTENT_MAX_LENGTH = 1000;
export const DISCUSSION_AUTHOR_NAME_MAX_LENGTH = 60;

export type CampaignDiscussionErrorCode =
  | "invalid_content"
  | "invalid_author_name"
  | "parent_not_found"
  | "invalid_voter"
  | "comment_not_found"
  | "creator_required"
  | "invalid_official_answer";

const CAMPAIGN_DISCUSSION_ERROR_MESSAGES: Record<CampaignDiscussionErrorCode, string> = {
  invalid_content: `Comment must be between 1 and ${DISCUSSION_CONTENT_MAX_LENGTH} characters.`,
  invalid_author_name: `Name must be between 1 and ${DISCUSSION_AUTHOR_NAME_MAX_LENGTH} characters.`,
  parent_not_found: "The comment being replied to was not found.",
  invalid_voter: "A valid voter identity is required.",
  comment_not_found: "Comment not found.",
  creator_required: "Only the campaign creator can perform this action.",
  invalid_official_answer: "Only the creator can mark a reply as an official answer.",
};

export class CampaignDiscussionError extends Error {
  constructor(readonly code: CampaignDiscussionErrorCode) {
    super(CAMPAIGN_DISCUSSION_ERROR_MESSAGES[code]);
    this.name = "CampaignDiscussionError";
  }
}

function findComment(campaignId: string, commentId: string) {
  return (discussions.get(campaignId) ?? []).find((comment) => comment.id === commentId);
}

function toPublicComment(comment: StoredCampaignDiscussionComment, voterId?: string): CampaignDiscussionComment {
  const { voterIds, ...publicComment } = comment;
  return { ...publicComment, hasUpvoted: Boolean(voterId && voterIds.has(voterId)) };
}

function compareComments(left: StoredCampaignDiscussionComment, right: StoredCampaignDiscussionComment): number {
  return Number(right.pinned) - Number(left.pinned)
    || right.upvotes - left.upvotes
    || right.createdAt - left.createdAt;
}

export function listCampaignDiscussionComments(campaignId: string, voterId?: string): CampaignDiscussionComment[] {
  return [...(discussions.get(campaignId) ?? [])]
    .sort(compareComments)
    .map((comment) => toPublicComment(comment, voterId));
}

export function createCampaignDiscussionComment(input: {
  campaignId: string;
  parentId?: string;
  authorName: string;
  actor?: VerifiedCampaignDiscussionActor;
  content: string;
  officialAnswer?: boolean;
  creatorAddress: string;
  now?: number;
}): CampaignDiscussionComment {
  const content = input.content.trim();
  const authorName = input.authorName.trim();
  if (!content || content.length > DISCUSSION_CONTENT_MAX_LENGTH) {
    throw new CampaignDiscussionError("invalid_content");
  }
  if (!authorName || authorName.length > DISCUSSION_AUTHOR_NAME_MAX_LENGTH) {
    throw new CampaignDiscussionError("invalid_author_name");
  }

  const comments = discussions.get(input.campaignId) ?? [];
  let parentId: string | null = null;
  if (input.parentId) {
    if (!comments.some((comment) => comment.id === input.parentId)) {
      throw new CampaignDiscussionError("parent_not_found");
    }
    parentId = input.parentId;
  }

  const isCreatorReply = Boolean(
    input.actor
      && input.actor.address.trim().toLowerCase() === input.creatorAddress.trim().toLowerCase(),
  );
  if (input.officialAnswer && (!isCreatorReply || !parentId)) {
    throw new CampaignDiscussionError("invalid_official_answer");
  }

  const comment: StoredCampaignDiscussionComment = {
    id: randomUUID(),
    campaignId: input.campaignId,
    parentId,
    authorName,
    ...(input.actor ? { authorAddress: input.actor.address } : {}),
    content,
    createdAt: input.now ?? Date.now(),
    upvotes: 0,
    voterIds: new Set(),
    isCreatorReply,
    officialAnswer: Boolean(input.officialAnswer),
    pinned: false,
  };
  comments.push(comment);
  discussions.set(input.campaignId, comments);
  return toPublicComment(comment);
}

export function setCampaignDiscussionUpvote(
  campaignId: string,
  commentId: string,
  voter: VerifiedCampaignDiscussionVoter,
  upvoted: boolean,
): CampaignDiscussionComment {
  const voterId = voter.id;
  if (!voterId) throw new CampaignDiscussionError("invalid_voter");
  const comment = findComment(campaignId, commentId);
  if (!comment) throw new CampaignDiscussionError("comment_not_found");

  const hasUpvoted = comment.voterIds.has(voterId);
  if (upvoted !== hasUpvoted) {
    if (upvoted) {
      comment.voterIds.add(voterId);
      comment.upvotes += 1;
    } else {
      comment.voterIds.delete(voterId);
      comment.upvotes -= 1;
    }
  }
  return toPublicComment(comment, voterId);
}

export function toggleCampaignDiscussionPin(input: {
  campaignId: string;
  commentId: string;
  actor: VerifiedCampaignDiscussionActor;
  creatorAddress: string;
}): CampaignDiscussionComment {
  if (input.actor.address.trim().toLowerCase() !== input.creatorAddress.trim().toLowerCase()) {
    throw new CampaignDiscussionError("creator_required");
  }
  const comment = findComment(input.campaignId, input.commentId);
  if (!comment) throw new CampaignDiscussionError("comment_not_found");
  comment.pinned = !comment.pinned;
  return toPublicComment(comment);
}

export function resetCampaignDiscussion(): void {
  discussions.clear();
}
