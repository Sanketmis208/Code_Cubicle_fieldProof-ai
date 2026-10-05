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
  claimIntentSchema,
  type ClaimIntent,
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
  claimPrompt,
  claimSystemPrompt,
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

/**
 * Paces calls under the provider's tokens-per-minute budget instead of letting
 * bursts fail with 429. Calls run one at a time; each waits until the last
 * minute's usage plus its own estimate fits the budget.
 */
const usage: Array<{ at: number; tokens: number }> = [];
let queue: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function usedInLastMinute(now: number) {
  while (usage.length && now - usage[0]!.at > 60_000) usage.shift();
  return usage.reduce((sum, entry) => sum + entry.tokens, 0);
}

export function paced<T>(estimate: number, run: () => Promise<{ value: T; tokens?: number }>): Promise<T> {
  const budget = env.AI_TOKENS_PER_MINUTE;
  const task = queue.then(async () => {
    const needed = Math.min(estimate, budget);
    while (usedInLastMinute(Date.now()) + needed > budget && usage.length)
      await sleep(Math.max(250, usage[0]!.at + 60_000 - Date.now()));
    const startedAt = Date.now();
    try {
      const { value, tokens } = await run();
      usage.push({ at: startedAt, tokens: tokens ?? estimate });
      return value;
    } catch (error) {
      usage.push({ at: startedAt, tokens: estimate });
      throw error;
    }
  });
  queue = task.catch(() => undefined);
  return task;
}

function estimateTokens(content: Groq.Chat.ChatCompletionContentPart[] | string, system: string, maxTokens: number) {
  const textLength = system.length + (typeof content === 'string'
    ? content.length
    : content.reduce((sum, part) => sum + (part.type === 'text' ? part.text.length : 0), 0));
  const images = typeof content === 'string' ? 0 : content.filter((part) => part.type === 'image_url').length;
  // Measured on the demo key: one small image call is about 2,300 tokens in total.
  return Math.ceil(textLength / 4) + images * 1600 + maxTokens;
}

/** Groq sends retry-after on 429; wait for it once (bounded) before giving up. */
function retryAfterMs(error: unknown) {
  const candidate = error as { status?: number; headers?: Record<string, string> | Headers };
  if (candidate.status !== 429) return null;
  const header = candidate.headers instanceof Headers
    ? candidate.headers.get('retry-after')
    : candidate.headers?.['retry-after'];
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 30_000) : 10_000;
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
    const request = () => groq.chat.completions.create({
      model: env.AI_MODEL,
      temperature: 0.1,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    });
    const completion = await paced(estimateTokens(content, system, maxTokens), async () => {
      const result = await request().catch(async (error: unknown) => {
        const wait = retryAfterMs(error);
        if (wait === null) throw error;
        await sleep(wait);
        return request();
      }).catch(providerError);
      return { value: result, tokens: result.usage?.total_tokens };
    });
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
      1200,
    );
  },
  analyzeVideoFrames(frameUrls: string[]): Promise<AssetAnalysisResult> {
    return structuredRequest(
      assetAnalysisSchema,
      evidenceAnalysisSystemPrompt,
      visualContent(videoAnalysisPrompt, frameUrls.slice(0, 3)),
      1250,
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
      1800,
    );
  },
  parseClaim(claim: string, knownActivities: string[]): Promise<ClaimIntent> {
    return structuredRequest(
      claimIntentSchema,
      claimSystemPrompt,
      claimPrompt(claim, new Date().toISOString().slice(0, 10), knownActivities),
      400,
    );
  },
};
