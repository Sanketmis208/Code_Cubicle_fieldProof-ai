import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { addMember, ai, cloud, pngFile, prisma, projectInput, registerUser, resetDb, startServer, stopServer, uploadForm } from './support/harness.js';
import { jpegFile, jpegWithExif } from './support/jpeg.js';
import { refreshCluster } from '../src/trust/service.js';

before(startServer);
after(stopServer);
beforeEach(resetDb);

const JAIPUR = { latitude: 26.9124, longitude: 75.7873 };
const camera = (seed: string, extra: Record<string, unknown> = {}) =>
  jpegFile(`${seed}.jpg`, { make: 'Xiaomi', model: 'Redmi Note 12', dateTimeOriginal: '2026:02:10 10:30:00', offset: '+05:30', ...JAIPUR, seed, ...extra });

async function project(client: Awaited<ReturnType<typeof registerUser>>, name = 'Plantation', site = true) {
  const created = await client.post('/projects', projectInput({ name }));
  const projectId = created.body.project.id as string;
  if (site) assert.equal((await client.post(`/projects/${projectId}/sites`, { name: 'Plot B', ...JAIPUR, radiusM: 300 })).status, 201);
  return projectId;
}

const checksOf = async (assetId: string) => (await prisma.trustCheck.findMany({ where: { assetId } })).map((c) => c.check);

describe('provenance at upload', () => {
  it('reads EXIF time and GPS from the original bytes and rates the photo', async () => {
    const user = await registerUser();
    const projectId = await project(user);
    cloud.nextResponse.push({ phash: 'A1B2C3D4E5F60718', quality_analysis: { focus: 0.82 }, faces: [[1, 2, 3, 4]] });
    const upload = await user.post('/assets/upload', uploadForm(projectId, [camera('one')]));
    assert.equal(upload.status, 201);
    const [asset] = upload.body.assets;
    assert.equal(asset.captureSource, 'WEB_UPLOAD');
    assert.equal(asset.capturedAt, '2026-02-10T05:00:00.000Z');
    assert.equal(asset.capturedAtSource, 'EXIF');
    assert.ok(Math.abs(asset.latitude - JAIPUR.latitude) < 1e-4);
    assert.equal(asset.phash, 'a1b2c3d4e5f60718');
    assert.equal(asset.qualityScore, 0.82);
    assert.equal(asset.faceCount, 1);
    assert.match(asset.sha256, /^[0-9a-f]{64}$/);
    assert.equal(asset.trustStatus, 'STRONG');
    assert.equal(asset.site.name, 'Plot B');
    assert.ok(cloud.options[0]?.phash && cloud.options[0]?.quality_analysis && cloud.options[0]?.faces);

    const detail = await user.get(`/assets/${asset.id}`);
    assert.ok(detail.body.asset.trustChecks.some((c: any) => c.check === 'LOCATION' && c.result === 'PASS'));
  });

  it('still uploads when the Cloudinary plan refuses quality analysis', async () => {
    const user = await registerUser();
    const projectId = await project(user, 'Plan check', false);
    cloud.rejectQualityAnalysis = true;
    const upload = await user.post('/assets/upload', uploadForm(projectId, [camera('q')]));
    assert.equal(upload.status, 201);
    const stored = await prisma.asset.findFirstOrThrow();
    assert.deepEqual((stored.cloudinaryAnalysis as any).requested, ['phash', 'faces']);
  });
});

describe('duplicates and reuse', () => {
  it('skips a byte-identical re-upload to the same project and says so', async () => {
    const user = await registerUser();
    const projectId = await project(user);
    const bytes = jpegWithExif({ make: 'Xiaomi', model: 'X', seed: 'same' });
    const first = await user.post('/assets/upload', uploadForm(projectId, [new File([bytes], 'a.jpg', { type: 'image/jpeg' })]));
    const again = await user.post('/assets/upload', uploadForm(projectId, [new File([bytes], 'copy.jpg', { type: 'image/jpeg' }), new File([bytes], 'copy2.jpg', { type: 'image/jpeg' })]));
    assert.equal(again.status, 200);
    assert.equal(again.body.assets.length, 0);
    assert.deepEqual(again.body.skipped.map((s: any) => s.reason), ['ALREADY_UPLOADED', 'DUPLICATE_IN_BATCH']);
    assert.equal(again.body.skipped[0].existingAssetId, first.body.assets[0].id);
    assert.equal(await prisma.asset.count(), 1);
    assert.equal(cloud.uploads.length, 1, 'duplicates never reach Cloudinary');
  });

  it('flags the same file submitted again under another project', async () => {
    const user = await registerUser();
    const first = await project(user, 'Last year');
    const second = await project(user, 'This year');
    const bytes = jpegWithExif({ make: 'Xiaomi', model: 'X', seed: 'reused' });
    const original = await user.post('/assets/upload', uploadForm(first, [new File([bytes], 'a.jpg', { type: 'image/jpeg' })]));
    const reused = await user.post('/assets/upload', uploadForm(second, [new File([bytes], 'b.jpg', { type: 'image/jpeg' })]));
    assert.equal(reused.status, 201);
    const asset = reused.body.assets[0];
    assert.equal(asset.trustStatus, 'NEEDS_SECOND_LOOK');
    const reuse = await prisma.trustCheck.findFirstOrThrow({ where: { assetId: asset.id, check: 'EXACT_REUSE' } });
    assert.equal(reuse.relatedAssetId, original.body.assets[0].id);
    assert.match(reuse.message, /Last year/);
    assert.equal((await prisma.trustCheck.count({ where: { assetId: original.body.assets[0].id, check: 'EXACT_REUSE' } })), 0, 'the original is not blamed');
  });

  it('flags a visually identical photo from an earlier event as possible reuse', async () => {
    const user = await registerUser();
    const projectId = await project(user);
    cloud.nextResponse.push({ phash: 'ffffffffffff0000' });
    const old = await user.post('/assets/upload', uploadForm(projectId, [pngFile('old.png')]));
    // Age the original and its event, as if it had been uploaded 40 days ago.
    const aged = await prisma.asset.update({ where: { id: old.body.assets[0].id }, data: { createdAt: new Date(Date.now() - 40 * 86_400_000) } });
    await refreshCluster(aged.eventClusterId!);
    cloud.nextResponse.push({ phash: 'ffffffffffff0001' });
    const fresh = await user.post('/assets/upload', uploadForm(projectId, [pngFile('new.png')]));
    const near = await prisma.trustCheck.findFirstOrThrow({ where: { assetId: fresh.body.assets[0].id, check: 'NEAR_DUPLICATE' } });
    assert.equal(near.relatedAssetId, old.body.assets[0].id);
    assert.equal(near.weight, -40);
  });

  it('never compares evidence across organizations', async () => {
    const a = await registerUser('Org A user');
    const b = await registerUser('Org B user');
    const bytes = jpegWithExif({ make: 'X', model: 'Y', seed: 'shared' });
    await a.post('/assets/upload', uploadForm(await project(a), [new File([bytes], 'a.jpg', { type: 'image/jpeg' })]));
    const other = await b.post('/assets/upload', uploadForm(await project(b), [new File([bytes], 'b.jpg', { type: 'image/jpeg' })]));
    assert.equal(other.status, 201);
    assert.deepEqual((await checksOf(other.body.assets[0].id)).filter((c) => c.includes('REUSE') || c.includes('DUPLICATE')), []);
  });
});

describe('event clusters', () => {
  it('groups a burst into one event with up to three best shots', async () => {
    const user = await registerUser();
    const projectId = await project(user);
    const files = Array.from({ length: 12 }, (_, i) => camera(`burst-${i}`, { dateTimeOriginal: `2026:02:10 10:${String(30 + (i % 10)).padStart(2, '0')}:00` }));
    for (let i = 0; i < 12; i += 1) cloud.nextResponse.push({ quality_analysis: { focus: i / 12 }, phash: `ffffffffffff${String(i).padStart(4, '0')}` });
    const upload = await user.post('/assets/upload', uploadForm(projectId, files.slice(0, 10)));
    const upload2 = await user.post('/assets/upload', uploadForm(projectId, files.slice(10)));
    assert.equal(upload.status, 201);
    assert.equal(upload2.status, 201);
    const clusters = await prisma.eventCluster.findMany();
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0]!.assetCount, 12);
    const best = clusters[0]!.representativeIds as string[];
    assert.equal(best.length, 3);
    const bestAssets = await prisma.asset.findMany({ where: { id: { in: best } } });
    assert.ok(bestAssets.every((asset) => (asset.qualityScore ?? 0) >= 9 / 12), 'the sharpest shots represent the event');
    const reuseFlags = await prisma.trustCheck.count({ where: { check: { in: ['NEAR_DUPLICATE', 'EXACT_REUSE'] } } });
    assert.equal(reuseFlags, 0, 'a burst is not reuse');
  });

  it('splits events by time and place, and shrinks an event when evidence is deleted', async () => {
    const user = await registerUser();
    const projectId = await project(user);
    await user.post('/assets/upload', uploadForm(projectId, [camera('m1'), camera('m2', { dateTimeOriginal: '2026:02:10 10:35:00' })]));
    await user.post('/assets/upload', uploadForm(projectId, [camera('afternoon', { dateTimeOriginal: '2026:02:10 15:00:00' })]));
    await user.post('/assets/upload', uploadForm(projectId, [camera('far', { latitude: 27.2, longitude: 75.7873 })]));
    assert.equal(await prisma.eventCluster.count(), 3);
    const morning = await prisma.eventCluster.findFirstOrThrow({ where: { assetCount: 2 } });
    const member = await prisma.asset.findFirstOrThrow({ where: { eventClusterId: morning.id } });
    assert.equal((await user.del(`/assets/${member.id}`)).status, 204);
    assert.equal((await prisma.eventCluster.findUniqueOrThrow({ where: { id: morning.id } })).assetCount, 1);
  });
});

describe('sites and project dates', () => {
  it('re-checks existing evidence when a site is added', async () => {
    const user = await registerUser();
    const projectId = await project(user, 'No sites yet', false);
    const upload = await user.post('/assets/upload', uploadForm(projectId, [camera('later-site', { latitude: 26.95 })]));
    const id = upload.body.assets[0].id;
    assert.equal((await prisma.trustCheck.findFirstOrThrow({ where: { assetId: id, check: 'LOCATION' } })).result, 'INFO');
    await user.post(`/projects/${projectId}/sites`, { name: 'Plot B', ...JAIPUR, radiusM: 300 });
    const location = await prisma.trustCheck.findFirstOrThrow({ where: { assetId: id, check: 'LOCATION' } });
    assert.equal(location.result, 'WARN');
    assert.match(location.message, /km outside/);
  });

  it('only lets project editors manage sites', async () => {
    const owner = await registerUser('Owner', { organizationName: 'Green Roots' });
    const orgId = owner.memberships[0].organization.id;
    const viewer = await addMember(owner, orgId, 'VIEWER', 'Viewer');
    const projectId = await project(owner, 'Sites', false);
    assert.equal((await viewer.post(`/projects/${projectId}/sites`, { name: 'Nope', ...JAIPUR })).status, 403);
    assert.equal((await viewer.get(`/projects/${projectId}/sites`)).status, 200);
  });
});

describe('analysis feeds trust', () => {
  it('sends the AI a JPEG rendition and applies recapture signals', async () => {
    const user = await registerUser();
    const projectId = await project(user);
    const upload = await user.post('/assets/upload', uploadForm(projectId, [camera('screen')]));
    const id = upload.body.assets[0].id;
    ai.nextAuthenticity = {
      recaptureLikelihood: 'high', syntheticLikelihood: 'low',
      burnedInStamp: { present: false, text: null, latitude: null, longitude: null, capturedAt: null }, notes: ['moire pattern'],
    };
    assert.equal((await user.post(`/assets/${id}/analyze`)).status, 200);
    assert.match(ai.imageUrls[0]!, /f_jpg/);
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id } });
    assert.equal(asset.trustStatus, 'NEEDS_SECOND_LOOK');
    assert.ok((await checksOf(id)).includes('RECAPTURE'));
  });

  it('fills time and place from a GPS camera stamp when a forward has no EXIF', async () => {
    const user = await registerUser();
    const projectId = await project(user);
    const upload = await user.post('/assets/upload', uploadForm(projectId, [pngFile('IMG-20260210-WA0007.png')]));
    const id = upload.body.assets[0].id;
    assert.equal(upload.body.assets[0].capturedAt, null);
    ai.nextAuthenticity = {
      recaptureLikelihood: 'low', syntheticLikelihood: 'low',
      burnedInStamp: { present: true, text: 'Plot B 26.9124N 75.7873E 10/02/2026 10:30', latitude: 26.9124, longitude: 75.7873, capturedAt: '2026-02-10 10:30' },
      notes: [],
    };
    await user.post(`/assets/${id}/analyze`);
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id } });
    assert.equal(asset.capturedAtSource, 'STAMP');
    assert.equal(asset.capturedAt?.toISOString(), '2026-02-10T05:00:00.000Z');
    assert.equal(asset.locationSource, 'STAMP');
    const checks = await prisma.trustCheck.findMany({ where: { assetId: id } });
    assert.equal(checks.find((c) => c.check === 'LOCATION')?.result, 'PASS');
    assert.match(checks.find((c) => c.check === 'STAMP')!.message, /declared/);
  });

  it('keeps the description when the authenticity block is malformed', async () => {
    const user = await registerUser();
    const projectId = await project(user);
    const upload = await user.post('/assets/upload', uploadForm(projectId, [camera('odd')]));
    ai.nextAuthenticity = { recaptureLikelihood: 'certainly', syntheticLikelihood: 42 };
    const { assetAnalysisSchema } = await import('../src/ai/ai.schemas.js');
    const { fakeAnalysis } = await import('./support/harness.js');
    const parsed = assetAnalysisSchema.parse({ ...fakeAnalysis, authenticity: ai.nextAuthenticity });
    assert.equal(parsed.authenticity, undefined);
    assert.equal(parsed.summary, fakeAnalysis.summary);
    void upload;
  });
});
