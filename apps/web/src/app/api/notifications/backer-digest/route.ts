import { EmailService } from "@/services/email.service";
import { dispatchBackerDigests } from "@/services/backer-digest.service";

export const runtime = "nodejs";

const emailService = new EmailService();

/**
 * POST /api/notifications/backer-digest
 *
 * Sends every backer digest that is due right now (8 AM local time for daily
 * digests, Monday 8 AM local time for weekly digests). Intended to be invoked
 * hourly by a scheduler so each timezone is hit during its own 8 AM hour;
 * a per-period guard makes repeated calls within that hour idempotent.
 */
export async function POST() {
  try {
    const deliveries = await dispatchBackerDigests(emailService);
    return Response.json({
      sent: deliveries.filter((d) => d.ok && !d.skipped).length,
      deliveries,
    });
  } catch {
    return Response.json({ error: "backer digest dispatch failed" }, { status: 500 });
  }
}
