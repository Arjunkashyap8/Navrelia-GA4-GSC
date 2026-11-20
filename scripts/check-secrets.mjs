// Fails if any secret value from the environment appears in the client build output.
// Usage: npm run build && npm run check:secrets
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SECRET_VARS = [
  "GA4_CLIENT_SECRET",
  "GA4_REFRESH_TOKEN",
  "GSC_CLIENT_SECRET",
  "GSC_REFRESH_TOKEN",
  "DASHBOARD_PASSWORD",
  "ANTHROPIC_API_KEY",
];

// Load .env.local without printing it.
const envFile = ".env.local";
const values = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const secrets = SECRET_VARS.map((k) => [k, process.env[k] ?? values[k]]).filter(([, v]) => v && v.length >= 8);

const dist = process.env.NEXT_DIST_DIR || ".next";
const roots = [`${dist}/static`, `${dist}/server/app`].filter(existsSync);
if (!roots.length) {
  console.error("No build output found. Run `npm run build` first.");
  process.exit(1);
}

const hits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|json|rsc|txt|map)$/.test(name)) {
      const text = readFileSync(p, "utf8");
      for (const [k, v] of secrets) if (text.includes(v)) hits.push(`${k} found in ${p}`);
    }
  }
};
// Client-facing output: static chunks and prerendered HTML/RSC payloads.
roots.forEach(walk);

if (hits.length) {
  console.error("Secret leak detected:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`OK — checked ${secrets.length} secret value(s) against ${roots.join(", ")}; none found.`);
