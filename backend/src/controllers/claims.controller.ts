import type { Prisma } from "@prisma/client";
import type { RequestHandler } from "express";
import { actorForProject, actorFromRequest, assetWhere } from "../authz/actor.js";
import { prisma } from "../lib/prisma.js";
import { aiService } from "../services/ai.service.js";
import { evidenceInclude } from "../services/evidence.service.js";
import { stems } from "../utils/text-match.js";

type Candidate = Prisma.AssetGetPayload<{ include: typeof evidenceInclude }>;

const lower = (value: unknown) => (typeof value === "string" ? value.toLowerCase() : "");
const strings = (value: Prisma.JsonValue | null | undefined) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function activityText(asset: Candidate) {
  return [
    asset.activity, asset.description, asset.analysis?.activity, asset.analysis?.summary, ...strings(asset.analysis?.tags),
    // Unanalysed evidence still belongs to a project with a stated purpose.
    asset.project.name, asset.project.category,
  ].map(lower).join(" ");
}


function placeText(asset: Candidate) {
  return [asset.site?.name, asset.locationName, asset.project.location, asset.project.name, asset.analysis?.locationType]
    .map(lower).join(" ");
}

/**
 * Claim checker: paste a sentence from a donor report ("we planted 500
 * saplings in Bassi in August") and get the evidence behind it, how much of it
 * is trustworthy and reviewed, and what is missing. One AI call turns the
 * sentence into search terms; the matching and the verdict are deterministic.
 */
export const checkClaim: RequestHandler = async (req, res) => {
  const { claim, projectId } = req.body as { claim: string; projectId?: string };
  const actor = projectId ? await actorForProject(req.userId!, projectId) : await actorFromRequest(req);
  const scope: Prisma.AssetWhereInput = { ...assetWhere(actor), ...(projectId && { projectId }) };
  const activities = await prisma.asset.findMany({
    where: { ...scope, activity: { not: null } }, distinct: ["activity"], select: { activity: true }, take: 60,
  });
  const intent = await aiService.parseClaim(claim, activities.map((row) => row.activity!).filter(Boolean));
  const candidates = await prisma.asset.findMany({
    where: { ...scope, reviewStatus: { not: "REJECTED" } },
    include: evidenceInclude,
    orderBy: [{ capturedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 1000,
  });

  const activityTerms = stems([...intent.activities, ...intent.keywords]);
  const placeTerms = intent.locationTerms.map((term) => term.toLowerCase()).filter(Boolean);
  const from = intent.dateFrom ? new Date(`${intent.dateFrom}T00:00:00.000Z`) : null;
  const to = intent.dateTo ? new Date(`${intent.dateTo}T23:59:59.999Z`) : null;

  const aboutActivity = candidates.filter((asset) => !activityTerms.length || activityTerms.some((term) => activityText(asset).includes(term)));
  const atPlace = aboutActivity.filter((asset) => !placeTerms.length || placeTerms.some((term) => placeText(asset).includes(term)));
  const inPeriod = atPlace.filter((asset) => {
    const at = asset.capturedAt ?? asset.createdAt;
    return (!from || at >= from) && (!to || at <= to);
  });

  const matching = inPeriod;
  const approved = matching.filter((asset) => asset.reviewStatus === "APPROVED");
  const trusted = matching.filter((asset) => asset.trustStatus === "STRONG" || asset.trustStatus === "MODERATE");
  const secondLook = matching.filter((asset) => asset.trustStatus === "NEEDS_SECOND_LOOK");
  const events = new Set(matching.map((asset) => asset.eventClusterId ?? asset.id));
  const located = matching.filter((asset) => asset.siteId);

  const gaps: string[] = [];
  if (!aboutActivity.length) gaps.push("No evidence shows this activity.");
  else if (placeTerms.length && !atPlace.length) gaps.push(`Evidence of the activity exists, but none from ${intent.locationTerms.join(", ")}.`);
  else if ((from || to) && !inPeriod.length)
    gaps.push(`Evidence exists, but none dated ${intent.dateFrom ?? "any time"} to ${intent.dateTo ?? "now"}.`);
  if (matching.length && !approved.length) gaps.push("None of the matching evidence has been approved by a reviewer yet.");
  if (secondLook.length) gaps.push(`${secondLook.length} matching item${secondLook.length === 1 ? " needs" : "s need"} a second look before being cited.`);
  if (matching.length && !located.length) gaps.push("None of the matching evidence is confirmed inside a project site.");
  if (intent.quantity)
    gaps.push(`“${intent.quantity.value} ${intent.quantity.unit}” is a count. Photos can show the activity happened, not how many; attach a tally or distribution record.`);

  const verdict = !matching.length
    ? "UNSUPPORTED"
    : approved.some((asset) => asset.trustStatus !== "NEEDS_SECOND_LOOK") && !(placeTerms.length && !atPlace.length)
      ? (intent.quantity ? "PARTIAL" : "SUPPORTED")
      : "PARTIAL";

  const rank = (asset: Candidate) => (asset.reviewStatus === "APPROVED" ? 0 : 1) * 1000 - (asset.trustScore ?? 0);
  res.json({
    claim,
    intent,
    verdict,
    counts: {
      matching: matching.length, events: events.size, approved: approved.length, trusted: trusted.length,
      needsSecondLook: secondLook.length, insideSite: located.length,
    },
    gaps,
    evidence: [...matching].sort((a, b) => rank(a) - rank(b)).slice(0, 12),
  });
};
