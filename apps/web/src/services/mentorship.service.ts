/**
 * Creator mentorship program.
 *
 * Connects first-time campaign creators with experienced, verified mentors:
 *  - mentor profiles carry expertise tags and availability
 *  - matching ranks verified mentors by overlap with the campaign category
 *  - each accepted pairing has a chat thread shown in the creator dashboard
 *
 * Storage is in-memory, matching the repo's service conventions.
 */

export const MENTOR_EXPERTISE_TAGS = ["strategy", "marketing", "fulfilment"] as const;
export type MentorExpertiseTag = (typeof MENTOR_EXPERTISE_TAGS)[number];

export const MAX_MENTOR_BIO_LENGTH = 500;
export const MAX_MESSAGE_LENGTH = 2_000;
export const MAX_ACTIVE_MENTEES_DEFAULT = 5;

export interface MentorAvailability {
  /** Days of week the mentor can chat, 0 = Sunday. */
  days: number[];
  /** Maximum number of concurrent mentees. */
  maxMentees: number;
  /** When false the mentor is hidden from matching. */
  accepting: boolean;
}

export interface MentorProfile {
  address: string;
  name: string;
  bio: string;
  expertiseTags: MentorExpertiseTag[];
  /** Campaign categories the mentor has experience in (lower-case). */
  categories: string[];
  availability: MentorAvailability;
  /** Set only by an admin; unverified mentors are never matched. */
  verified: boolean;
  createdAt: number;
}

export interface MentorMatch {
  mentor: MentorProfile;
  score: number;
  categoryMatch: boolean;
  activeMentees: number;
}

export interface Mentorship {
  id: string;
  creatorAddress: string;
  mentorAddress: string;
  category: string;
  createdAt: number;
}

export interface MentorshipMessage {
  id: string;
  mentorshipId: string;
  senderAddress: string;
  text: string;
  createdAt: number;
}

export type MentorshipResult<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

const mentors = new Map<string, MentorProfile>();
const mentorships = new Map<string, Mentorship>();
const messages = new Map<string, MentorshipMessage[]>();

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

function fail<T>(error: string, status: number): MentorshipResult<T> {
  return { ok: false, error, status };
}

export interface MentorProfileInput {
  address: string;
  name: string;
  bio?: string;
  expertiseTags: string[];
  categories: string[];
  availability?: Partial<MentorAvailability>;
}

/** Registers (or updates) a mentor profile. Verification status is preserved and never self-assigned. */
export function saveMentorProfile(input: MentorProfileInput, now: number = Date.now()): MentorshipResult<MentorProfile> {
  const address = input.address?.trim();
  const name = input.name?.trim();
  if (!address || !name) return fail("address and name are required", 400);

  const tags = [...new Set(input.expertiseTags ?? [])];
  if (tags.length === 0 || !tags.every((t): t is MentorExpertiseTag => (MENTOR_EXPERTISE_TAGS as readonly string[]).includes(t))) {
    return fail(`expertiseTags must be a non-empty subset of: ${MENTOR_EXPERTISE_TAGS.join(", ")}`, 400);
  }

  const categories = [...new Set((input.categories ?? []).map(normalizeCategory).filter(Boolean))];
  if (categories.length === 0) return fail("At least one category is required", 400);

  const bio = (input.bio ?? "").trim();
  if (bio.length > MAX_MENTOR_BIO_LENGTH) return fail(`bio must be at most ${MAX_MENTOR_BIO_LENGTH} characters`, 400);

  const days = [...new Set(input.availability?.days ?? [])];
  if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return fail("availability.days must be integers 0-6", 400);

  const maxMentees = input.availability?.maxMentees ?? MAX_ACTIVE_MENTEES_DEFAULT;
  if (!Number.isInteger(maxMentees) || maxMentees < 1 || maxMentees > 50) {
    return fail("availability.maxMentees must be an integer between 1 and 50", 400);
  }

  const existing = mentors.get(address);
  const profile: MentorProfile = {
    address,
    name,
    bio,
    expertiseTags: tags,
    categories,
    availability: { days, maxMentees, accepting: input.availability?.accepting ?? true },
    verified: existing?.verified ?? false,
    createdAt: existing?.createdAt ?? now,
  };
  mentors.set(address, profile);
  return { ok: true, value: profile };
}

export function setMentorVerified(address: string, verified: boolean): MentorshipResult<MentorProfile> {
  const mentor = mentors.get(address);
  if (!mentor) return fail("Mentor not found", 404);
  const updated = { ...mentor, verified };
  mentors.set(address, updated);
  return { ok: true, value: updated };
}

export function getMentor(address: string): MentorProfile | null {
  return mentors.get(address) ?? null;
}

export function countActiveMentees(mentorAddress: string): number {
  return [...mentorships.values()].filter((m) => m.mentorAddress === mentorAddress).length;
}

/**
 * Matching algorithm: only verified, accepting mentors with spare capacity are
 * candidates. Score = 10 for a category match, plus 1 per expertise tag in
 * `wantedTags`; ties break toward the mentor with the lightest mentee load.
 */
export function matchMentors(category: string, wantedTags: string[] = []): MentorMatch[] {
  const cat = normalizeCategory(category);
  const wanted = new Set(wantedTags);
  return [...mentors.values()]
    .filter((m) => m.verified && m.availability.accepting)
    .map((mentor) => ({ mentor, activeMentees: countActiveMentees(mentor.address) }))
    .filter(({ mentor, activeMentees }) => activeMentees < mentor.availability.maxMentees)
    .map(({ mentor, activeMentees }): MentorMatch => {
      const categoryMatch = !!cat && mentor.categories.includes(cat);
      const tagScore = mentor.expertiseTags.filter((t) => wanted.has(t)).length;
      return { mentor, activeMentees, categoryMatch, score: (categoryMatch ? 10 : 0) + tagScore };
    })
    .sort((a, b) => b.score - a.score || a.activeMentees - b.activeMentees || a.mentor.name.localeCompare(b.mentor.name));
}

/** Starts a mentorship between a creator and a verified mentor with capacity. */
export function requestMentorship(
  creatorAddress: string,
  mentorAddress: string,
  category: string,
  now: number = Date.now(),
): MentorshipResult<Mentorship> {
  const creator = creatorAddress?.trim();
  const cat = normalizeCategory(category ?? "");
  if (!creator || !mentorAddress || !cat) return fail("creatorAddress, mentorAddress and category are required", 400);
  if (creator === mentorAddress) return fail("You cannot mentor yourself", 400);

  const mentor = mentors.get(mentorAddress);
  if (!mentor || !mentor.verified) return fail("Mentor not found", 404);
  if (!mentor.availability.accepting || countActiveMentees(mentorAddress) >= mentor.availability.maxMentees) {
    return fail("Mentor is not currently available", 409);
  }
  const duplicate = [...mentorships.values()].some((m) => m.creatorAddress === creator && m.mentorAddress === mentorAddress);
  if (duplicate) return fail("Mentorship already exists", 409);

  const mentorship: Mentorship = {
    id: `mentorship:${creator}:${mentorAddress}`,
    creatorAddress: creator,
    mentorAddress,
    category: cat,
    createdAt: now,
  };
  mentorships.set(mentorship.id, mentorship);
  return { ok: true, value: mentorship };
}

export function listMentorships(address: string): Mentorship[] {
  return [...mentorships.values()]
    .filter((m) => m.creatorAddress === address || m.mentorAddress === address)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function participantOf(mentorshipId: string, address: string): MentorshipResult<Mentorship> {
  const mentorship = mentorships.get(mentorshipId);
  if (!mentorship) return fail("Mentorship not found", 404);
  if (address !== mentorship.creatorAddress && address !== mentorship.mentorAddress) {
    return fail("Only mentorship participants can access this chat", 403);
  }
  return { ok: true, value: mentorship };
}

export function listMessages(mentorshipId: string, viewerAddress: string): MentorshipResult<MentorshipMessage[]> {
  const access = participantOf(mentorshipId, viewerAddress);
  if (!access.ok) return access;
  return { ok: true, value: messages.get(mentorshipId) ?? [] };
}

export function sendMessage(
  mentorshipId: string,
  senderAddress: string,
  text: string,
  now: number = Date.now(),
): MentorshipResult<MentorshipMessage> {
  const access = participantOf(mentorshipId, senderAddress);
  if (!access.ok) return access;

  const trimmed = (text ?? "").trim();
  if (!trimmed) return fail("Message cannot be empty", 400);
  if (trimmed.length > MAX_MESSAGE_LENGTH) return fail(`Message must be at most ${MAX_MESSAGE_LENGTH} characters`, 400);

  const list = messages.get(mentorshipId) ?? [];
  const message: MentorshipMessage = {
    id: `${mentorshipId}:msg:${list.length + 1}`,
    mentorshipId,
    senderAddress,
    text: trimmed,
    createdAt: now,
  };
  messages.set(mentorshipId, [...list, message]);
  return { ok: true, value: message };
}

/** Test helper: wipe all mentorship data. */
export function resetMentorship(): void {
  mentors.clear();
  mentorships.clear();
  messages.clear();
}
