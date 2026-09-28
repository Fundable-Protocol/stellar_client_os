import { EmailService } from "@/services/email.service";
import {
  getDueDigests,
  getPreferencesForCampaign,
  markNotified,
} from "@/services/notification-preferences.service";
import { isMilestoneEvent, type ProgressEvent } from "@/lib/notification-schedule";

export const runtime = "nodejs";

const emailService = new EmailService();

// ── Rendering ─────────────────────────────────────────────────────────────────

export interface DigestContent {
  subject: string;
  html: string;
}

export function renderDigestEmail(
  campaignId: string,
  campaignName: string,
  progressPct: number,
  trees: number,
): DigestContent {
  return {
    subject: `${campaignName}: ${progressPct}% funded`,
    html: `<div style="font-family:sans-serif">
  <h2>${campaignName} progress</h2>
  <p>The campaign you sponsor is now <strong>${progressPct}% funded</strong> with <strong>${trees}</strong> trees planted.</p>
  <p><a href="https://fundable.stellar/campaigns/${campaignId}">View campaign</a></p>
</div>`,
  };
}

export function renderMilestoneEmail(
  campaignId: string,
  campaignName: string,
  milestoneKey: string,
): DigestContent {
  const titles: Record<string, string> = {
    "25_percent": "25% funded 🌱",
    "50_percent": "Halfway there — 50% funded 🌳",
    "75_percent": "75% funded 🌿",
    goal_reached: "Goal reached! 🎉",
  };
  const title = titles[milestoneKey] ?? `Milestone reached: ${milestoneKey}`;

  return {
    subject: `${campaignName}: ${title}`,
    html: `<div style="font-family:sans-serif">
  <h2>${title}</h2>
  <p>The campaign you sponsor just hit a milestone.</p>
  <p><a href="https://fundable.stellar/campaigns/${campaignId}">View campaign</a></p>
</div>`,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

interface DispatchBody {
  event?: ProgressEvent;
  campaign?: { id?: string; name?: string; progressPct?: number; trees?: number };
}

/**
 * POST /api/notifications/dispatch
 *
 * Two modes:
 *  - No body (or `{}`): send due progress digests to every sponsor whose
 *    frequency interval has elapsed.
 *  - `{ event: { type: "milestone", milestoneKey, ... }, campaign: {...} }`:
 *    milestone events notify **all** sponsors of that campaign immediately,
 *    regardless of frequency.
 *
 * Returns a per-delivery report. Failures never abort the loop.
 */
export async function POST(request: Request) {
  let body: DispatchBody = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as DispatchBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const event = body.event;
  const deliveries: Array<{
    sponsorId: string;
    channel: string;
    ok: boolean;
    kind: "digest" | "milestone";
    error?: string;
  }> = [];

  try {
    if (isMilestoneEvent(event)) {
      const campaignId = String(body.campaign?.id ?? "");
      if (!campaignId) {
        return Response.json({ error: "campaign.id is required for milestone events" }, { status: 400 });
      }
      const prefs = await getPreferencesForCampaign(campaignId);
      const content = renderMilestoneEmail(
        campaignId,
        String(body.campaign?.name ?? "A campaign you sponsor"),
        event.milestoneKey,
      );

      for (const p of prefs) {
        try {
          if (p.channel === "email") {
            await emailService.sendEmail({ to: p.email!, subject: content.subject, html: content.html });
          } else {
            // Push channel: logged for now; a push provider plugs in here.
            console.log(`[push] ${p.pushEndpoint} ← ${content.subject}`);
          }
          deliveries.push({ sponsorId: p.sponsorId, channel: p.channel, ok: true, kind: "milestone" });
        } catch (err) {
          deliveries.push({
            sponsorId: p.sponsorId,
            channel: p.channel,
            ok: false,
            kind: "milestone",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return Response.json({ mode: "milestone", sent: deliveries.filter((d) => d.ok).length, deliveries });
    }

    // Digest mode: only sponsors whose interval has elapsed.
    const due = await getDueDigests();
    const campaign = body.campaign ?? {};

    for (const p of due) {
      try {
        const content = renderDigestEmail(
          p.campaignId,
          String(campaign.name ?? "A campaign you sponsor"),
          Number(campaign.progressPct ?? 0),
          Number(campaign.trees ?? 0),
        );
        if (p.channel === "email") {
          await emailService.sendEmail({ to: p.email!, subject: content.subject, html: content.html });
        } else {
          console.log(`[push] ${p.pushEndpoint} ← ${content.subject}`);
        }
        await markNotified(p.campaignId, p.sponsorId);
        deliveries.push({ sponsorId: p.sponsorId, channel: p.channel, ok: true, kind: "digest" });
      } catch (err) {
        deliveries.push({
          sponsorId: p.sponsorId,
          channel: p.channel,
          ok: false,
          kind: "digest",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return Response.json({ mode: "digest", sent: deliveries.filter((d) => d.ok).length, deliveries });
  } catch {
    return Response.json({ error: "dispatch failed" }, { status: 500 });
  }
}
