#!/usr/bin/env tsx
/**
 * Batch Email Digest Bot
 *
 * Runs periodically (e.g., hourly) and checks if it's 9 AM in each sponsor's
 * timezone. If so, it aggregates their events from the past 24 hours,
 * sends a digest email, and clears the sent events.
 *
 * # Running
 *
 *   pnpm tsx scripts/batch-email-digest.ts
 */

import { EventAggregatorService } from '../apps/web/src/services/event-aggregator.service';
import { EmailService } from '../apps/web/src/services/email.service';

export function is9AMInTimezone(timezone: string): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false, // 24-hour format
    });
    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === 'hour');
    if (!hourPart) return false;
    
    // Check if the current hour in that timezone is 9
    return parseInt(hourPart.value, 10) === 9;
  } catch (err) {
    console.error(`Invalid timezone: ${timezone}`);
    return false;
  }
}

export async function runBatchDigest() {
  console.log('[BatchDigest] Starting scan...');
  
  // Initialize services. Provide the data directory relative to the web app
  // or use the root data directory. We use root/data for simplicity.
  const aggregator = new EventAggregatorService();
  const emailService = new EmailService();

  const timezones = await aggregator.getSponsorTimezones();
  const events = await aggregator.getEvents();

  if (events.length === 0) {
    console.log('[BatchDigest] No events to process.');
    return;
  }

  // Group events by sponsor
  const eventsBySponsor = events.reduce((acc, event) => {
    if (!acc[event.sponsorId]) {
      acc[event.sponsorId] = [];
    }
    acc[event.sponsorId].push(event);
    return acc;
  }, {} as Record<string, typeof events>);

  for (const sponsor of timezones) {
    const sponsorEvents = eventsBySponsor[sponsor.sponsorId] || [];
    
    if (sponsorEvents.length === 0) {
      continue;
    }

    if (is9AMInTimezone(sponsor.timezone)) {
      console.log(`[BatchDigest] It is 9 AM for sponsor ${sponsor.sponsorId} (${sponsor.timezone}). Sending digest...`);
      
      let html = `<h1>Daily Event Digest</h1><ul>`;
      for (const event of sponsorEvents) {
        html += `<li><strong>${event.event}</strong> at ${event.timestamp} - ${JSON.stringify(event.payload)}</li>`;
      }
      html += `</ul>`;

      await emailService.sendEmail({
        to: sponsor.email,
        subject: `Your Daily Digest (${sponsorEvents.length} events)`,
        html,
      });

      // Clear events after sending
      await aggregator.clearEventsForSponsor(sponsor.sponsorId);
      console.log(`[BatchDigest] Cleared events for sponsor ${sponsor.sponsorId}.`);
    } else {
      console.log(`[BatchDigest] It is not 9 AM for sponsor ${sponsor.sponsorId} (${sponsor.timezone}). Skipping.`);
    }
  }

  console.log('[BatchDigest] Scan complete.');
}

// Run if invoked directly
if (require.main === module || import.meta.url === `file://${process.argv[1]}`) {
  runBatchDigest().catch((err) => {
    console.error('[BatchDigest] Fatal error', err);
    process.exit(1);
  });
}
