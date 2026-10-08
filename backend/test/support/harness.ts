import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { testDatabaseUrl } from './db-url.mjs';

// Environment must be fixed before any src module is imported (env.ts parses on load).
const databaseUrl = testDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL = databaseUrl;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
// Empty (not deleted) so dotenv cannot refill them from backend/.env.
for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'GROQ_API_KEY'])
  process.env[key] = '';

const { app } = await import('../../src/app.js');
const { prisma } = await import('../../src/lib/prisma.js');
const { cloudinaryService } = await import('../../src/services/cloudinary.service.js');
const { aiService } = await import('../../src/services/ai.service.js');
const { outbox } = await import('../../src/services/mail.service.js');

export { prisma, cloudinaryService, aiService, outbox };

/** What the fake Cloudinary saw; tests read and tweak this. */
export const cloud = {
  uploads: [] as Array<{ publicId: string; folder?: string; bytes: number }>,
  deleted: [] as string[],
  /** Extra fields merged into the next upload responses (e.g. phash, metadata). */
  nextResponse: [] as Array<Record<string, unknown>>,
  failUpload: false,
  /** Simulates an account without quality analysis: uploads asking for it are refused. */
  rejectQualityAnalysis: false,
  /** Options of every upload call, including refused attempts. */
  options: [] as Array<Record<string, unknown>>,
};

/** What the fake vision model saw and will answer. */
export const ai = {
  imageUrls: [] as string[],
  nextAuthenticity: undefined as unknown,
  nextReport: undefined as unknown,
  nextClaim: undefined as unknown,
  nextSearch: undefined as unknown,
};
let uploadCounter = 0;

export const fakeAnalysis = {
  summary: 'Saplings planted in a row along a dirt path.',
  detailedDescription: 'Around twenty young saplings with stakes are visible along a dry dirt path.',
  activity: 'tree planting',
  projectCategoryHints: ['plantation'],
  locationType: 'rural roadside',
  visibleSubjects: ['saplings', 'stakes'],
  environmentalSignals: [{ type: 'vegetation', description: 'young saplings visible', confidence: 0.8 }],
  infrastructureSignals: [],
  detectedObjects: ['sapling', 'stake'],
  tags: ['plantation', 'saplings'],
  evidenceStrength: 'moderate' as const,
  imageQuality: 'clear, daylight',
  evidenceUsefulness: 'Shows planting activity at one point in time.',
  uncertainties: ['Exact location is not visible.'],
  confidence: 0.78,
};

export function installFakes() {
  Object.assign(cloudinaryService, {
    isConfigured: () => true,
    async uploadBuffer(buffer: Buffer, options: { folder?: string } & Record<string, unknown>) {
      cloud.options.push(options);
      if (cloud.failUpload) throw new Error('fake cloudinary outage');
      if (cloud.rejectQualityAnalysis && options.quality_analysis)
        throw new Error('quality_analysis is not enabled for this account');
      uploadCounter += 1;
      const publicId = `${options.folder ?? 'test'}/file-${uploadCounter}`;
      cloud.uploads.push({ publicId, folder: options.folder, bytes: buffer.length });
      return {
        public_id: publicId,
        asset_id: `asset-${uploadCounter}-${Date.now()}`,
        resource_type: 'image',
        secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.png`,
        width: 640, height: 480, bytes: buffer.length, format: 'png',
        ...(cloud.nextResponse.shift() ?? {}),
      };
    },
    async deleteResource(publicId: string) {
      cloud.deleted.push(publicId);
      return { result: 'ok' };
    },
    async applyAnalysisMetadata() {},
    deliveryUrl: (publicId: string, resourceType: string, transformation: string) =>
      `https://res.cloudinary.com/demo/${resourceType}/upload/${transformation}/${publicId}${resourceType === 'video' ? '.jpg' : ''}`,
    analysisImageUrl: (publicId: string) => `https://res.cloudinary.com/demo/image/upload/f_jpg,w_1280/${publicId}.jpg`,
    videoFrameUrls: (publicId: string) => [1, 2, 3].map((n) => `https://res.cloudinary.com/demo/video/upload/so_${n}/${publicId}.jpg`),
  });
  Object.assign(aiService, {
    isConfigured: () => true,
    analyzeImage: async (url: string) => {
      ai.imageUrls.push(url);
      const authenticity = ai.nextAuthenticity;
      ai.nextAuthenticity = undefined;
      return authenticity ? { ...fakeAnalysis, authenticity } : fakeAnalysis;
    },
    analyzeVideoFrames: async () => fakeAnalysis,
    parseEvidenceSearch: async (query: string) => ai.nextSearch ?? ({
      queryText: query, projectIds: [], activities: [], tags: [], signals: [],
      dateFrom: null, dateTo: null, mediaTypes: [], locationTerms: [], freeTextTerms: [],
    }),
    summarizeProject: async () => ({
      summary: 'Summary of the project evidence for testing purposes.',
      documentedActivities: ['tree planting'], locationsRepresented: ['Jaipur'],
      timeSpan: 'one day', recurringObservations: [], evidenceGaps: [],
      recentActivity: 'planting', uncertaintyNotes: [],
    }),
    compareEvidence: async () => ({
      summary: 'More vegetation is visible in the later image than the earlier one.',
      visibleChanges: ['denser vegetation'], stableObservations: ['path'],
      uncertainties: [], evidenceLimitations: [], confidence: 0.6,
    }),
    generateImpactReport: async () => ai.nextReport ?? ({
      executiveSummary: 'Stored evidence documents planting activity over the period.',
      documentedActivities: [{ text: 'Tree planting took place', evidence: ['E1'] }],
      visibleObservations: [{ text: 'Young saplings are visible', evidence: ['E1', 'E2'] }],
      comparisonFindings: [], evidenceGaps: [], methodologyNote: 'Generated from stored evidence for tests only.',
    }),
    assist: async (messages: Array<{ content: string }>, facts: { awaitingReview: number }) =>
      `You asked: ${messages.at(-1)?.content}. ${facts.awaitingReview} item(s) await review.`,
    parseClaim: async () => ai.nextClaim ?? ({
      activities: ['tree planting'], locationTerms: [], dateFrom: null, dateTo: null, quantity: null, keywords: [],
    }),
  });
}

export async function resetDb() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  cloud.uploads.length = 0;
  cloud.deleted.length = 0;
  cloud.nextResponse.length = 0;
  cloud.failUpload = false;
  outbox.length = 0;
  cloud.rejectQualityAnalysis = false;
  cloud.options.length = 0;
  ai.imageUrls.length = 0;
  ai.nextAuthenticity = undefined;
  ai.nextReport = undefined;
  ai.nextClaim = undefined;
  ai.nextSearch = undefined;
}

let server: Server | undefined;
let baseUrl = '';

export async function startServer() {
  installFakes();
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  return baseUrl;
}

export async function stopServer() {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await prisma.$disconnect();
}

type Result<T = any> = { status: number; body: T };

/** A browser-like client: keeps its own session cookie and optional active org. */
export class Client {
  cookie = '';
  orgId: string | undefined;
  user: any;
  memberships: any[] = [];

  async request<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Result<T>> {
    const isForm = body instanceof FormData;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.orgId ? { 'x-organization-id': this.orgId } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0]!;
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    return { status: response.status, body: data as T };
  }
  get<T = any>(path: string, headers?: Record<string, string>) { return this.request<T>('GET', path, undefined, headers); }
  post<T = any>(path: string, body?: unknown, headers?: Record<string, string>) { return this.request<T>('POST', path, body ?? {}, headers); }
  patch<T = any>(path: string, body?: unknown) { return this.request<T>('PATCH', path, body ?? {}); }
  del<T = any>(path: string) { return this.request<T>('DELETE', path); }
}

let userCounter = 0;
export async function registerUser(name = 'Test User', extra: Record<string, unknown> = {}) {
  userCounter += 1;
  const client = new Client();
  const email = `user${userCounter}.${Date.now()}@example.test`;
  const result = await client.post('/auth/register', { name, email, password: 'Password123', ...extra });
  if (result.status !== 201) throw new Error(`register failed: ${result.status} ${JSON.stringify(result.body)}`);
  client.user = { ...result.body.user, email, password: 'Password123' };
  client.memberships = result.body.memberships;
  return client;
}

/** Minimal valid PNG header followed by unique bytes so every file hashes differently. */
export function pngFile(name = 'photo.png', seed: string = `${Math.random()}`) {
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(seed)]);
  return new File([bytes], name, { type: 'image/png' });
}

export function uploadForm(projectId: string, files: File[]) {
  const form = new FormData();
  form.append('projectId', projectId);
  for (const file of files) form.append('files', file);
  return form;
}

export const projectInput = (overrides: Record<string, unknown> = {}) => ({
  name: 'Jaipur plantation drive',
  startDate: '2026-01-01',
  status: 'ACTIVE',
  location: 'Jaipur',
  ...overrides,
});

type Role = 'OWNER' | 'ADMIN' | 'PROGRAM_MANAGER' | 'VERIFIER' | 'FIELD_WORKER' | 'VIEWER';

/** The setup link from the most recent email to `email` (SMTP is not configured in tests, so mail stays in the outbox). */
export function setupLinkFor(email: string) {
  const mail = [...outbox].reverse().find((m) => m.to === email);
  const match = mail?.text.match(/https?:\/\/\S+\/setup\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`no setup link mailed to ${email}`);
  return { token: match[1]!, url: match[0] };
}

/**
 * Adds a member the way an admin does: by email. The new person then opens
 * the emailed link and chooses a password, which also signs them in.
 */
export async function addMember(owner: Client, orgId: string, role: Role, name: string, password = 'Password123') {
  userCounter += 1;
  const email = `member${userCounter}.${Date.now()}@example.test`;
  const added = await owner.post(`/orgs/${orgId}/members`, { name, email, role });
  if (added.status !== 201) throw new Error(`add member failed: ${added.status} ${JSON.stringify(added.body)}`);
  const { token } = setupLinkFor(email);
  const client = new Client();
  const done = await client.post(`/auth/setup/${token}`, { password });
  if (done.status !== 200) throw new Error(`setup failed: ${done.status} ${JSON.stringify(done.body)}`);
  client.user = { ...done.body.user, email, password };
  client.memberships = done.body.memberships;
  return client;
}

/** An organization with an owner and one member per requested role, each added by email. */
export async function orgWith(name: string, roles: Role[] = []) {
  const owner = await registerUser(`${name} owner`, { organizationName: name });
  const orgId: string = owner.memberships[0].organization.id;
  const members = {} as Record<Role, Client>;
  for (const role of roles) members[role] = await addMember(owner, orgId, role, `${name} ${role}`);
  return { owner, orgId, members };
}
