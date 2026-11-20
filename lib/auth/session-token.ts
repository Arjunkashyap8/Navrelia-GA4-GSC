/**
 * Signed session cookie for the password gate. Edge-runtime safe (Web Crypto only).
 * Token format: `<expiryEpochSeconds>.<base64url HMAC-SHA256(expiry)>`, keyed from DASHBOARD_PASSWORD,
 * so changing the password invalidates every existing session.
 */

export const SESSION_COOKIE = "navrelia_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const enc = new TextEncoder();

function toB64Url(buf: ArrayBuffer): string {
  let s = "";
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(`navrelia-session-v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(secret: string, ttlSeconds = SESSION_TTL_SECONDS) {
  const exp = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(exp));
  return `${exp}.${toB64Url(sig)}`;
}

export async function verifySessionToken(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const sigBytes = fromB64Url(sig);
  if (!sigBytes) return false;
  // crypto.subtle.verify is constant-time.
  return crypto.subtle.verify("HMAC", await hmacKey(secret), sigBytes, enc.encode(exp));
}
