import { beforeEach, describe, expect, it } from "vitest";
import {
  listMentorships,
  listMessages,
  matchMentors,
  requestMentorship,
  resetMentorship,
  saveMentorProfile,
  sendMessage,
  setMentorVerified,
} from "./mentorship.service";

const base = { bio: "Ran 3 campaigns", availability: { days: [1, 3], maxMentees: 1 } };

function addMentor(address: string, tags: string[], categories: string[], verify = true, extra = {}) {
  const res = saveMentorProfile({ ...base, address, name: address, expertiseTags: tags, categories, ...extra });
  if (!res.ok) throw new Error(res.error);
  if (verify) setMentorVerified(address, true);
}

describe("mentorship service", () => {
  beforeEach(() => resetMentorship());

  it("validates mentor profiles", () => {
    expect(saveMentorProfile({ address: "M1", name: "A", expertiseTags: ["cooking"], categories: ["x"] }).ok).toBe(false);
    expect(saveMentorProfile({ address: "M1", name: "A", expertiseTags: ["marketing"], categories: [] }).ok).toBe(false);
    expect(
      saveMentorProfile({ address: "M1", name: "A", expertiseTags: ["marketing"], categories: ["x"], availability: { days: [9] } }).ok,
    ).toBe(false);
  });

  it("never self-verifies and preserves verification on update", () => {
    addMentor("M1", ["marketing"], ["Reforestation"], false);
    expect(matchMentors("reforestation")).toHaveLength(0);
    setMentorVerified("M1", true);
    addMentor("M1", ["marketing"], ["Reforestation"], false);
    expect(matchMentors("reforestation")).toHaveLength(1);
  });

  it("ranks category matches first and tag overlap next", () => {
    addMentor("A", ["strategy"], ["wetlands"]);
    addMentor("B", ["marketing"], ["reforestation"]);
    addMentor("C", ["marketing", "strategy"], ["reforestation"]);
    const result = matchMentors("Reforestation", ["marketing", "strategy"]);
    expect(result.map((m) => m.mentor.address)).toEqual(["C", "B", "A"]);
    expect(result[2].categoryMatch).toBe(false);
  });

  it("hides mentors that are full or not accepting", () => {
    addMentor("A", ["strategy"], ["x"]);
    addMentor("B", ["strategy"], ["x"], true, { availability: { accepting: false } });
    expect(requestMentorship("C1", "A", "x").ok).toBe(true);
    expect(matchMentors("x")).toHaveLength(0);
    expect(requestMentorship("C2", "A", "x")).toMatchObject({ ok: false, status: 409 });
    expect(requestMentorship("C2", "B", "x")).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects unverified mentors and duplicates", () => {
    addMentor("A", ["strategy"], ["x"], false);
    expect(requestMentorship("C1", "A", "x")).toMatchObject({ ok: false, status: 404 });
    addMentor("B", ["strategy"], ["x"], true, { availability: { maxMentees: 5 } });
    expect(requestMentorship("C1", "B", "x").ok).toBe(true);
    expect(requestMentorship("C1", "B", "x")).toMatchObject({ ok: false, status: 409 });
    expect(listMentorships("C1")).toHaveLength(1);
    expect(listMentorships("B")).toHaveLength(1);
  });

  it("restricts chat to participants", () => {
    addMentor("A", ["strategy"], ["x"]);
    const m = requestMentorship("C1", "A", "x");
    if (!m.ok) throw new Error("setup");
    const id = m.value.id;
    expect(sendMessage(id, "C1", "  hi  ").ok).toBe(true);
    expect(sendMessage(id, "A", "hello").ok).toBe(true);
    expect(sendMessage(id, "C1", "   ")).toMatchObject({ ok: false, status: 400 });
    expect(sendMessage(id, "EVE", "hey")).toMatchObject({ ok: false, status: 403 });
    expect(listMessages(id, "EVE")).toMatchObject({ ok: false, status: 403 });
    const list = listMessages(id, "C1");
    expect(list.ok && list.value.map((x) => x.text)).toEqual(["hi", "hello"]);
  });
});
