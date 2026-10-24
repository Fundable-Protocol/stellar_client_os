/**
 * LinkedIn OAuth 2.0 + Profile Service — feature: LinkedIn badge & endorsements
 *
 * Responsibilities:
 *  1. Build the LinkedIn authorization URL (OAuth 2.0 / OpenID Connect).
 *  2. Exchange the authorization code for an access token.
 *  3. Fetch the authenticated user's basic profile (name, headline, avatar).
 *  4. Fetch the user's top skills / endorsements via the Skills API.
 *  5. Manage per-creator connections stored in an in-memory map (swap out for a
 *     database in production — the interface is stable regardless of backing store).
 *
 * LinkedIn API surface used:
 *   GET https://api.linkedin.com/v2/userinfo          (OpenID Connect — name, email, picture)
 *   GET https://api.linkedin.com/v2/me                (headline, vanityName)
 *   GET https://api.linkedin.com/v2/skills            (skills list — requires r_basicprofile)
 *   POST https://www.linkedin.com/oauth/v2/accessToken (token exchange)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkedInProfile {
  /** LinkedIn member ID (sub from OIDC) */
  id: string;
  /** Full display name */
  name: string;
  /** Professional headline (e.g. "Senior Engineer at Acme") */
  headline: string;
  /** Public profile URL */
  profileUrl: string;
  /** Profile picture URL */
  pictureUrl: string | null;
  /** Vanity name slug (linkedin.com/in/<vanityName>) */
  vanityName: string | null;
}

export interface LinkedInSkill {
  name: string;
  /** Number of endorsements received (0 when not returned by the API) */
  endorsementCount: number;
}

export interface LinkedInConnection {
  /** Stellar address of the creator who connected the account */
  creatorAddress: string;
  profile: LinkedInProfile;
  /** Top skills sorted by endorsement count descending */
  skills: LinkedInSkill[];
  /** ISO-8601 timestamp of when the connection was established */
  connectedAt: string;
  /** Opaque access token — never exposed to the client */
  accessToken: string;
}

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

// ---------------------------------------------------------------------------
// Config helpers (read from env, validated at call-time not module-load-time
// so Next.js Edge / RSC don't blow up when the vars are unset in test envs).
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** OAuth 2.0 scopes requested from LinkedIn. */
export const LINKEDIN_SCOPES = ["openid", "profile", "email", "r_basicprofile"] as const;

// ---------------------------------------------------------------------------
// In-memory store (replace with DB calls in production)
// ---------------------------------------------------------------------------

/** Keyed by creator Stellar address */
const connectionStore = new Map<string, LinkedInConnection>();

/** Pending OAuth state parameters keyed by state token → creator address */
const pendingStateStore = new Map<string, string>();

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

/**
 * Build the LinkedIn authorization URL and store a CSRF state token.
 *
 * @param creatorAddress - Stellar address of the creator initiating the flow
 * @returns The URL to redirect the user to
 */
export function buildAuthorizationUrl(creatorAddress: string): string {
  const clientId = requireEnv("LINKEDIN_CLIENT_ID");
  const redirectUri = requireEnv("LINKEDIN_REDIRECT_URI");

  const state = generateState();
  pendingStateStore.set(state, creatorAddress);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES.join(" "),
  });

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

/**
 * Validate the OAuth callback state token and return the creator address.
 *
 * @throws if the state is invalid / expired
 */
export function resolveState(state: string): string {
  const creatorAddress = pendingStateStore.get(state);
  if (!creatorAddress) {
    throw new Error("Invalid or expired OAuth state parameter");
  }
  pendingStateStore.delete(state);
  return creatorAddress;
}

/**
 * Exchange an authorization code for an access token.
 */
export async function exchangeCodeForToken(code: string): Promise<LinkedInTokenResponse> {
  const clientId = requireEnv("LINKEDIN_CLIENT_ID");
  const clientSecret = requireEnv("LINKEDIN_CLIENT_SECRET");
  const redirectUri = requireEnv("LINKEDIN_REDIRECT_URI");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LinkedIn token exchange failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<LinkedInTokenResponse>;
}

// ---------------------------------------------------------------------------
// Profile fetching
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated user's basic profile via OIDC userinfo + v2/me.
 */
export async function fetchLinkedInProfile(accessToken: string): Promise<LinkedInProfile> {
  // OIDC userinfo gives us sub (id), name, picture
  const [userinfoRes, meRes] = await Promise.all([
    fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch("https://api.linkedin.com/v2/me?projection=(id,localizedHeadline,vanityName)", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);

  if (!userinfoRes.ok) {
    throw new Error(`LinkedIn userinfo fetch failed (${userinfoRes.status})`);
  }

  const userinfo = (await userinfoRes.json()) as {
    sub: string;
    name: string;
    picture?: string;
    email?: string;
  };

  // v2/me may not be available in all app plans; degrade gracefully
  let headline = "";
  let vanityName: string | null = null;
  if (meRes.ok) {
    const me = (await meRes.json()) as {
      localizedHeadline?: string;
      vanityName?: string;
    };
    headline = me.localizedHeadline ?? "";
    vanityName = me.vanityName ?? null;
  }

  const profileUrl = vanityName
    ? `https://www.linkedin.com/in/${vanityName}`
    : `https://www.linkedin.com/in/${userinfo.sub}`;

  return {
    id: userinfo.sub,
    name: userinfo.name,
    headline,
    profileUrl,
    pictureUrl: userinfo.picture ?? null,
    vanityName,
  };
}

/**
 * Fetch the user's top skills. Returns up to `limit` skills sorted by
 * endorsement count descending.
 *
 * The Skills API may be restricted based on the LinkedIn app's access level.
 * On failure this method logs the error and returns an empty array rather than
 * throwing — a missing skills list is non-fatal for badge rendering.
 */
export async function fetchLinkedInSkills(
  accessToken: string,
  limit = 10,
): Promise<LinkedInSkill[]> {
  try {
    const response = await fetch(
      "https://api.linkedin.com/v2/skills?q=member&projection=(elements*(name,endorsementCount))",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      console.warn(`LinkedIn skills fetch returned ${response.status}; skipping skills.`);
      return [];
    }

    const data = (await response.json()) as {
      elements?: { name?: string; endorsementCount?: number }[];
    };

    const skills: LinkedInSkill[] = (data.elements ?? [])
      .filter((e) => typeof e.name === "string" && e.name.trim() !== "")
      .map((e) => ({
        name: e.name as string,
        endorsementCount: typeof e.endorsementCount === "number" ? e.endorsementCount : 0,
      }))
      .sort((a, b) => b.endorsementCount - a.endorsementCount)
      .slice(0, limit);

    return skills;
  } catch (err) {
    console.warn("LinkedIn skills fetch error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

/**
 * Complete the OAuth flow: exchange code → fetch profile & skills → persist.
 *
 * @param creatorAddress - The creator's Stellar address
 * @param code - Authorization code from the LinkedIn callback
 * @returns The stored {@link LinkedInConnection}
 */
export async function connectLinkedIn(
  creatorAddress: string,
  code: string,
): Promise<LinkedInConnection> {
  const tokenResponse = await exchangeCodeForToken(code);
  const { access_token: accessToken } = tokenResponse;

  const [profile, skills] = await Promise.all([
    fetchLinkedInProfile(accessToken),
    fetchLinkedInSkills(accessToken),
  ]);

  const connection: LinkedInConnection = {
    creatorAddress,
    profile,
    skills,
    connectedAt: new Date().toISOString(),
    accessToken,
  };

  connectionStore.set(creatorAddress, connection);
  return connection;
}

/**
 * Remove the stored LinkedIn connection for a creator.
 *
 * @returns `true` if a connection existed and was removed, `false` otherwise.
 */
export function disconnectLinkedIn(creatorAddress: string): boolean {
  return connectionStore.delete(creatorAddress);
}

/**
 * Retrieve the stored LinkedIn connection for a creator, if any.
 */
export function getLinkedInConnection(creatorAddress: string): LinkedInConnection | null {
  return connectionStore.get(creatorAddress) ?? null;
}

/**
 * Return a safe, client-facing view of a connection (no access token).
 */
export function getPublicLinkedInData(
  creatorAddress: string,
): Omit<LinkedInConnection, "accessToken"> | null {
  const connection = connectionStore.get(creatorAddress);
  if (!connection) return null;

  const { accessToken: _token, ...publicData } = connection;
  return publicData;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateState(): string {
  // crypto.randomUUID() is available in Node 14.17+ and modern browsers
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
