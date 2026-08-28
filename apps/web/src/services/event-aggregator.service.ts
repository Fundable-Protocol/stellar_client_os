import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export interface SponsorEvent {
  id: string;
  sponsorId: string; // The sponsor receiving the email
  event: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface SponsorTimezone {
  sponsorId: string;
  timezone: string; // e.g., 'America/New_York'
  email: string;
}

export class EventAggregatorService {
  private readonly eventsPath: string;
  private readonly timezonesPath: string;

  constructor(options: { dataDir?: string } = {}) {
    const dataDir = options.dataDir ?? path.join(process.cwd(), 'data');
    this.eventsPath = path.join(dataDir, 'sponsor_events.json');
    this.timezonesPath = path.join(dataDir, 'sponsor_timezones.json');
  }

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (err) {
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw err;
    }
  }

  async getEvents(): Promise<SponsorEvent[]> {
    try {
      const data = await fs.readFile(this.eventsPath, 'utf-8');
      return JSON.parse(data) as SponsorEvent[];
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async logEvent(sponsorId: string, event: string, payload: Record<string, unknown>): Promise<SponsorEvent> {
    const events = await this.getEvents();
    const newEvent: SponsorEvent = {
      id: 'evt_' + randomUUID().replace(/-/g, '').slice(0, 16),
      sponsorId,
      event,
      payload,
      timestamp: new Date().toISOString(),
    };
    events.push(newEvent);
    await this.writeJsonAtomic(this.eventsPath, events);
    return newEvent;
  }

  async clearEventsForSponsor(sponsorId: string): Promise<void> {
    const events = await this.getEvents();
    const remainingEvents = events.filter((e) => e.sponsorId !== sponsorId);
    await this.writeJsonAtomic(this.eventsPath, remainingEvents);
  }

  async getSponsorTimezones(): Promise<SponsorTimezone[]> {
    try {
      const data = await fs.readFile(this.timezonesPath, 'utf-8');
      return JSON.parse(data) as SponsorTimezone[];
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async setSponsorTimezone(sponsorId: string, email: string, timezone: string): Promise<void> {
    const timezones = await this.getSponsorTimezones();
    const index = timezones.findIndex((t) => t.sponsorId === sponsorId);
    if (index >= 0) {
      timezones[index] = { sponsorId, email, timezone };
    } else {
      timezones.push({ sponsorId, email, timezone });
    }
    await this.writeJsonAtomic(this.timezonesPath, timezones);
  }
}
