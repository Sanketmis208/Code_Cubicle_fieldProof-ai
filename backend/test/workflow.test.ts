import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { sha256 } from '../src/trust/provenance.js';
import {
  ai, Client, cloud, orgWith, pngFile, prisma, projectInput, registerUser, resetDb, startServer, stopServer, uploadForm,
} from './support/harness.js';
import { jpegFile, jpegWithExif } from './support/jpeg.js';

before(startServer);
after(stopServer);
beforeEach(resetDb);

const JAIPUR = { latitude: 26.9124, longitude: 75.7873 };

async function teamProject() {
  const team = await orgWith('Green Roots', ['FIELD_WORKER', 'VERIFIER']);
  const project = await team.owner.post('/projects', projectInput());
  const projectId = project.body.project.id as string;
  await team.owner.post(`/projects/${projectId}/sites`, { name: 'Plot B', ...JAIPUR, radiusM: 300 });
  for (const role of ['FIELD_WORKER', 'VERIFIER'] as const)
    await team.owner.post(`/projects/${projectId}/members`, { userId: team.members[role].user.id });
  return { ...team, projectId };
}

const camera = (seed: string, extra: Record<string, unknown> = {}) =>
  jpegFile(`${seed}.jpg`, { make: 'Xiaomi', model: 'Redmi', dateTimeOriginal: '2026:02:10 10:30:00', offset: '+05:30', ...JAIPUR, seed, ...extra });

describe('review queue', () => {
  it('lists riskiest evidence first and enforces separation of duties', async () => {
    const { owner, members, projectId } = await teamProject();
    const worker = members.FIELD_WORKER;
    const verifier = members.VERIFIER;
    const good = await worker.post('/assets/upload', uploadForm(projectId, [camera('good')]));
    const forwarded = await worker.post('/assets/upload', uploadForm(projectId, [pngFile('IMG-20260210-WA0001.png')]));
    const queue = await verifier.get('/review/queue');
    assert.equal(queue.status, 200);
    assert.deepEqual(queue.body.assets.map((a: any) => a.id), [forwarded.body.assets[0].id, good.body.assets[0].id]);
    assert.ok(queue.body.assets[0].flags.length > 0 || queue.body.assets[0].trustScore < queue.body.assets[1].trustScore);

    assert.equal((await worker.get('/review/queue')).status, 403, 'field workers do not review');
    const approve = await verifier.post(`/review/assets/${good.body.assets[0].id}`, { decision: 'APPROVED' });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.asset.reviewStatus, 'APPROVED');
    const reject = await verifier.post(`/review/assets/${forwarded.body.assets[0].id}`, { decision: 'REJECTED' });
    assert.equal(reject.body.error.code, 'REASON_REQUIRED');

    // The verifier cannot approve what they uploaded themselves (team has several reviewers).
    const own = await owner.post('/assets/upload', uploadForm(projectId, [camera('own')]));
    const self = await owner.post(`/review/assets/${own.body.assets[0].id}`, { decision: 'APPROVED' });
    assert.equal(self.status, 403);
    assert.equal(self.body.error.code, 'SELF_REVIEW');
    const log = await prisma.auditLog.findFirst({ where: { action: 'evidence.reviewed' } });
    assert.equal((log?.metadata as any).decision, 'APPROVED');
  });

  it('lets a solo workspace owner review their own uploads, recorded as self-reviewed', async () => {
    const solo = await registerUser('Solo founder');
    const project = await solo.post('/projects', projectInput());
    const upload = await solo.post('/assets/upload', uploadForm(project.body.project.id, [camera('solo')]));
    const result = await solo.post(`/review/assets/${upload.body.assets[0].id}`, { decision: 'APPROVED' });
    assert.equal(result.status, 200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'evidence.reviewed' } });
    assert.equal((log.metadata as any).selfReviewed, true);
  });

  it('approves a whole event but leaves hard-flagged items for individual review', async () => {
    const { members, projectId } = await teamProject();
    const worker = members.FIELD_WORKER;
    const bytes = jpegWithExif({ make: 'Xiaomi', model: 'R', dateTimeOriginal: '2026:02:10 10:30:00', offset: '+05:30', ...JAIPUR, seed: 'dupe' });
    // Same bytes already used in another project of the org -> hard flag on this one.
    const otherProject = await prisma.project.create({ data: { name: 'Older project', startDate: new Date('2025-01-01'), ownerId: worker.user.id, organizationId: worker.memberships[0].organization.id } });
    await prisma.asset.create({
      data: { projectId: otherProject.id, cloudinaryPublicId: 'old/dupe', resourceType: 'IMAGE', secureUrl: 'https://x/y.jpg', originalFilename: 'old.jpg', sha256: sha256(bytes), createdAt: new Date('2025-06-01') },
    });
    await worker.post('/assets/upload', uploadForm(projectId, [camera('e1'), camera('e2', { dateTimeOriginal: '2026:02:10 10:32:00' }), new File([bytes], 'reused.jpg', { type: 'image/jpeg' })]));
    const cluster = await prisma.eventCluster.findFirstOrThrow({ where: { projectId } });
    const result = await members.VERIFIER.post(`/review/events/${cluster.id}`, { decision: 'APPROVED' });
    assert.equal(result.status, 200);
    assert.equal(result.body.reviewed, 2);
    assert.deepEqual(result.body.left.map((item: any) => item.reason), ['HARD_FLAG']);
  });
});

describe('evidence passport', () => {
  it('shows checks, delivery transformations and the original behind a reuse flag', async () => {
    const user = await registerUser();
    const first = await user.post('/projects', projectInput({ name: 'Last year' }));
    const second = await user.post('/projects', projectInput({ name: 'This year' }));
    const bytes = jpegWithExif({ make: 'X', model: 'Y', seed: 'p' });
    const original = await user.post('/assets/upload', uploadForm(first.body.project.id, [new File([bytes], 'a.jpg', { type: 'image/jpeg' })]));
    const reused = await user.post('/assets/upload', uploadForm(second.body.project.id, [new File([bytes], 'b.jpg', { type: 'image/jpeg' })]));
    const passport = await user.get(`/assets/${reused.body.assets[0].id}/passport`);
    assert.equal(passport.status, 200);
    assert.equal(passport.body.passport.related[0].id, original.body.assets[0].id);
    assert.ok(passport.body.passport.delivery.some((d: any) => d.transformation.includes('e_blur_faces')));
    assert.ok(passport.body.passport.asset.trustChecks.some((c: any) => c.check === 'EXACT_REUSE'));
  });

  it('publishes a privacy-safe public passport only when shared, and withdraws it', async () => {
    const team = await orgWith('Green Roots', ['FIELD_WORKER']);
    const project = await team.owner.post('/projects', projectInput());
    const upload = await team.owner.post('/assets/upload', uploadForm(project.body.project.id, [camera('share')]));
    const id = upload.body.assets[0].id;
    assert.equal((await team.members.FIELD_WORKER.post(`/assets/${id}/share`)).status, 404, 'unassigned worker cannot see it');
    const shared = await team.owner.post(`/assets/${id}/share`);
    assert.equal(shared.status, 200);
    const anonymous = new Client();
    const view = await anonymous.get(`/public/passport/${shared.body.token}`);
    assert.equal(view.status, 200);
    const text = JSON.stringify(view.body);
    assert.ok(!text.includes(team.owner.user.email) && !text.includes(team.owner.user.name), 'no names or emails');
    assert.equal(view.body.passport.approximateLocation.latitude, 26.91);
    assert.match(view.body.passport.previewUrl, /e_blur_faces/);
    assert.equal((await team.owner.del(`/assets/${id}/share`)).status, 204);
    assert.equal((await anonymous.get(`/public/passport/${shared.body.token}`)).status, 404);
    assert.equal((await anonymous.get('/public/passport/not-a-token')).status, 404);
  });
});

describe('reports cite their evidence', () => {
  it('keeps supplied labels, drops invented ones and counts unsupported claims', async () => {
    const user = await registerUser();
    const project = await user.post('/projects', projectInput());
    const upload = await user.post('/assets/upload', uploadForm(project.body.project.id, [camera('r1'), camera('r2', { dateTimeOriginal: '2026:02:11 09:00:00' })]));
    ai.nextReport = {
      executiveSummary: 'Planting is documented on two days with visible saplings.',
      documentedActivities: [{ text: 'Planting took place', evidence: ['E1', 'E2'] }, { text: 'A school was built', evidence: ['E99'] }],
      visibleObservations: [{ text: 'Saplings visible', evidence: ['e2'] }],
      comparisonFindings: [], evidenceGaps: ['No baseline photo'], methodologyNote: 'Generated from stored evidence in a test run.',
    };
    const report = await user.post('/reports', { projectId: project.body.project.id, title: 'Cited report', reportType: 'DONOR_REPORT' });
    assert.equal(report.status, 201);
    const content = report.body.report.content;
    const ids = upload.body.assets.map((a: any) => a.id);
    assert.equal(content.documentedActivities[0].evidenceIds.length, 2);
    assert.ok(content.documentedActivities[0].evidenceIds.every((id: string) => ids.includes(id)));
    assert.deepEqual(content.documentedActivities[1].evidenceIds, [], 'invented label E99 was dropped');
    assert.equal(content.visibleObservations[0].evidenceIds.length, 1, 'labels are case-insensitive');
    assert.deepEqual(content.citations, { supported: 2, unsupported: 1 });
    assert.equal(content.selection.considered, 2);
  });

  it('never feeds rejected evidence to the report', async () => {
    const team = await teamProject();
    const upload = await team.members.FIELD_WORKER.post('/assets/upload', uploadForm(team.projectId, [camera('keep'), camera('drop', { dateTimeOriginal: '2026:02:12 09:00:00' })]));
    const [keep, drop] = upload.body.assets;
    await team.members.VERIFIER.post(`/review/assets/${drop.id}`, { decision: 'REJECTED', note: 'Wrong site' });
    const report = await team.owner.post('/reports', { projectId: team.projectId, title: 'Clean report', reportType: 'PROJECT_UPDATE' });
    assert.deepEqual(report.body.report.content.evidenceIds, [keep.id]);
    assert.equal(report.body.report.content.selection.excludedRejected, 1);
  });
});

describe('claim checker', () => {
  it('finds supporting evidence and names what is missing', async () => {
    const team = await teamProject();
    const upload = await team.members.FIELD_WORKER.post('/assets/upload', uploadForm(team.projectId, [camera('claim')]));
    await team.members.FIELD_WORKER.post(`/assets/${upload.body.assets[0].id}/analyze`);
    ai.nextClaim = { activities: ['tree planting'], locationTerms: ['Plot B'], dateFrom: '2026-02-01', dateTo: '2026-02-28', quantity: { value: 500, unit: 'saplings' }, keywords: [] };
    const pending = await team.owner.post('/claims/check', { claim: 'We planted 500 saplings at Plot B in February 2026' });
    assert.equal(pending.status, 200);
    assert.equal(pending.body.verdict, 'PARTIAL');
    assert.equal(pending.body.counts.matching, 1);
    assert.ok(pending.body.gaps.some((gap: string) => gap.includes('approved')));
    assert.ok(pending.body.gaps.some((gap: string) => gap.includes('500 saplings')));

    ai.nextClaim = { activities: ['borewell'], locationTerms: [], dateFrom: null, dateTo: null, quantity: null, keywords: [] };
    const none = await team.owner.post('/claims/check', { claim: 'We drilled a borewell for the school' });
    assert.equal(none.body.verdict, 'UNSUPPORTED');
  });
});

describe('story studio', () => {
  it('builds a face-blurred card with a passport QR and records the transformation', async () => {
    const user = await registerUser();
    const project = await user.post('/projects', projectInput());
    const upload = await user.post('/assets/upload', uploadForm(project.body.project.id, [camera('story')]));
    const id = upload.body.assets[0].id;
    await user.post(`/review/assets/${id}`, { decision: 'APPROVED' });
    const story = await user.post('/story', { kind: 'SQUARE_CARD', assetIds: [id], headline: '1,200 saplings, one village / Bassi' });
    assert.equal(story.status, 201);
    const { transformation } = story.body.derived;
    assert.match(transformation, /e_blur_faces/);
    assert.match(transformation, /VERIFIED%20FIELD%20EVIDENCE/);
    assert.match(transformation, /1%252C200/, 'commas are double-escaped for Cloudinary');
    assert.match(transformation, /%252F/, 'slashes are double-escaped');
    assert.match(transformation, /l_fieldproof:.+:qr:/);
    assert.match(story.body.passportUrl, /\/passport\//);
    const passport = await user.get(`/assets/${id}/passport`);
    assert.equal(passport.body.passport.derived[0].kind, 'SQUARE_CARD');
  });

  it('refuses to publish evidence that needs a second look until a reviewer approves it', async () => {
    const user = await registerUser();
    const a = await user.post('/projects', projectInput({ name: 'First project' }));
    const b = await user.post('/projects', projectInput({ name: 'Second project' }));
    const bytes = jpegWithExif({ make: 'X', model: 'Y', seed: 'dup-story' });
    await user.post('/assets/upload', uploadForm(a.body.project.id, [new File([bytes], 'a.jpg', { type: 'image/jpeg' })]));
    const reused = await user.post('/assets/upload', uploadForm(b.body.project.id, [new File([bytes], 'b.jpg', { type: 'image/jpeg' })]));
    const result = await user.post('/story', { kind: 'STORY', assetIds: [reused.body.assets[0].id], headline: 'Should not publish' });
    assert.equal(result.status, 422);
    assert.equal(result.body.error.code, 'NEEDS_REVIEW');
  });
});

describe('live capture', () => {
  async function enrolledDevice(client: Client) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
    const device = await client.post('/capture/devices', { publicKey: raw, platform: 'android', model: 'Pixel 7' });
    assert.equal(device.status, 201);
    return { deviceId: device.body.device.id as string, privateKey };
  }
  const captureForm = (bytes: Buffer, fields: Record<string, string>) => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(bytes)], 'capture.jpg', { type: 'image/jpeg' }));
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return form;
  };

  it('issues bearer tokens that work without cookies', async () => {
    const user = await registerUser();
    const anonymous = new Client();
    const token = await anonymous.post('/auth/token', { email: user.user.email, password: 'Password123' });
    assert.equal(token.status, 200);
    const bearer = new Client();
    const me = await bearer.get('/auth/me', { authorization: `Bearer ${token.body.token}` });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, user.user.id);
  });

  it('accepts a signed app capture as the most trusted evidence', async () => {
    const user = await registerUser();
    const project = await user.post('/projects', projectInput());
    const projectId = project.body.project.id;
    await user.post(`/projects/${projectId}/sites`, { name: 'Plot B', ...JAIPUR });
    const { deviceId, privateKey } = await enrolledDevice(user);
    const bytes = jpegWithExif({ seed: 'live' });
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    const manifest = JSON.stringify({ clientCaptureId: randomUUID(), projectId, sha256: sha256(bytes), capturedAt, timeSource: 'TRUSTED', ...JAIPUR, accuracyM: 8, mockLocation: false, deviceId });
    const signature = sign(null, Buffer.from(manifest), privateKey).toString('base64');
    const result = await user.post('/capture/upload', captureForm(bytes, { manifest, signature, source: 'APP' }));
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const asset = result.body.assets[0];
    assert.equal(asset.captureSource, 'APP_CAPTURE');
    assert.equal(asset.capturedAt, capturedAt);
    assert.equal(asset.trustScore, 100);
    assert.equal(asset.trustStatus, 'STRONG');
    const checks = await prisma.trustCheck.findMany({ where: { assetId: asset.id } });
    assert.equal(checks.find((c) => c.check === 'SIGNATURE')?.result, 'PASS');

    // A retry of the same capture is recognised, not duplicated.
    const retry = await user.post('/capture/upload', captureForm(bytes, { manifest, signature, source: 'APP' }));
    assert.equal(retry.status, 200);
    assert.equal(retry.body.skipped[0].existingAssetId, asset.id);
  });

  it('flags a capture whose file or facts changed after signing, and mock GPS', async () => {
    const user = await registerUser();
    const project = await user.post('/projects', projectInput());
    const projectId = project.body.project.id;
    const { deviceId, privateKey } = await enrolledDevice(user);
    const bytes = jpegWithExif({ seed: 'signed' });
    const manifest = JSON.stringify({ clientCaptureId: randomUUID(), projectId, sha256: sha256(bytes), capturedAt: new Date().toISOString(), timeSource: 'TRUSTED', latitude: null, longitude: null, accuracyM: null, mockLocation: true, deviceId });
    const signature = sign(null, Buffer.from(manifest), privateKey).toString('base64');
    const edited = Buffer.concat([bytes, Buffer.from('edited')]);
    const tampered = await user.post('/capture/upload', captureForm(edited, { manifest, signature, source: 'APP' }));
    assert.equal(tampered.status, 201);
    const checks = await prisma.trustCheck.findMany({ where: { assetId: tampered.body.assets[0].id } });
    assert.equal(checks.find((c) => c.check === 'SIGNATURE')?.result, 'FAIL');
    assert.equal(checks.find((c) => c.check === 'MOCK_LOCATION')?.hard, true);
    assert.equal(tampered.body.assets[0].trustStatus, 'NEEDS_SECOND_LOOK');
  });

  it('refuses captures from devices enrolled by someone else', async () => {
    const owner = await registerUser('Device owner');
    const other = await registerUser('Someone else');
    const { deviceId, privateKey } = await enrolledDevice(owner);
    const project = await other.post('/projects', projectInput());
    const bytes = jpegWithExif({ seed: 'stolen' });
    const manifest = JSON.stringify({ clientCaptureId: randomUUID(), projectId: project.body.project.id, sha256: sha256(bytes), capturedAt: new Date().toISOString(), timeSource: 'TRUSTED', latitude: null, longitude: null, accuracyM: null, mockLocation: false, deviceId });
    const signature = sign(null, Buffer.from(manifest), privateKey).toString('base64');
    const result = await other.post('/capture/upload', captureForm(bytes, { manifest, signature, source: 'APP' }));
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, 'DEVICE_UNKNOWN');
  });

  it('uses server time for browser captures and ignores the browser clock', async () => {
    const user = await registerUser();
    const project = await user.post('/projects', projectInput());
    const bytes = jpegWithExif({ seed: 'web' });
    const manifest = JSON.stringify({ clientCaptureId: randomUUID(), projectId: project.body.project.id, sha256: sha256(bytes), capturedAt: '2019-01-01T00:00:00.000Z', timeSource: 'DEVICE', ...JAIPUR, accuracyM: 25, mockLocation: null });
    const before = Date.now();
    const result = await user.post('/capture/upload', captureForm(bytes, { manifest, source: 'WEB' }));
    assert.equal(result.status, 201);
    const asset = result.body.assets[0];
    assert.equal(asset.captureSource, 'WEB_LIVE_CAPTURE');
    assert.equal(asset.capturedAtSource, 'SERVER');
    assert.ok(Date.parse(asset.capturedAt) >= before - 1000);
    assert.equal(asset.locationSource, 'DEVICE');
    const mismatch = await user.post('/capture/upload', captureForm(Buffer.concat([bytes, Buffer.from('x')]), { manifest, source: 'WEB' }));
    assert.equal(mismatch.body.error.code, 'HASH_MISMATCH');
    assert.ok(cloud.uploads.length >= 1);
  });
});

describe('before/after comparability', () => {
  it('scores how fair a pair is from GPS distance and viewpoint', async () => {
    const user = await registerUser();
    const project = await user.post('/projects', projectInput());
    const projectId = project.body.project.id;
    const a = await user.post('/assets/upload', uploadForm(projectId, [camera('before', { dateTimeOriginal: '2026:01:10 10:00:00' })]));
    const b = await user.post('/assets/upload', uploadForm(projectId, [camera('after', { dateTimeOriginal: '2026:03:10 10:00:00', latitude: 26.92 })]));
    const comparison = await user.post('/comparisons', { projectId, beforeAssetId: a.body.assets[0].id, afterAssetId: b.body.assets[0].id });
    assert.equal(comparison.status, 201);
    const comparability = comparison.body.comparison.changes.comparability;
    assert.ok(comparability.score < 100);
    assert.ok(comparability.factors.some((f: any) => f.factor === 'location' && /apart/.test(f.note)));
  });
});
