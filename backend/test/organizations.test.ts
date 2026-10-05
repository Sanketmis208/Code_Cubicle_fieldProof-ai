import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  Client, cloud, orgWith, pngFile, prisma, projectInput, registerUser, resetDb, startServer, stopServer, uploadForm,
} from './support/harness.js';

before(startServer);
after(stopServer);
beforeEach(resetDb);

async function seedProject(client: Client, name = 'Plantation') {
  const project = await client.post('/projects', projectInput({ name }));
  assert.equal(project.status, 201, JSON.stringify(project.body));
  const upload = await client.post('/assets/upload', uploadForm(project.body.project.id, [pngFile('a.png'), pngFile('b.png')]));
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  return { projectId: project.body.project.id as string, assets: upload.body.assets as Array<{ id: string }> };
}

describe('sign-up creates or joins an organization', () => {
  it('gives a solo sign-up a personal workspace they own', async () => {
    const user = await registerUser('Meera');
    assert.equal(user.memberships.length, 1);
    const [membership] = user.memberships;
    assert.equal(membership.role, 'OWNER');
    assert.equal(membership.organization.personal, true);
    assert.equal(membership.organization.name, "Meera's workspace");
    assert.ok(membership.permissions.includes('org.members.manage'));
  });

  it('creates a named organization when one is given', async () => {
    const user = await registerUser('Meera', { organizationName: 'Green Roots Foundation' });
    assert.equal(user.memberships[0].organization.name, 'Green Roots Foundation');
    assert.equal(user.memberships[0].organization.personal, false);
  });

  it('joins the inviting organization with the invited role and no personal workspace', async () => {
    const { orgId, members } = await orgWith('Green Roots', ['FIELD_WORKER']);
    const worker = members.FIELD_WORKER;
    assert.equal(worker.memberships.length, 1);
    assert.equal(worker.memberships[0].organization.id, orgId);
    assert.equal(worker.memberships[0].role, 'FIELD_WORKER');
    assert.equal(worker.memberships[0].allProjects, false);
  });

  it('rejects an invalid invite code without creating the account', async () => {
    const client = new Client();
    const result = await client.post('/auth/register', {
      name: 'Nobody', email: 'nobody@example.test', password: 'Password123', inviteCode: 'ZZZZ-ZZZZ',
    });
    assert.equal(result.status, 404);
    assert.equal(result.body.error.code, 'INVITE_INVALID');
    assert.equal(await prisma.user.count({ where: { email: 'nobody@example.test' } }), 0);
  });
});

describe('active organization selection', () => {
  it('scopes lists to the organization in X-Organization-Id', async () => {
    const user = await registerUser('Multi');
    await seedProject(user, 'Personal project');
    const second = await user.post('/orgs', { name: 'Second NGO', type: 'NGO' });
    assert.equal(second.status, 201);
    user.orgId = second.body.organization.id;
    await user.post('/projects', projectInput({ name: 'NGO project' }));

    const inSecond = await user.get('/projects');
    assert.deepEqual(inSecond.body.projects.map((p: any) => p.name), ['NGO project']);
    user.orgId = user.memberships[0].organization.id;
    const inPersonal = await user.get('/projects');
    assert.deepEqual(inPersonal.body.projects.map((p: any) => p.name), ['Personal project']);
    assert.equal((await user.get('/assets')).body.assets.length, 2);
  });

  it('treats an org you do not belong to, or a malformed id, as not found', async () => {
    const a = await orgWith('Org A');
    const outsider = await registerUser('Outsider');
    outsider.orgId = a.orgId;
    const result = await outsider.get('/projects');
    assert.equal(result.status, 404);
    assert.equal(result.body.error.code, 'ORG_NOT_FOUND');
    outsider.orgId = "'; DROP TABLE \"User\"; --";
    assert.equal((await outsider.get('/projects')).status, 404);
  });

  it('asks a user with no organization to create or join one', async () => {
    const { orgId, members } = await orgWith('Org A', ['VIEWER']);
    const viewer = members.VIEWER;
    assert.equal((await viewer.del(`/orgs/${orgId}/members/${viewer.user.id}`)).status, 204);
    const result = await viewer.get('/projects');
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, 'NO_ORGANIZATION');
  });
});

describe('cross-organization isolation', () => {
  it('never lets one organization read or change another organization\'s data', async () => {
    const a = await orgWith('Org A');
    const { projectId, assets } = await seedProject(a.owner);
    const [first, second] = assets as [{ id: string }, { id: string }];
    const comparison = await a.owner.post('/comparisons', { projectId, beforeAssetId: first.id, afterAssetId: second.id });
    const report = await a.owner.post('/reports', { projectId, title: 'A report', reportType: 'IMPACT_SUMMARY' });
    const comparisonId = comparison.body.comparison.id;
    const reportId = report.body.report.id;

    const b = await orgWith('Org B');
    const { projectId: bProjectId, assets: bAssets } = await seedProject(b.owner, 'B project');
    const intruder = b.owner;
    const snapshot = async () => ({
      projects: await prisma.project.findMany({ orderBy: { id: 'asc' } }),
      assets: await prisma.asset.findMany({ orderBy: { id: 'asc' } }),
      comparisons: await prisma.comparison.count(),
      reports: await prisma.report.count(),
      members: await prisma.membership.count(),
      assignments: await prisma.projectMember.count(),
      invites: await prisma.invite.count(),
    });
    const before = await snapshot();
    const uploadsBefore = cloud.uploads.length;

    const attempts: Array<[string, () => Promise<{ status: number }>]> = [
      ['get project', () => intruder.get(`/projects/${projectId}`)],
      ['patch project', () => intruder.patch(`/projects/${projectId}`, { name: 'pwned' })],
      ['delete project', () => intruder.del(`/projects/${projectId}`)],
      ['project summary', () => intruder.post(`/projects/${projectId}/summary`)],
      ['project members', () => intruder.get(`/projects/${projectId}/members`)],
      ['assign self to project', () => intruder.post(`/projects/${projectId}/members`, { userId: intruder.user.id })],
      ['get asset', () => intruder.get(`/assets/${first.id}`)],
      ['analyze asset', () => intruder.post(`/assets/${first.id}/analyze`)],
      ['retry asset', () => intruder.post(`/assets/${first.id}/retry`)],
      ['favorite asset', () => intruder.patch(`/assets/${first.id}/favorite`, { favorite: true })],
      ['delete asset', () => intruder.del(`/assets/${first.id}`)],
      ['upload via body', () => intruder.post('/assets/upload', uploadForm(projectId, [pngFile()]))],
      ['upload via query', () => intruder.post(`/assets/upload?projectId=${projectId}`, uploadForm(projectId, [pngFile()]))],
      ['compare in A project', () => intruder.post('/comparisons', { projectId, beforeAssetId: first.id, afterAssetId: second.id })],
      ['delete comparison', () => intruder.del(`/comparisons/${comparisonId}`)],
      ['create report for A', () => intruder.post('/reports', { projectId, title: 'Stolen', reportType: 'IMPACT_SUMMARY' })],
      ['get report', () => intruder.get(`/reports/${reportId}`)],
      ['delete report', () => intruder.del(`/reports/${reportId}`)],
      ['get org', () => intruder.get(`/orgs/${a.orgId}`)],
      ['patch org', () => intruder.patch(`/orgs/${a.orgId}`, { name: 'pwned' })],
      ['org members', () => intruder.get(`/orgs/${a.orgId}/members`)],
      ['org invites', () => intruder.get(`/orgs/${a.orgId}/invites`)],
      ['create invite', () => intruder.post(`/orgs/${a.orgId}/invites`, { role: 'ADMIN' })],
      ['change A owner role', () => intruder.patch(`/orgs/${a.orgId}/members/${a.owner.user.id}`, { role: 'VIEWER' })],
      ['remove A owner', () => intruder.del(`/orgs/${a.orgId}/members/${a.owner.user.id}`)],
      ['audit log', () => intruder.get(`/orgs/${a.orgId}/audit`)],
    ];
    for (const [label, attempt] of attempts) {
      const result = await attempt();
      assert.equal(result.status, 404, `${label} should be 404, got ${result.status}`);
    }

    // Mixing another org's assets into your own project is refused too.
    const mixed = await intruder.post('/comparisons', { projectId: bProjectId, beforeAssetId: first.id, afterAssetId: bAssets[0]!.id });
    assert.equal(mixed.status, 422);

    // Lists, search and dashboard in B's context contain nothing from A.
    const projects = await intruder.get('/projects');
    assert.deepEqual(projects.body.projects.map((p: any) => p.id), [bProjectId]);
    assert.equal((await intruder.get(`/assets?projectId=${projectId}`)).body.assets.length, 0);
    const allAssets = await intruder.get('/assets');
    assert.ok(allAssets.body.assets.every((asset: any) => asset.projectId === bProjectId));
    const search = await intruder.post('/assets/search/interpret', { query: 'show plantation photos' });
    assert.ok(search.body.assets.every((asset: any) => asset.projectId === bProjectId));
    assert.equal((await intruder.get(`/comparisons?projectId=${projectId}`)).body.comparisons.length, 0);
    assert.equal((await intruder.get(`/reports?projectId=${projectId}`)).body.reports.length, 0);
    const dashboard = await intruder.get('/dashboard/summary');
    assert.equal(dashboard.body.projects, 1);
    assert.equal(dashboard.body.assets, 2);
    assert.equal(dashboard.body.comparisons, 0);

    // A's owner cannot pull an outsider into A's project either.
    const assignOutsider = await a.owner.post(`/projects/${projectId}/members`, { userId: intruder.user.id });
    assert.equal(assignOutsider.status, 422);

    assert.deepEqual(await snapshot(), before, 'no data in either org changed');
    assert.equal(cloud.uploads.length, uploadsBefore, 'nothing reached Cloudinary');
  });

  it('ignores organization and owner fields smuggled into a project body', async () => {
    const a = await orgWith('Org A');
    const b = await orgWith('Org B');
    const created = await b.owner.post('/projects', projectInput({ organizationId: a.orgId, ownerId: a.owner.user.id }));
    assert.equal(created.status, 201);
    const stored = await prisma.project.findUniqueOrThrow({ where: { id: created.body.project.id } });
    assert.equal(stored.organizationId, b.orgId);
    assert.equal(stored.ownerId, b.owner.user.id);
    await b.owner.patch(`/projects/${stored.id}`, { organizationId: a.orgId, ownerId: a.owner.user.id });
    const after = await prisma.project.findUniqueOrThrow({ where: { id: stored.id } });
    assert.equal(after.organizationId, b.orgId);
    assert.equal(after.ownerId, b.owner.user.id);
  });

  it('refuses an upload whose URL and form name different projects', async () => {
    const { owner } = await orgWith('Org A');
    const one = await owner.post('/projects', projectInput({ name: 'One' }));
    const two = await owner.post('/projects', projectInput({ name: 'Two' }));
    const result = await owner.post(`/assets/upload?projectId=${one.body.project.id}`, uploadForm(two.body.project.id, [pngFile()]));
    assert.equal(result.status, 422);
    assert.equal(cloud.uploads.length, 0);
  });

  it('keeps Cloudinary folders separate per organization', async () => {
    const a = await orgWith('Org A');
    await seedProject(a.owner);
    assert.ok(cloud.uploads.every((upload) => upload.folder?.startsWith(`fieldproof/${a.orgId}/`)));
  });
});

describe('roles inside one organization', () => {
  it('field worker: sees and uploads to assigned projects only, cannot curate or manage', async () => {
    const { owner, members } = await orgWith('Green Roots', ['FIELD_WORKER']);
    const worker = members.FIELD_WORKER;
    const assigned = await seedProject(owner, 'Assigned');
    const other = await seedProject(owner, 'Other');
    assert.equal((await owner.post(`/projects/${assigned.projectId}/members`, { userId: worker.user.id })).status, 201);

    const projects = await worker.get('/projects');
    assert.deepEqual(projects.body.projects.map((p: any) => p.name), ['Assigned']);
    assert.equal((await worker.get(`/projects/${other.projectId}`)).status, 404);
    assert.equal((await worker.get(`/assets/${other.assets[0]!.id}`)).status, 404);
    assert.equal((await worker.get('/dashboard/summary')).body.assets, 2);

    const upload = await worker.post('/assets/upload', uploadForm(assigned.projectId, [pngFile()]));
    assert.equal(upload.status, 201);
    assert.equal(upload.body.assets[0].uploadedById, worker.user.id);
    assert.equal((await worker.post('/assets/upload', uploadForm(other.projectId, [pngFile()]))).status, 404);
    assert.equal((await worker.post(`/assets/${upload.body.assets[0].id}/analyze`)).status, 200);

    const forbidden: Array<[string, () => Promise<{ status: number }>]> = [
      ['create project', () => worker.post('/projects', projectInput())],
      ['edit project', () => worker.patch(`/projects/${assigned.projectId}`, { name: 'Renamed by worker' })],
      ['delete asset', () => worker.del(`/assets/${assigned.assets[0]!.id}`)],
      ['favorite', () => worker.patch(`/assets/${assigned.assets[0]!.id}/favorite`, { favorite: true })],
      ['compare', () => worker.post('/comparisons', { projectId: assigned.projectId, beforeAssetId: assigned.assets[0]!.id, afterAssetId: assigned.assets[1]!.id })],
      ['report', () => worker.post('/reports', { projectId: assigned.projectId, title: 'Report', reportType: 'CUSTOM' })],
      ['summary', () => worker.post(`/projects/${assigned.projectId}/summary`)],
      ['members', () => worker.get(`/orgs/${worker.memberships[0].organization.id}/members`)],
      ['invite', () => worker.post(`/orgs/${worker.memberships[0].organization.id}/invites`, { role: 'VIEWER' })],
      ['audit', () => worker.get(`/orgs/${worker.memberships[0].organization.id}/audit`)],
      ['assign others', () => worker.post(`/projects/${assigned.projectId}/members`, { userId: owner.user.id })],
    ];
    for (const [label, attempt] of forbidden) {
      const result = await attempt();
      assert.equal(result.status, 403, `${label} should be 403, got ${result.status}`);
    }
  });

  it('verifier: reviews and compares, cannot upload or delete', async () => {
    const { owner, members } = await orgWith('Green Roots', ['VERIFIER']);
    const verifier = members.VERIFIER;
    const { projectId, assets } = await seedProject(owner);
    await owner.post(`/projects/${projectId}/members`, { userId: verifier.user.id });
    assert.equal((await verifier.post('/assets/upload', uploadForm(projectId, [pngFile()]))).status, 403);
    assert.equal((await verifier.patch(`/assets/${assets[0]!.id}/favorite`, { favorite: true })).status, 200);
    assert.equal((await verifier.post('/comparisons', { projectId, beforeAssetId: assets[0]!.id, afterAssetId: assets[1]!.id })).status, 201);
    assert.equal((await verifier.del(`/assets/${assets[0]!.id}`)).status, 403);
    const team = await verifier.get(`/projects/${projectId}/members`);
    assert.equal(team.status, 200);
    assert.ok([...team.body.assigned, ...team.body.orgWide].every((entry: any) => entry.user.email === undefined));
  });

  it('viewer: reads every project, changes nothing', async () => {
    const { owner, members } = await orgWith('Green Roots', ['VIEWER']);
    const viewer = members.VIEWER;
    const { projectId, assets } = await seedProject(owner);
    assert.equal((await viewer.get('/projects')).body.projects.length, 1);
    assert.equal((await viewer.get(`/assets/${assets[0]!.id}`)).status, 200);
    assert.equal((await viewer.post('/assets/upload', uploadForm(projectId, [pngFile()]))).status, 403);
    assert.equal((await viewer.patch(`/projects/${projectId}`, { name: 'Renamed by viewer' })).status, 403);
    assert.equal((await viewer.post(`/assets/${assets[0]!.id}/analyze`)).status, 403);
  });

  it('program manager: owns what they create, sees only assigned projects, cannot delete projects', async () => {
    const { owner, orgId, members } = await orgWith('Green Roots', ['PROGRAM_MANAGER', 'FIELD_WORKER']);
    const pm = members.PROGRAM_MANAGER;
    const ownerProject = await seedProject(owner, 'Owner project');
    const created = await pm.post('/projects', projectInput({ name: 'PM project' }));
    assert.equal(created.status, 201);
    const pmProjectId = created.body.project.id;
    assert.deepEqual((await pm.get('/projects')).body.projects.map((p: any) => p.name), ['PM project']);
    assert.equal((await pm.get(`/projects/${ownerProject.projectId}`)).status, 404);
    assert.equal((await pm.get(`/orgs/${orgId}/members`)).status, 200);
    assert.equal((await pm.post(`/projects/${pmProjectId}/members`, { userId: members.FIELD_WORKER.user.id })).status, 201);
    assert.equal((await members.FIELD_WORKER.get('/projects')).body.projects.length, 1);
    assert.equal((await pm.del(`/projects/${pmProjectId}`)).status, 403);
    assert.equal((await owner.del(`/projects/${pmProjectId}`)).status, 204);
  });

  it('applies a role change and a removal on the very next request', async () => {
    const { owner, orgId, members } = await orgWith('Green Roots', ['FIELD_WORKER']);
    const worker = members.FIELD_WORKER;
    await seedProject(owner, 'One');
    await seedProject(owner, 'Two');
    assert.equal((await worker.get('/projects')).body.projects.length, 0);
    assert.equal((await owner.patch(`/orgs/${orgId}/members/${worker.user.id}`, { role: 'VIEWER' })).status, 200);
    assert.equal((await worker.get('/projects')).body.projects.length, 2);
    assert.equal((await owner.del(`/orgs/${orgId}/members/${worker.user.id}`)).status, 204);
    assert.equal((await worker.get('/projects')).status, 403);
  });

  it('removing a member also removes their project assignments', async () => {
    const { owner, orgId, members } = await orgWith('Green Roots', ['FIELD_WORKER']);
    const { projectId } = await seedProject(owner);
    await owner.post(`/projects/${projectId}/members`, { userId: members.FIELD_WORKER.user.id });
    assert.equal(await prisma.projectMember.count(), 1);
    await owner.del(`/orgs/${orgId}/members/${members.FIELD_WORKER.user.id}`);
    assert.equal(await prisma.projectMember.count(), 0);
  });
});

describe('who may manage whom', () => {
  it('admins manage roles below admin only', async () => {
    const { owner, orgId, members } = await orgWith('Green Roots', ['ADMIN', 'FIELD_WORKER']);
    const admin = members.ADMIN;
    const worker = members.FIELD_WORKER.user.id;
    assert.equal((await admin.patch(`/orgs/${orgId}/members/${worker}`, { role: 'VERIFIER' })).status, 200);
    assert.equal((await admin.patch(`/orgs/${orgId}/members/${worker}`, { role: 'ADMIN' })).status, 403);
    assert.equal((await admin.patch(`/orgs/${orgId}/members/${owner.user.id}`, { role: 'VIEWER' })).status, 403);
    assert.equal((await admin.del(`/orgs/${orgId}/members/${owner.user.id}`)).status, 403);
    assert.equal((await admin.post(`/orgs/${orgId}/invites`, { role: 'ADMIN' })).status, 403);
    assert.equal((await admin.post(`/orgs/${orgId}/invites`, { role: 'PROGRAM_MANAGER' })).status, 201);
  });

  it('protects the last owner and blocks self role changes', async () => {
    const { owner, orgId, members } = await orgWith('Green Roots', ['ADMIN']);
    const self = await owner.patch(`/orgs/${orgId}/members/${owner.user.id}`, { role: 'ADMIN' });
    assert.equal(self.status, 409);
    assert.equal(self.body.error.code, 'SELF_ROLE_CHANGE');
    const leave = await owner.del(`/orgs/${orgId}/members/${owner.user.id}`);
    assert.equal(leave.status, 409);
    assert.equal(leave.body.error.code, 'LAST_OWNER');

    assert.equal((await owner.patch(`/orgs/${orgId}/members/${members.ADMIN.user.id}`, { role: 'OWNER' })).status, 200);
    assert.equal((await owner.del(`/orgs/${orgId}/members/${owner.user.id}`)).status, 204);
    assert.equal(await prisma.membership.count({ where: { organizationId: orgId, role: 'OWNER' } }), 1);
  });

  it('never ends with zero owners when two owners demote each other at once', async () => {
    const { owner, orgId, members } = await orgWith('Green Roots', ['ADMIN']);
    await owner.patch(`/orgs/${orgId}/members/${members.ADMIN.user.id}`, { role: 'OWNER' });
    const second = members.ADMIN;
    await Promise.all([
      owner.patch(`/orgs/${orgId}/members/${second.user.id}`, { role: 'ADMIN' }),
      second.patch(`/orgs/${orgId}/members/${owner.user.id}`, { role: 'ADMIN' }),
    ]);
    assert.ok((await prisma.membership.count({ where: { organizationId: orgId, role: 'OWNER' } })) >= 1);
  });
});

describe('invites', () => {
  it('returns the code once and stores only its hash', async () => {
    const { owner, orgId } = await orgWith('Green Roots');
    const invite = await owner.post(`/orgs/${orgId}/invites`, { role: 'FIELD_WORKER' });
    assert.match(invite.body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const stored = await prisma.invite.findFirstOrThrow();
    assert.notEqual(stored.codeHash, invite.body.code);
    assert.equal(JSON.stringify(stored).includes(invite.body.code), false);
    const list = await owner.get(`/orgs/${orgId}/invites`);
    assert.equal(JSON.stringify(list.body).includes(invite.body.code), false);
    assert.equal(list.body.invites[0].status, 'ACTIVE');
  });

  it('accepts codes typed in lowercase without the dash', async () => {
    const { owner, orgId } = await orgWith('Green Roots');
    const invite = await owner.post(`/orgs/${orgId}/invites`, { role: 'VIEWER' });
    const user = await registerUser('Typist');
    const joined = await user.post('/orgs/join', { code: invite.body.code.replace('-', '').toLowerCase() });
    assert.equal(joined.status, 201);
    assert.equal(joined.body.role, 'VIEWER');
  });

  it('enforces single use, expiry, revocation, email binding and duplicate membership', async () => {
    const { owner, orgId } = await orgWith('Green Roots');
    const single = await owner.post(`/orgs/${orgId}/invites`, { role: 'VIEWER' });
    const first = await registerUser('First');
    const second = await registerUser('Second');
    assert.equal((await first.post('/orgs/join', { code: single.body.code })).status, 201);
    assert.equal((await first.post('/orgs/join', { code: single.body.code })).status, 410);
    const used = await second.post('/orgs/join', { code: single.body.code });
    assert.equal(used.body.error.code, 'INVITE_USED');

    const multi = await owner.post(`/orgs/${orgId}/invites`, { role: 'VIEWER', maxUses: 3 });
    const already = await first.post('/orgs/join', { code: multi.body.code });
    assert.equal(already.status, 409);
    assert.equal(already.body.error.code, 'ALREADY_MEMBER');

    const expiring = await owner.post(`/orgs/${orgId}/invites`, { role: 'VIEWER' });
    await prisma.invite.update({ where: { id: expiring.body.invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await second.post('/orgs/join', { code: expiring.body.code })).body.error.code, 'INVITE_EXPIRED');

    const revoked = await owner.post(`/orgs/${orgId}/invites`, { role: 'VIEWER' });
    assert.equal((await owner.del(`/orgs/${orgId}/invites/${revoked.body.invite.id}`)).status, 204);
    assert.equal((await second.post('/orgs/join', { code: revoked.body.code })).body.error.code, 'INVITE_INVALID');

    const bound = await owner.post(`/orgs/${orgId}/invites`, { role: 'VIEWER', email: 'someone.else@example.test' });
    assert.equal((await second.post('/orgs/join', { code: bound.body.code })).body.error.code, 'INVITE_EMAIL_MISMATCH');
  });

  it('lets exactly one person take the last use of a code under a race', async () => {
    const { owner, orgId } = await orgWith('Green Roots');
    const invite = await owner.post(`/orgs/${orgId}/invites`, { role: 'VIEWER' });
    const racers = await Promise.all([1, 2, 3, 4].map((n) => registerUser(`Racer ${n}`)));
    const results = await Promise.all(racers.map((racer) => racer.post('/orgs/join', { code: invite.body.code })));
    assert.equal(results.filter((result) => result.status === 201).length, 1);
    assert.equal(await prisma.membership.count({ where: { organizationId: orgId } }), 2);
  });

  it('refuses owner invites', async () => {
    const { owner, orgId } = await orgWith('Green Roots');
    assert.equal((await owner.post(`/orgs/${orgId}/invites`, { role: 'OWNER' })).status, 422);
  });
});

describe('audit log', () => {
  it('records actions in a verifiable chain and detects tampering', async () => {
    const { owner, orgId } = await orgWith('Green Roots', ['FIELD_WORKER']);
    await seedProject(owner);
    const log = await owner.get(`/orgs/${orgId}/audit`);
    assert.equal(log.status, 200);
    const actions = log.body.entries.map((entry: any) => entry.action);
    for (const action of ['org.created', 'invite.created', 'member.joined', 'project.created', 'evidence.uploaded'])
      assert.ok(actions.includes(action), `missing ${action}`);
    assert.equal(log.body.integrity.valid, true);

    const victim = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: orgId, action: 'member.joined' } });
    await prisma.auditLog.update({ where: { id: victim.id }, data: { metadata: { role: 'OWNER' } } });
    const tampered = await owner.get(`/orgs/${orgId}/audit`);
    assert.equal(tampered.body.integrity.valid, false);
    assert.equal(tampered.body.integrity.brokenAt, victim.seq);
  });
});
