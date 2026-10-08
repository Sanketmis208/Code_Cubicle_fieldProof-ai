import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { orgWith, projectInput, registerUser, resetDb, startServer, stopServer, uploadForm } from './support/harness.js';
import { jpegFile } from './support/jpeg.js';

before(startServer);
after(stopServer);
beforeEach(resetDb);

const JAIPUR = { latitude: 26.9124, longitude: 75.7873 };

describe('targets and tallies ("how many?")', () => {
  it('tracks recorded vs confirmed counts, links batches to sites and events, and blocks self-confirmation', async () => {
    const { owner, members } = await orgWith('Green Roots', ['FIELD_WORKER', 'VERIFIER']);
    const project = await owner.post('/projects', projectInput());
    const projectId = project.body.project.id;
    const site = await owner.post(`/projects/${projectId}/sites`, { name: 'Plot B', ...JAIPUR, radiusM: 300 });
    for (const role of ['FIELD_WORKER', 'VERIFIER'] as const) await owner.post(`/projects/${projectId}/members`, { userId: members[role].user.id });

    const target = await owner.post(`/projects/${projectId}/targets`, { label: 'Saplings planted', unit: 'saplings', targetCount: 500 });
    assert.equal(target.status, 201);
    assert.equal(target.body.target.progress.recorded, 0);
    const targetId = target.body.target.id;
    assert.equal((await members.FIELD_WORKER.post(`/projects/${projectId}/targets`, { label: 'Trees planted', unit: 'trees', targetCount: 10 })).status, 403, 'field workers do not set targets');

    const upload = await members.FIELD_WORKER.post('/assets/upload', uploadForm(projectId, [jpegFile('batch.jpg', { make: 'Xiaomi', model: 'R', dateTimeOriginal: '2026:02:10 10:30:00', offset: '+05:30', ...JAIPUR })]));
    const eventClusterId = upload.body.assets[0].eventClusterId;
    const tally = await members.FIELD_WORKER.post(`/targets/${targetId}/tallies`, { count: 120, siteId: site.body.site.id, eventClusterId, note: 'Morning batch, canal road' });
    assert.equal(tally.status, 201);
    assert.equal(tally.body.target.progress.recorded, 120);
    assert.equal(tally.body.target.progress.confirmed, 0);
    assert.equal(tally.body.target.progress.withEvidence, 120);
    assert.equal(tally.body.target.progress.recordedPercent, 24);

    const self = await members.FIELD_WORKER.post(`/targets/tallies/${tally.body.tally.id}/review`, { decision: 'APPROVED' });
    assert.equal(self.status, 403);
    const confirmed = await members.VERIFIER.post(`/targets/tallies/${tally.body.tally.id}/review`, { decision: 'APPROVED' });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.target.progress.confirmed, 120);

    const second = await members.FIELD_WORKER.post(`/targets/${targetId}/tallies`, { count: 80 });
    await members.VERIFIER.post(`/targets/tallies/${second.body.tally.id}/review`, { decision: 'REJECTED' });
    const list = await owner.get(`/projects/${projectId}/targets`);
    assert.equal(list.body.targets[0].progress.recorded, 120, 'rejected batches do not count');
    assert.equal(list.body.targets[0].progress.batches, 2);
  });

  it('keeps targets inside their organization and project', async () => {
    const a = await orgWith('Org A');
    const b = await orgWith('Org B');
    const projectA = (await a.owner.post('/projects', projectInput())).body.project.id;
    const projectB = (await b.owner.post('/projects', projectInput({ name: 'B project' }))).body.project.id;
    const siteB = await b.owner.post(`/projects/${projectB}/sites`, { name: 'Elsewhere', ...JAIPUR });
    const target = await a.owner.post(`/projects/${projectA}/targets`, { label: 'Toilets built', unit: 'toilets', targetCount: 40 });
    assert.equal((await b.owner.get(`/projects/${projectA}/targets`)).status, 404);
    assert.equal((await b.owner.post(`/targets/${target.body.target.id}/tallies`, { count: 5 })).status, 404);
    assert.equal((await a.owner.post(`/targets/${target.body.target.id}/tallies`, { count: 5, siteId: siteB.body.site.id })).status, 422, 'a site from another project is refused');
  });
});

describe('assistant', () => {
  it('answers from the organization\'s own numbers', async () => {
    const user = await registerUser('Asker');
    const project = await user.post('/projects', projectInput());
    await user.post('/assets/upload', uploadForm(project.body.project.id, [jpegFile('one.jpg', { seed: 'a' })]));
    const reply = await user.post('/assistant/chat', { messages: [{ role: 'user', content: 'How many photos are waiting for review?' }] });
    assert.equal(reply.status, 200);
    assert.match(reply.body.reply, /1 item\(s\) await review/);
    assert.equal((await user.post('/assistant/chat', { messages: [] })).status, 422);
  });
});
