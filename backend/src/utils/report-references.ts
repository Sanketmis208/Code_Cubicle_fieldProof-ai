import type { Prisma } from "@prisma/client";

type ReportReferences = {
  evidenceIds?: unknown;
  comparisonIds?: unknown;
};

function referenceList(content: Prisma.JsonValue, key: keyof ReportReferences) {
  if (!content || Array.isArray(content) || typeof content !== "object") return [];
  const value = (content as ReportReferences)[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function reportReferencesEvidence(content: Prisma.JsonValue, assetId: string) {
  return referenceList(content, "evidenceIds").includes(assetId);
}

export function reportReferencesComparison(
  content: Prisma.JsonValue,
  comparisonId: string,
) {
  return referenceList(content, "comparisonIds").includes(comparisonId);
}
