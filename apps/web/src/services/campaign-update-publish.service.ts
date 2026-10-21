/**
 * Publishing a campaign update and notifying its backers.
 *
 * Ties the update service (state) and the notification service (delivery)
 * together so both the "create straight as published" and the "publish a
 * draft" routes fan out identically.
 */

import {
  getCampaignUpdateDataSource,
  publishCampaignUpdate,
  type CampaignUpdateDataSource,
} from "./campaign-update.service";
import {
  dispatchCampaignUpdateNotifications,
  getCampaignUpdatePreferenceDataSource,
  type BackerRecipient,
  type CampaignUpdateDispatchReport,
  type CampaignUpdatePreferenceDataSource,
  type UpdateEmailSender,
} from "./campaign-update-notification.service";
import type { CampaignUpdatePost } from "@/types/campaign-update";

export interface PublishCampaignUpdateInput {
  updateId: string;
  campaign: { id: string; name: string };
  /** Recipients resolved for this campaign. */
  backers: BackerRecipient[];
  emailSender: UpdateEmailSender;
  /** Base URL used in the "read on Fundable" link. */
  origin?: string;
  now?: number;
  dataSource?: CampaignUpdateDataSource;
  preferences?: CampaignUpdatePreferenceDataSource;
}

export interface PublishCampaignUpdateResult {
  update: CampaignUpdatePost;
  report: CampaignUpdateDispatchReport;
}

/**
 * Publish an update and notify the campaign's backers.
 *
 * The update is marked published first, then the backers are notified. A
 * notification failure never prevents the update from going live — the report
 * carries the errors instead.
 */
export async function publishCampaignUpdateWithNotifications(
  input: PublishCampaignUpdateInput,
): Promise<PublishCampaignUpdateResult> {
  const {
    updateId,
    campaign,
    backers,
    emailSender,
    origin,
    now = Date.now(),
    dataSource = getCampaignUpdateDataSource(),
    preferences = getCampaignUpdatePreferenceDataSource(),
  } = input;

  const update = await publishCampaignUpdate(updateId, dataSource, now);

  const report = await dispatchCampaignUpdateNotifications({
    post: update,
    context: { campaignId: campaign.id, campaignName: campaign.name, origin },
    backers,
    emailSender,
    now,
    preferences,
  });

  return { update, report };
}

/**
 * Resolve the backers that should receive a campaign update.
 *
 * Two sources are merged:
 *   - the notification preferences stored for the campaign (these carry the
 *     backer's email address), and
 *   - an explicit list supplied by the caller (the route accepts one so a
 *     client that already knows the backer list can pass it straight through).
 */
export async function resolveUpdateRecipients(
  campaignId: string,
  explicit: BackerRecipient[] = [],
  preferences = getCampaignUpdatePreferenceDataSource(),
): Promise<BackerRecipient[]> {
  const merged = new Map<string, BackerRecipient>();

  const stored = await preferences.getForCampaign(campaignId);
  for (const preference of stored) {
    merged.set(preference.backerId.trim().toLowerCase(), {
      backerId: preference.backerId,
      email: preference.email,
    });
  }

  for (const backer of explicit) {
    if (!backer?.backerId?.trim()) continue;
    const key = backer.backerId.trim().toLowerCase();
    const existing = merged.get(key);
    merged.set(key, {
      backerId: backer.backerId,
      email: backer.email ?? existing?.email,
    });
  }

  return Array.from(merged.values());
}
