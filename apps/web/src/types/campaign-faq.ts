/**
 * Campaign FAQ Types — Issue #1196
 *
 * Allow creators to add a structured FAQ section (question/answer pairs)
 * to their campaign page, with drag-and-drop reordering support.
 */

export interface CampaignFaqItem {
  id: string;
  campaignId: string;
  question: string;
  answer: string;
  /** 0-based display order; drag-and-drop saves a new order array. */
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateFaqItemInput {
  campaignId: string;
  question: string;
  answer: string;
}

export interface UpdateFaqItemInput {
  question?: string;
  answer?: string;
}

/** Payload sent when the creator saves a new drag-and-drop order. */
export interface ReorderFaqItemsInput {
  /** Ordered list of FAQ item IDs reflecting the new display order. */
  orderedIds: string[];
}

export const FAQ_QUESTION_MAX_LENGTH = 200;
export const FAQ_ANSWER_MAX_LENGTH = 2000;
export const FAQ_MAX_ITEMS = 20;
