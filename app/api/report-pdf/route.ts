import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { chromium } from "playwright-core";
import { SESSION_COOKIE } from "@/lib/auth/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Locally installed Chromium-based browser (no bundled download). Override with PDF_BROWSER_PATH. */
function browserPath() {
  const candidates = [
    process.env.PDF_BROWSER_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find((p) => p && existsSync(p));
}

/**
 * Renders /report with the same query string in a headless browser and returns an A4 PDF.
 * The caller's session cookie is forwarded so the password gate still applies.
 */
export async function GET(req: Request) {
  const exe = browserPath();
  if (!exe) {
    return NextResponse.json({ error: { message: "No Chrome/Edge found for PDF rendering. Set PDF_BROWSER_PATH, or use the report page's Print / Save as PDF button." } }, { status: 501 });
  }
  const url = new URL(req.url);
  const target = new URL(`/report${url.search}`, url.origin);
  target.searchParams.delete("print");
  const cookie = req.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];

  const browser = await chromium.launch({ executablePath: exe, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
    if (cookie) await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: url.origin }]);
    const page = await context.newPage();
    await page.goto(target.toString(), { waitUntil: "networkidle", timeout: 150_000 });
    await page.waitForFunction(() => (window as unknown as { __reportReady?: boolean }).__reportReady === true, null, { timeout: 30_000 });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    const name = `navrelia-report-${url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json({ error: { message: `PDF rendering failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}` } }, { status: 500 });
  } finally {
    await browser.close();
  }
}
