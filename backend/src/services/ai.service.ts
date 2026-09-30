import Groq from "groq-sdk";
import type { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";
import {
  assetAnalysisSchema,
  comparisonAnalysisSchema,
  evidenceSearchIntentSchema,
  impactReportSchema,
  projectInsightSchema,
  type AssetAnalysisResult,
  type ComparisonAnalysisResult,
  type EvidenceSearchIntent,
  type ImpactReportResult,
  type ProjectInsightResult,
} from "../ai/ai.schemas.js";
import {
  evidenceAnalysisSystemPrompt,
  comparisonPrompt,
  comparisonSystemPrompt,
  evidenceSearchPrompt,
  evidenceSearchSystemPrompt,
  imageAnalysisPrompt,
  impactReportPrompt,
  impactReportSystemPrompt,
  projectInsightPrompt,
  projectInsightSystemPrompt,
  videoAnalysisPrompt,
} from "../ai/ai.prompts.js";

const client = env.GROQ_API_KEY
  ? new Groq({ apiKey: env.GROQ_API_KEY, timeout: 45_000, maxRetries: 1 })
  : null;

function requireClient() {
  if (!client) throw new AppError(503, "Groq is not configured");
  return client;
}

function providerError(error: unknown): never {
  const candidate = error as { status?: number; name?: string };
  if (candidate.status === 429)
    throw new AppError(429, "AI service is busy or rate-limited. Please retry shortly");
  if (candidate.status === 401 || candidate.status === 403)
    throw new AppError(503, "AI service authentication is unavailable");
  if (candidate.name === "AbortError" || candidate.name === "TimeoutError")
    throw new AppError(504, "AI service timed out. Please retry");
  if (candidate.status && candidate.status >= 500)
    throw new AppError(502, "AI service is temporarily unavailable");
  throw error;
}

async function structuredRequest<T>(
  schema: z.ZodType<T>,
  system: string,
  userContent: Groq.Chat.ChatCompletionContentPart[] | string,
  maxTokens: number,
): Promise<T> {
  const groq = requireClient();
  let correction = "";
  let lastValidationIssue = "unknown schema mismatch";
  for (let attempt = 0; attempt < 2; attempt++) {
    const content =
      typeof userContent === "string"
        ? `${userContent}${correction}`
        : [
            ...userContent,
            ...(correction
              ? [{ type: "text" as const, text: correction }]
              : []),
          ];
    const completion = await groq.chat.completions.create({
      model: env.AI_MODEL,
      temperature: 0.1,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }).catch(providerError);
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new AppError(502, "The AI provider returned an empty response");
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
      lastValidationIssue = parsed.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      correction = `\nReturn corrected JSON. Validation issue: ${lastValidationIssue}`;
    } catch {
      lastValidationIssue = "response was not valid JSON";
      correction = "\nReturn corrected JSON only. The previous response was not valid JSON.";
    }
  }
  console.warn("Structured AI response rejected:", lastValidationIssue);
  throw new AppError(502, "AI output did not match the required schema");
}

function visualContent(prompt: string, urls: string[]) {
  return [
    { type: "text" as const, text: prompt },
    ...urls.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
  ];
}

export const aiService = {
  provider: "groq" as const,
  model: env.AI_MODEL,
  isConfigured: () => Boolean(client),
  async verifyConnection() {
    await requireClient().models.list();
  },
  analyzeImage(imageUrl: string): Promise<AssetAnalysisResult> {
    return structuredRequest(
      assetAnalysisSchema,
      evidenceAnalysisSystemPrompt,
      visualContent(imageAnalysisPrompt, [imageUrl]),
      900,
    );
  },
  analyzeVideoFrames(frameUrls: string[]): Promise<AssetAnalysisResult> {
    return structuredRequest(
      assetAnalysisSchema,
      evidenceAnalysisSystemPrompt,
      visualContent(videoAnalysisPrompt, frameUrls.slice(0, 3)),
      950,
    );
  },
  parseEvidenceSearch(
    query: string,
    projects: Array<{ id: string; name: string }>,
  ): Promise<EvidenceSearchIntent> {
    return structuredRequest(
      evidenceSearchIntentSchema,
      evidenceSearchSystemPrompt,
      evidenceSearchPrompt(query, projects, new Date().toISOString().slice(0, 10)),
      500,
    );
  },
  summarizeProject(snapshot: unknown): Promise<ProjectInsightResult> {
    return structuredRequest(
      projectInsightSchema,
      projectInsightSystemPrompt,
      projectInsightPrompt(snapshot),
      900,
    );
  },
  compareEvidence(
    beforeUrl: string,
    afterUrl: string,
    metadata: unknown,
  ): Promise<ComparisonAnalysisResult> {
    return structuredRequest(
      comparisonAnalysisSchema,
      comparisonSystemPrompt,
      visualContent(comparisonPrompt(metadata), [beforeUrl, afterUrl]),
      900,
    );
  },
  generateImpactReport(snapshot: unknown): Promise<ImpactReportResult> {
    return structuredRequest(
      impactReportSchema,
      impactReportSystemPrompt,
      impactReportPrompt(snapshot),
      950,
    );
  },
};
