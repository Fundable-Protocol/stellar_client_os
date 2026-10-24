export type CampaignPublicationState = "draft" | "scheduled" | "active";
export interface CampaignSchedule { publishAt: string; state: CampaignPublicationState; }
export function getPublicationState(publishAt?: string, now = Date.now()): CampaignPublicationState {
  if (!publishAt) return "draft";
  return new Date(publishAt).getTime() > now ? "scheduled" : "active";
}
export function isCampaignVisibleToPublic(schedule?: CampaignSchedule, now = Date.now()): boolean {
  return !schedule || schedule.state === "active" || new Date(schedule.publishAt).getTime() <= now;
}
