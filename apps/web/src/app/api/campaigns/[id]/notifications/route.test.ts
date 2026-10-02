import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import {
  InMemoryPreferencesDataSource,
  setNotificationPreferencesDataSource,
} from "@/services/notification-preferences.service";

const BASE = "https://app.test/api/campaigns/c1/notifications";

function post(body: unknown): Request {
  return new Request(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => setNotificationPreferencesDataSource(new InMemoryPreferencesDataSource()));

describe("POST /api/campaigns/[id]/notifications", () => {
  it("creates preferences (201)", async () => {
    const res = await POST(
      post({ sponsorId: "s1", frequency: "weekly", channel: "email", email: "a@b.co" }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(201);
    expect((await res.json()).frequency).toBe("weekly");
  });

  it("400s when the email channel has no address", async () => {
    const res = await POST(
      post({ sponsorId: "s1", frequency: "daily", channel: "email" }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email address is required/);
  });

  it("400s on invalid JSON", async () => {
    const res = await POST(new Request(BASE, { method: "POST", body: "{nope" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/campaigns/[id]/notifications", () => {
  it("returns one sponsor's preferences", async () => {
    await POST(post({ sponsorId: "s1", frequency: "daily", channel: "email", email: "a@b.co" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    const res = await GET(new Request(`${BASE}?sponsorId=s1`), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).sponsorId).toBe("s1");
  });

  it("404s for a sponsor without preferences", async () => {
    const res = await GET(new Request(`${BASE}?sponsorId=ghost`), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(404);
  });

  it("lists all preferences for the campaign", async () => {
    await POST(post({ sponsorId: "s1", frequency: "daily", channel: "email", email: "a@b.co" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    await POST(
      post({ sponsorId: "s2", frequency: "milestones", channel: "push", pushEndpoint: "ep" }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    const res = await GET(new Request(BASE), { params: Promise.resolve({ id: "c1" }) });
    const body = await res.json();
    expect(body.preferences).toHaveLength(2);
  });
});
