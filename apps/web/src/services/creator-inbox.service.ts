import { EmailService } from "./email.service";

export interface CreatorInboxMessage {
  id: string;
  campaignId: string;
  creatorAddress: string;
  creatorEmail?: string;
  question: string;
  backerContact?: string;
  backerAddress?: string;
  createdAt: number;
  status: "unread" | "read" | "replied";
  escalatedFrom: "campaign_chatbot";
}

export interface EscalateToCreatorInput {
  campaignId: string;
  creatorAddress: string;
  creatorEmail?: string;
  question: string;
  backerContact?: string;
  backerAddress?: string;
}

export interface CreatorEmailer {
  sendEmail(options: { to: string; subject: string; html: string }): Promise<boolean>;
}

const inboxMessages: CreatorInboxMessage[] = [];

export async function escalateToCreatorInbox(
  input: EscalateToCreatorInput,
  emailer: CreatorEmailer = new EmailService(),
): Promise<CreatorInboxMessage> {
  if (!input.campaignId?.trim()) {
    throw new Error("campaignId is required");
  }
  if (!input.question?.trim()) {
    throw new Error("question is required");
  }

  const message: CreatorInboxMessage = {
    id: `inbox-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    campaignId: input.campaignId,
    creatorAddress: input.creatorAddress || "unknown",
    creatorEmail: input.creatorEmail,
    question: input.question.trim(),
    backerContact: input.backerContact?.trim() || undefined,
    backerAddress: input.backerAddress?.trim() || undefined,
    createdAt: Date.now(),
    status: "unread",
    escalatedFrom: "campaign_chatbot",
  };

  inboxMessages.push(message);

  if (input.creatorEmail) {
    try {
      await emailer.sendEmail({
        to: input.creatorEmail,
        subject: `[Fundable] Question from backer on campaign ${input.campaignId}`,
        html: `<p>A backer asked a question that was escalated by the campaign chatbot:</p>
<blockquote>${message.question}</blockquote>
${message.backerContact ? `<p><strong>Backer Contact:</strong> ${message.backerContact}</p>` : ""}
${message.backerAddress ? `<p><strong>Backer Wallet:</strong> ${message.backerAddress}</p>` : ""}
<p>Log in to your creator dashboard to respond.</p>`,
      });
    } catch (err) {
      console.warn(`[CreatorInboxService] Failed to notify creator via email:`, err);
    }
  }

  return message;
}

export function getCreatorInboxMessages(creatorAddressOrCampaignId?: string): CreatorInboxMessage[] {
  if (!creatorAddressOrCampaignId) {
    return [...inboxMessages];
  }
  return inboxMessages.filter(
    (msg) =>
      msg.creatorAddress === creatorAddressOrCampaignId ||
      msg.campaignId === creatorAddressOrCampaignId,
  );
}

export function clearCreatorInbox(): void {
  inboxMessages.length = 0;
}
