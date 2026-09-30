import { readFile } from "node:fs/promises";
import { PrismaClient } from "../backend/node_modules/@prisma/client/index.js";

const api = process.env.RELEASE_API_URL || "http://localhost:4000/api";
const fixtureUrl = new URL("../backend/test-assets/field-evidence.png", import.meta.url);
const prisma = new PrismaClient();
const runId = Date.now();
const password = "ReleaseCheck123!";
const users = [
  { name: "Release Owner", email: `release.owner.${runId}@example.test`, password },
  { name: "Release Intruder", email: `release.intruder.${runId}@example.test`, password },
];
let ownerCookie = "";
let intruderCookie = "";
let projectId = "";

async function request(path, options = {}, cookie = "") {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      ...(cookie ? { cookie } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return {
    status: response.status,
    body,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie,
  };
}

async function aiRequest(path, options, cookie, label) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await request(path, options, cookie);
    if (result.status !== 429 || attempt === 4) return result;
    console.log(`WAIT ${label}: provider rate limit, retry ${attempt}/3 in 20 seconds`);
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
}

function expect(result, status, label) {
  if (result.status !== status)
    throw new Error(`${label}: expected ${status}, received ${result.status}`);
  console.log(`PASS ${label}`);
  return result.body;
}

try {
  const health = await request("/health");
  expect(health, 200, "health and PostgreSQL connectivity");
  if (!health.body.services.cloudinary || !health.body.services.ai.configured)
    throw new Error("Required integrations are not configured");

  const owner = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify(users[0]),
  });
  expect(owner, 201, "registration");
  ownerCookie = owner.cookie;
  const intruder = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify(users[1]),
  });
  expect(intruder, 201, "second tenant registration");
  intruderCookie = intruder.cookie;
  expect(await request("/auth/me", {}, ownerCookie), 200, "authenticated session");
  expect(
    await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: users[0].email, password: "incorrect" }),
    }),
    401,
    "bad credential rejection",
  );

  const project = await request(
    "/projects",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Release Audit · Jaipur",
        description: "Temporary end-to-end verification workspace",
        location: "Jaipur, Rajasthan",
        category: "River Cleanup",
        status: "ACTIVE",
        startDate: "2026-08-01",
      }),
    },
    ownerCookie,
  );
  projectId = expect(project, 201, "project creation").project.id;
  expect(await request(`/projects/${projectId}`, {}, intruderCookie), 404, "project ownership isolation");
  expect(
    await request(
      `/projects/${projectId}`,
      { method: "PATCH", body: JSON.stringify({ endDate: "2026-07-01" }) },
      ownerCookie,
    ),
    422,
    "project date invariant",
  );
  expect(
    await request(
      `/projects/${projectId}`,
      { method: "PATCH", body: JSON.stringify({ endDate: "2026-12-01" }) },
      ownerCookie,
    ),
    200,
    "project update",
  );

  const invalidForm = new FormData();
  invalidForm.set("projectId", projectId);
  invalidForm.append("files", new Blob(["not an image"], { type: "image/png" }), "invalid.png");
  expect(
    await request("/assets/upload", { method: "POST", body: invalidForm }, ownerCookie),
    415,
    "media signature rejection",
  );

  const image = await readFile(fixtureUrl);
  const uploadForm = new FormData();
  uploadForm.set("projectId", projectId);
  uploadForm.append("files", new Blob([image], { type: "image/png" }), "before-field-evidence.png");
  uploadForm.append("files", new Blob([image], { type: "image/png" }), "after-field-evidence.png");
  const upload = await request("/assets/upload", { method: "POST", body: uploadForm }, ownerCookie);
  const uploaded = expect(upload, 201, "Cloudinary batch upload").assets;
  if (uploaded.length !== 2 || uploaded.some((asset) => !asset.cloudinaryAssetId || !asset.secureUrl))
    throw new Error("Cloudinary source metadata is incomplete");
  expect(await request(`/assets/${uploaded[0].id}`, {}, intruderCookie), 404, "asset ownership isolation");

  for (const asset of uploaded)
    expect(
      await aiRequest(`/assets/${asset.id}/analyze`, { method: "POST", body: JSON.stringify({}) }, ownerCookie, `analysis ${asset.originalFilename}`),
      200,
      `AI analysis ${asset.originalFilename}`,
    );
  const cached = await request(
    `/assets/${uploaded[0].id}/analyze`,
    { method: "POST", body: JSON.stringify({}) },
    ownerCookie,
  );
  expect(cached, 200, "analysis cache reuse");
  if (!cached.body.cached) throw new Error("Completed analysis was unexpectedly regenerated");

  const search = await aiRequest(
    "/assets/search/interpret",
    {
      method: "POST",
      body: JSON.stringify({ query: "Find image evidence from Jaipur", page: 1, limit: 24 }),
    },
    ownerCookie,
    "natural-language search",
  );
  expect(search, 200, "natural-language search interpretation");
  if (!search.body.intent || search.body.pagination.total < 2)
    throw new Error("Natural-language search did not return the expected persisted evidence");

  const projectDetail = await request(`/projects/${projectId}`, {}, ownerCookie);
  expect(projectDetail, 200, "project timeline and coverage");
  if (projectDetail.body.project.recentAssets.length !== 2)
    throw new Error("Project timeline is missing uploaded evidence");

  const comparison = await aiRequest(
    "/comparisons",
    {
      method: "POST",
      body: JSON.stringify({
        projectId,
        beforeAssetId: uploaded[0].id,
        afterAssetId: uploaded[1].id,
      }),
    },
    ownerCookie,
    "comparison",
  );
  const comparisonId = expect(comparison, 201, "before-and-after comparison").comparison.id;

  const report = await aiRequest(
    "/reports",
    {
      method: "POST",
      body: JSON.stringify({
        projectId,
        title: "Release Audit Evidence Report",
        reportType: "IMPACT_SUMMARY",
      }),
    },
    ownerCookie,
    "report",
  );
  const reportId = expect(report, 201, "grounded report generation").report.id;
  const reportDetail = await request(`/reports/${reportId}`, {}, ownerCookie);
  expect(reportDetail, 200, "report source traceability");
  if (reportDetail.body.report.evidence.length !== 2)
    throw new Error("Report did not resolve both source assets");
  expect(await request(`/reports/${reportId}`, {}, intruderCookie), 404, "report ownership isolation");
  expect(await request(`/assets/${uploaded[0].id}`, { method: "DELETE" }, ownerCookie), 409, "report/comparison evidence deletion guard");
  expect(await request(`/comparisons/${comparisonId}`, { method: "DELETE" }, ownerCookie), 409, "report comparison deletion guard");

  const dashboard = await request("/dashboard/summary", {}, ownerCookie);
  expect(dashboard, 200, "dashboard database counts");
  if (dashboard.body.projects !== 1 || dashboard.body.assets !== 2 || dashboard.body.analyzed !== 2 || dashboard.body.comparisons !== 1 || dashboard.body.reports !== 1)
    throw new Error("Dashboard counts do not match persisted records");

  expect(await request(`/reports/${reportId}`, { method: "DELETE" }, ownerCookie), 204, "report deletion");
  expect(await request(`/comparisons/${comparisonId}`, { method: "DELETE" }, ownerCookie), 204, "comparison deletion");
  expect(await request(`/assets/${uploaded[0].id}`, { method: "DELETE" }, ownerCookie), 204, "Cloudinary-backed asset deletion");
  expect(await request(`/projects/${projectId}`, { method: "DELETE" }, ownerCookie), 204, "project and remaining Cloudinary cleanup");
  projectId = "";
  console.log("RELEASE SMOKE PASS");
} finally {
  if (projectId) {
    const owner = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: users[0].email, password }),
    });
    if (owner.status === 200)
      await request(`/projects/${projectId}`, { method: "DELETE" }, owner.cookie).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { email: { in: users.map((user) => user.email) } } });
  await prisma.$disconnect();
}
