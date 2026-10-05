import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { cloud, pngFile, prisma, projectInput, registerUser, resetDb, startServer, stopServer, uploadForm } from './support/harness.js';

// Regression coverage for the flows that existed before organizations: these
// must keep behaving exactly as they did.
before(startServer);
after(stopServer);
beforeEach(resetDb);

describe('auth', () => {
  it('registers, reads the session, and logs out', async () => {
    const user = await registerUser('Asha');
    const me = await user.get('/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.name, 'Asha');
    assert.equal(me.body.user.passwordHash, undefined);
    assert.equal((await user.post('/auth/logout')).status, 204);
    assert.equal((await user.get('/auth/me')).status, 401);
  });

  it('logout succeeds even without a valid session', async () => {
    const user = await registerUser();
    user.cookie = 'fieldproof_token=expired.or.garbage';
    const result = await user.post('/auth/logout');
    assert.equal(result.status, 204);
    assert.equal(user.cookie, '');
  });

  it('rejects a wrong password with a generic message', async () => {
    const user = await registerUser();
    const result = await user.post('/auth/login', { email: user.user.email, password: 'WrongPass123' });
    assert.equal(result.status, 401);
    assert.equal(result.body.error.message, 'Invalid email or password');
  });
});

describe('projects', () => {
  it('PATCH with only a name keeps the existing status', async () => {
    const user = await registerUser();
    const created = await user.post('/projects', projectInput({ status: 'ACTIVE' }));
    assert.equal(created.status, 201);
    const patched = await user.patch(`/projects/${created.body.project.id}`, { name: 'Renamed drive' });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.project.name, 'Renamed drive');
    assert.equal(patched.body.project.status, 'ACTIVE');
  });

  it('defaults status to PLANNING on create', async () => {
    const user = await registerUser();
    const { status, ...input } = projectInput();
    void status;
    const created = await user.post('/projects', input);
    assert.equal(created.body.project.status, 'PLANNING');
  });

  it('rejects an end date before the start date on PATCH', async () => {
    const user = await registerUser();
    const created = await user.post('/projects', projectInput({ startDate: '2026-03-01' }));
    const patched = await user.patch(`/projects/${created.body.project.id}`, { endDate: '2026-02-01' });
    assert.equal(patched.status, 422);
  });

  it('deletes a project with assets and comparisons, then cleans up media', async () => {
    const user = await registerUser();
    const { body } = await user.post('/projects', projectInput());
    const projectId = body.project.id;
    const upload = await user.post('/assets/upload', uploadForm(projectId, [pngFile('a.png'), pngFile('b.png')]));
    assert.equal(upload.status, 201);
    const [first, second] = upload.body.assets;
    const comparison = await user.post('/comparisons', { projectId, beforeAssetId: first.id, afterAssetId: second.id });
    assert.equal(comparison.status, 201);

    assert.equal((await user.del(`/projects/${projectId}`)).status, 204);
    assert.equal(await prisma.asset.count(), 0);
    assert.equal(await prisma.comparison.count(), 0);
    assert.deepEqual(cloud.deleted.sort(), [first.cloudinaryPublicId, second.cloudinaryPublicId].sort());
  });
});

describe('assets', () => {
  it('applies date range and keyword search together', async () => {
    const user = await registerUser();
    const { body } = await user.post('/projects', projectInput());
    const upload = await user.post('/assets/upload', uploadForm(body.project.id, [pngFile('well-old.png'), pngFile('well-new.png'), pngFile('school.png')]));
    const [oldWell] = upload.body.assets;
    await prisma.asset.update({ where: { id: oldWell.id }, data: { capturedAt: new Date('2025-06-01') } });

    const result = await user.get('/assets?search=well&from=2026-01-01');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.assets.map((a: any) => a.originalFilename), ['well-new.png']);
  });

  it('rejects a file whose bytes do not match its declared type', async () => {
    const user = await registerUser();
    const { body } = await user.post('/projects', projectInput());
    const fake = new File([Buffer.from('not really a png')], 'fake.png', { type: 'image/png' });
    const result = await user.post('/assets/upload', uploadForm(body.project.id, [fake]));
    assert.equal(result.status, 415);
    assert.equal(cloud.uploads.length, 0);
  });

  it('analyzes an asset and caches the result', async () => {
    const user = await registerUser();
    const { body } = await user.post('/projects', projectInput());
    const upload = await user.post('/assets/upload', uploadForm(body.project.id, [pngFile()]));
    const id = upload.body.assets[0].id;
    const first = await user.post(`/assets/${id}/analyze`);
    assert.equal(first.status, 200);
    assert.equal(first.body.cached, false);
    const second = await user.post(`/assets/${id}/analyze`);
    assert.equal(second.body.cached, true);
  });

  it('reclaims an analysis stuck in PROCESSING after a crash', async () => {
    const user = await registerUser();
    const { body } = await user.post('/projects', projectInput());
    const upload = await user.post('/assets/upload', uploadForm(body.project.id, [pngFile()]));
    const id = upload.body.assets[0].id;
    await prisma.asset.update({ where: { id }, data: { aiStatus: 'PROCESSING', analysisStartedAt: new Date() } });
    assert.equal((await user.post(`/assets/${id}/analyze`)).status, 409);
    await prisma.asset.update({ where: { id }, data: { analysisStartedAt: new Date(Date.now() - 10 * 60 * 1000) } });
    const recovered = await user.post(`/assets/${id}/analyze`);
    assert.equal(recovered.status, 200);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id } })).aiStatus, 'COMPLETED');
  });
});

describe('comparisons and reports', () => {
  it('generates a report that references its evidence and guards deletion', async () => {
    const user = await registerUser();
    const { body } = await user.post('/projects', projectInput());
    const projectId = body.project.id;
    const upload = await user.post('/assets/upload', uploadForm(projectId, [pngFile('a.png'), pngFile('b.png')]));
    const [a, b] = upload.body.assets;
    const comparison = await user.post('/comparisons', { projectId, beforeAssetId: a.id, afterAssetId: b.id });
    const report = await user.post('/reports', { projectId, title: 'Quarterly update', reportType: 'PROJECT_UPDATE' });
    assert.equal(report.status, 201);
    assert.deepEqual(report.body.report.content.evidenceIds.sort(), [a.id, b.id].sort());

    assert.equal((await user.del(`/assets/${a.id}`)).status, 409);
    assert.equal((await user.del(`/comparisons/${comparison.body.comparison.id}`)).status, 409);
    assert.equal((await user.del(`/reports/${report.body.report.id}`)).status, 204);
    assert.equal((await user.del(`/comparisons/${comparison.body.comparison.id}`)).status, 204);
    assert.equal((await user.del(`/assets/${a.id}`)).status, 204);
  });
});
