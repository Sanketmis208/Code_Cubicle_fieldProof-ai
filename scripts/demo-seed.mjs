#!/usr/bin/env node
/**
 * Seeds a ready-to-present demo organization through the public API, using
 * your own field photos (shoot them on a phone with location on).
 *
 *   npm run dev                       # API on :4000
 *   node scripts/demo-seed.mjs --photos ./demo-photos [--lat 26.9124 --lng 75.7873]
 *
 * Photos whose file name starts with "old_" go to last year's project (so a
 * re-used copy in this year's project is caught live); everything else goes to
 * this year's project. Only each event's best shots are sent for AI analysis,
 * paced by the server, so the demo never waits on the AI quota.
 *
 * Demo accounts (local only; change DEMO_PASSWORD for anything shared):
 *   owner@greenroots.demo · field@greenroots.demo · verifier@greenroots.demo
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const API = process.env.API_URL || "http://localhost:4000/api";
const PASSWORD = process.env.DEMO_PASSWORD || "Demo-Field-2026";
const photosDir = args.photos;
const site = { latitude: Number(args.lat ?? 26.9124), longitude: Number(args.lng ?? 75.7873) };
if (!photosDir) {
  console.error("Usage: node scripts/demo-seed.mjs --photos <folder> [--lat <deg> --lng <deg>]");
  process.exit(1);
}

class Session {
  constructor(label) { this.label = label; this.cookie = ""; this.org = ""; }
  async request(method, route, body) {
    const isForm = body instanceof FormData;
    const response = await fetch(`${API}${route}`, {
      method,
      headers: {
        ...(body && !isForm ? { "content-type": "application/json" } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.org ? { "x-organization-id": this.org } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${this.label} ${method} ${route}: ${response.status} ${data?.error?.message ?? ""}`);
    return data;
  }
}

async function account(label, name, email, extra = {}) {
  const session = new Session(label);
  try {
    const login = await session.request("POST", "/auth/login", { email, password: PASSWORD });
    return { session, user: login.user, memberships: login.memberships, created: false };
  } catch {
    const register = await session.request("POST", "/auth/register", { name, email, password: PASSWORD, ...extra });
    return { session, user: register.user, memberships: register.memberships, created: true };
  }
}

const step = (text) => console.log(`\n▸ ${text}`);

step("Owner and organization");
const owner = await account("owner", "Meera Sharma", "owner@greenroots.demo", { organizationName: "Green Roots Foundation" });
const org = owner.memberships.find((m) => m.organization.name === "Green Roots Foundation") ?? owner.memberships[0];
owner.session.org = org.organization.id;
console.log(`  ${org.organization.name} (${owner.created ? "created" : "existing"})`);

/** Existing account: sign in and join by code if needed. New account: register straight into the org with the code. */
async function member(role, name, email) {
  const session = new Session(role);
  let signedIn = null;
  try {
    signedIn = await session.request("POST", "/auth/login", { email, password: PASSWORD });
  } catch { /* not registered yet */ }
  if (signedIn?.memberships.some((m) => m.organization.id === org.organization.id))
    return { session, user: signedIn.user, memberships: signedIn.memberships, created: false };
  const invite = await owner.session.request("POST", `/orgs/${org.organization.id}/invites`, { role });
  if (signedIn) {
    await session.request("POST", "/orgs/join", { code: invite.code });
    return { session, user: signedIn.user, memberships: signedIn.memberships, created: false };
  }
  const result = await session.request("POST", "/auth/register", { name, email, password: PASSWORD, inviteCode: invite.code });
  return { session, user: result.user, memberships: result.memberships, created: true };
}
step("Team (joined by invite code)");
const field = await member("FIELD_WORKER", "Sunita Devi", "field@greenroots.demo");
const verifier = await member("VERIFIER", "Ravi Kumar", "verifier@greenroots.demo");
for (const person of [field, verifier]) person.session.org = org.organization.id;
console.log(`  field worker: ${field.user.name} · verifier: ${verifier.user.name}`);

step("Projects and site");
const { projects } = await owner.session.request("GET", "/projects");
async function project(input) {
  const existing = projects.find((p) => p.name === input.name);
  return existing ?? (await owner.session.request("POST", "/projects", input)).project;
}
const lastYear = await project({ name: "Bassi Plantation 2025", startDate: "2025-06-01", endDate: "2025-12-31", status: "COMPLETED", location: "Bassi, Rajasthan", category: "Plantation" });
const thisYear = await project({
  name: "Bassi Plantation 2026", startDate: "2026-01-01", status: "ACTIVE", location: "Bassi, Rajasthan", category: "Plantation",
  description: "Community tree planting along the canal road, monitored at Plot B.",
});
const { sites } = await owner.session.request("GET", `/projects/${thisYear.id}/sites`);
if (!sites.length) await owner.session.request("POST", `/projects/${thisYear.id}/sites`, { name: "Plot B", ...site, radiusM: 300 });
for (const target of [lastYear, thisYear])
  for (const person of [field, verifier])
    await owner.session.request("POST", `/projects/${target.id}/members`, { userId: person.user.id }).catch(() => undefined);
console.log(`  ${lastYear.name} · ${thisYear.name} · site Plot B at ${site.latitude}, ${site.longitude}`);

step("Uploading photos as the field worker");
const files = (await readdir(photosDir)).filter((name) => /\.(jpe?g|png|webp|heic)$/i.test(name)).sort();
const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
const uploaded = [];
for (const [target, group] of [[lastYear, files.filter((f) => f.startsWith("old_"))], [thisYear, files.filter((f) => !f.startsWith("old_"))]]) {
  for (let index = 0; index < group.length; index += 10) {
    const form = new FormData();
    form.append("projectId", target.id);
    for (const name of group.slice(index, index + 10)) {
      const type = types[name.split(".").pop().toLowerCase()];
      form.append("files", new Blob([await readFile(path.join(photosDir, name))], { type }), name);
    }
    const result = await field.session.request("POST", `/assets/upload?projectId=${target.id}`, form);
    uploaded.push(...result.assets.map((asset) => ({ ...asset, project: target })));
    for (const asset of result.assets) console.log(`  ${asset.originalFilename.padEnd(32)} ${String(asset.trustScore).padStart(3)}  ${asset.trustStatus}`);
    for (const skip of result.skipped) console.log(`  ${skip.filename.padEnd(32)} skipped: ${skip.reason}`);
  }
}

step("AI analysis of each event's best shots (paced to the provider's quota)");
const { assets: all } = await owner.session.request("GET", "/assets?limit=48");
const representatives = new Set(all.flatMap((asset) => asset.eventCluster?.representativeIds ?? []));
for (const asset of all.filter((a) => representatives.has(a.id) && a.aiStatus !== "COMPLETED")) {
  try {
    await owner.session.request("POST", `/assets/${asset.id}/analyze`);
    console.log(`  analysed ${asset.originalFilename}`);
  } catch (error) {
    console.log(`  skipped ${asset.originalFilename}: ${error.message}`);
  }
}

step("Verifier approves the cleanest event");
const { assets: queue } = await verifier.session.request("GET", `/review/queue?projectId=${thisYear.id}`);
const strongEvent = queue.find((item) => item.trustStatus === "STRONG" && item.eventClusterId);
if (strongEvent) {
  const decision = await verifier.session.request("POST", `/review/events/${strongEvent.eventClusterId}`, { decision: "APPROVED" });
  console.log(`  approved ${decision.reviewed} item(s); ${decision.left.length} left for individual review`);
} else console.log("  no strong event yet; approve one in the Review screen");

console.log(`\nDone. Sign in at the web app as owner@greenroots.demo, field@greenroots.demo or verifier@greenroots.demo.`);
