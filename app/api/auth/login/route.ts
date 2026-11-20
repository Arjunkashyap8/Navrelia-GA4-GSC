import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session-token";

export const runtime = "nodejs";

const Body = z.object({ password: z.string().min(1).max(256) });

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: Request) {
  const expected = process.env.DASHBOARD_PASSWORD?.trim();
  if (!expected) {
    return NextResponse.json({ error: { message: "Password gate is not configured." } }, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  // Compare fixed-length digests in constant time.
  const ok = parsed.success && timingSafeEqual(digest(parsed.data.password), digest(expected));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ error: { message: "Incorrect password." } }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(expected), {
    httpOnly: true,
    // Secure whenever the site is served over HTTPS (directly or behind a proxy); plain http://localhost still works.
    secure: new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
