import "server-only";
import { z } from "zod";
import { getEnv, getGoogleCredentials, type GoogleClient } from "@/lib/env";
import { fetchWithRetry } from "./http";
import { recordCall } from "./usage";

/**
 * Token manager for the two independent OAuth clients (GA4 and GSC).
 *
 * - Exchanges each refresh token for an access token at GOOGLE_TOKEN_ENDPOINT.
 * - Caches the access token in memory until 60 s before expiry.
 * - De-duplicates concurrent refreshes (one in-flight request per client).
 * - Never logs or returns token values outside this module except to the request helper.
 */

const TokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

export type TokenErrorCode = "missing_config" | "invalid_grant" | "invalid_client" | "network" | "unknown";

export const INVALID_GRANT_HINT =
  "Google rejected the refresh token. The most common cause is an OAuth consent screen left in " +
  '"Testing" mode — refresh tokens for test apps expire after 7 days. Fix: in Google Cloud Console → ' +
  'APIs & Services → OAuth consent screen, click "Publish app", then generate a new refresh token ' +
  "and update the environment variable. Other causes: the token was revoked, the Google account " +
  "password changed, or the token belongs to a different OAuth client.";

export class TokenError extends Error {
  constructor(
    public readonly client: GoogleClient,
    public readonly code: TokenErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "TokenError";
  }
}

export interface CachedToken {
  accessToken: string;
  expiresAt: number;
  scopes: string[];
  refreshedAt: number;
}

interface TokenState {
  cache: Map<GoogleClient, CachedToken>;
  inflight: Map<GoogleClient, Promise<CachedToken>>;
  lastError: Map<GoogleClient, { code: TokenErrorCode; message: string; at: string }>;
}

// Kept on globalThis so dev hot-reloads don't drop the cache.
const g = globalThis as unknown as { __navreliaTokens?: TokenState };
const tokens: TokenState = (g.__navreliaTokens ??= {
  cache: new Map(),
  inflight: new Map(),
  lastError: new Map(),
});

const EXPIRY_SAFETY_MS = 60_000;

export async function getToken(client: GoogleClient): Promise<CachedToken> {
  const cached = tokens.cache.get(client);
  if (cached && Date.now() < cached.expiresAt - EXPIRY_SAFETY_MS) return cached;

  const pending = tokens.inflight.get(client);
  if (pending) return pending;

  const p = refresh(client)
    .catch((err: unknown) => {
      if (err instanceof TokenError) {
        tokens.lastError.set(client, { code: err.code, message: err.message, at: new Date().toISOString() });
      }
      throw err;
    })
    .finally(() => tokens.inflight.delete(client));
  tokens.inflight.set(client, p);
  return p;
}

export async function getAccessToken(client: GoogleClient): Promise<string> {
  return (await getToken(client)).accessToken;
}

export function invalidateToken(client: GoogleClient) {
  tokens.cache.delete(client);
}

export function getLastTokenError(client: GoogleClient) {
  return tokens.lastError.get(client) ?? null;
}

async function refresh(client: GoogleClient): Promise<CachedToken> {
  const creds = getGoogleCredentials(client);
  if (!creds.ok) {
    throw new TokenError(client, "missing_config", `Missing environment variables: ${creds.missing.join(", ")}`);
  }

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: "refresh_token",
  });

  let res: Response;
  try {
    res = await fetchWithRetry(
      getEnv().GOOGLE_TOKEN_ENDPOINT,
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
      { retries: 2 },
    );
  } catch {
    throw new TokenError(client, "network", "Could not reach Google's token endpoint (network error or timeout).");
  } finally {
    recordCall("oauth");
  }

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err = (json ?? {}) as { error?: string; error_description?: string };
    if (err.error === "invalid_grant") {
      throw new TokenError(client, "invalid_grant", "Refresh token rejected (invalid_grant).", INVALID_GRANT_HINT);
    }
    if (err.error === "invalid_client" || err.error === "unauthorized_client") {
      throw new TokenError(
        client,
        "invalid_client",
        `OAuth client rejected (${err.error}).`,
        "Check that the client ID and secret match the OAuth client that issued this refresh token.",
      );
    }
    throw new TokenError(
      client,
      "unknown",
      `Token refresh failed with HTTP ${res.status}${err.error ? ` (${err.error})` : ""}.`,
    );
  }

  const parsed = TokenResponse.safeParse(json);
  if (!parsed.success) {
    throw new TokenError(client, "unknown", "Token endpoint returned an unexpected response shape.");
  }

  const now = Date.now();
  const token: CachedToken = {
    accessToken: parsed.data.access_token,
    expiresAt: now + parsed.data.expires_in * 1000,
    scopes: parsed.data.scope?.split(/\s+/).filter(Boolean) ?? [],
    refreshedAt: now,
  };
  tokens.cache.set(client, token);
  tokens.lastError.delete(client);
  return token;
}
