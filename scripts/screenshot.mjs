// Dev helper: screenshot a dashboard route (signs in with DASHBOARD_PASSWORD from .env.local).
// Usage: node scripts/screenshot.mjs "/overview" out.png [width] [height] [full]
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
const pw = (readFileSync(".env.local","utf8").match(/^DASHBOARD_PASSWORD=(.*)$/m)?.[1] ?? "").trim();
const base = "http://localhost:3000";
const login = await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:pw})});
const val = login.headers.get("set-cookie").split(";")[0].split("=")[1];
const [path, out, w, h, full] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.PDF_BROWSER_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await b.newContext({ viewport: { width: +w || 1440, height: +h || 900 } });
await ctx.addCookies([{ name: "navrelia_session", value: val, url: base }]);
const p = await ctx.newPage();
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
p.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));
await p.goto(base + path, { waitUntil: "networkidle", timeout: 180000 });
await p.waitForTimeout(Number(process.env.WAIT ?? 2500));
await p.screenshot({ path: out, fullPage: full === "full" });
await b.close();
