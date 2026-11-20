import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session-token";

/**
 * Optional password gate.
 * - DASHBOARD_PASSWORD set → every page and API route requires a valid signed session cookie,
 *   except the login page and the login/logout endpoints.
 * - DASHBOARD_PASSWORD unset → the dashboard is open to anyone with the link (the owner's choice).
 */
export async function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  const isApi = req.nextUrl.pathname.startsWith("/api/");

  if (!password) return NextResponse.next();

  const ok = await verifySessionToken(password, req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: { message: "Not signed in.", code: "unauthenticated" } }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth/).*)"],
};
