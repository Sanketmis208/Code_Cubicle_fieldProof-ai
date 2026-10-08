import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  Client, cloud, orgWith, outbox, pngFile, prisma, projectInput, registerUser, resetDb, setupLinkFor, startServer, stopServer, uploadForm,
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

  it('a member added by email gets a one-time link, chooses a password and lands in that organization only', async () => {
    const { orgId, members } = await orgWith('Green Roots', ['FIELD_WORKER']);
    const worker = members.FIELD_WORKER;
    assert.equal(worker.memberships.length, 1);
    assert.equal(worker.memberships[0].organization.id, orgId);
    assert.equal(worker.memberships[0].role, 'FIELD_WORKER');
    assert.equal(worker.memberships[0].allProjects, false);
    const mail = outbox.find((m) => m.to === worker.user.email)!;
    assert.match(mail.subject, /added you to Green Roots/);
    assert.ok(!mail.text.includes('Password123'), 'passwords are never emailed');
  });
});

describe('account setup links', () => {
  it('previews who the link is for, works once, and rejects reuse, expiry and garbage', async () => {
    const { owner, orgId } = await orgWith('Green Roots');
    const added = await owner.post(`/orgs/${orgId}/members`, { name: 'Sunita Devi', email: 'sunita@example.test', role: 'FIELD_WORKER' });
    assert.equal(added.status, 201);
    assert.equal(added.body.emailSent, false, 'no SMTP in tests');
    assert.match(added.body.setupLink, /\/setup\//, 'admin is handed the link when mail is off');
    assert.equal(added.body.member.pendingSetup, true);
    const { token } = setupLinkFor('sunita@example.test');
    const anonymous = new Client();
    const preview = await anonymous.get(`/auth/setup/${token}`);
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.body.setup, { name: 'Sunita Devi', email: 'sunita@example.test', organization: 'Green Roots', role: 'FIELD_WORKER' });
    assert.equal((await anonymous.post(`/auth/setup/${token}`, { password: 'short' })).status, 422);
    const done = await anonymous.post(`/auth/setup/${token}`, { password: 'Strong-Pass1' });
    assert.equal(done.status, 200);
    assert.equal(done.body.memberships[0].organization.id, orgId);
    assert.equal((await anonymous.get('/auth/me')).status, 200, 'setup also signs in');
    assert.equal((await new Client().post(`/auth/setup/${token}`, { password: 'Strong-Pass1' })).body.error.code, 'SETUP_USED');
    assert.equal((await new Client().get('/auth/setup/not-a-real-token-value-here')).status, 404);
    const members = await owner.get(`/orgs/${orgId}/members`);
    assert.equal(members.body.members.find((m: any) => m.user.email === 'sunita@example.test').pendingSetup, false);
    const login = await new Client().post('/auth/login', { email: 'sunita@example.test', password: 'Strong-Pass1' });
    assert.equal(login.status, 200);
  });

  it('nobody can sign in to a provisioned account before the password is chosen', async () => {
    const { owner, orgId } = await orgWith('Green Roots');
    await owner.post(`/orgs/${orgId}/members`, { name: 'Pending Person', email: 'pending@example.test', role: 'VIEWER' });
    for (const guess of ['Password123', 'pending@example.test', 'Pending Person'])
      assert.equal((await new Client().post('/auth/login', { email: 'pending@example.test', password: guess })).status, 401);
  });

  it('resends a setup link only while the password is unset, and expired links are refused', async () => {
    const { owner, orgId, members } = await orgWith('Green Roots', ['VERIFIER']);
    const added = await owner.post(`/orgs/${orgId}/members`, { name: 'Late Joiner', email: 'late@example.test', role: 'VIEWER' });
    const userId = added.body.member.user.id;
    await prisma.accountSetup.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const first = setupLinkFor('late@example.test').token;
    assert.equal((await new Client().get(`/auth/setup/${first}`)).body.error.code, 'SETUP_INVALID');
    const resent = await owner.post(`/orgs/${orgId}/members/${userId}/resend-setup`);
    assert.equal(resent.status, 200);
    const second = setupLinkFor('late@example.test').token;
    assert.notEqual(first, second);
    assert.equal((await new Client().post(`/auth/setup/${second}`, { password: 'Strong-Pass1' })).status, 200);
    const again = await owner.post(`/orgs/${orgId}/members/${userId}/resend-setup`);
    assert.equal(again.body.error.code, 'ALREADY_ACTIVE');
    assert.equal((await owner.post(`/orgs/${orgId}/members/${members.VERIFIER.user.id}/resend-setup`)).body.error.code, 'ALREADY_ACTIVE');
  });

  it('adds an existing FieldProof user to a second organization without a setup link', async () => {
    const a = await orgWith('Org A');
    const b = await orgWith('Org B');
    const added = await b.owner.post(`/orgs/${b.orgId}/members`, { name: 'ignored', email: a.owner.user.email, role: 'VIEWER' });
    assert.equal(added.status, 201);
    assert.equal(added.body.newAccount, false);
    assert.equal(added.body.setupLink, null);
    assert.match(outbox.at(-1)!.subject, /added to Org B/);
    const me = await a.owner.get('/auth/me');
    assert.equal(me.body.memberships.length, 2);
    const dup = await b.owner.post(`/orgs/${b.orgId}/members`, { name: 'dup', email: a.owner.user.email, role: 'VIEWER' });
    assert.equal(dup.status, 409, JSON.stringify(dup.body));
    assert.equal(dup.body.error.code, 'ALREADY_MEMBER');
    assert.equal((await b.owner.post(`/orgs/${b.orgId}/members`, { name: 'x', email: 'o@example.test', role: 'OWNER' })).status, 422);
  });

  it('forgot-password answers the same for known and unknown emails and issues a working link', async () => {
    const user = await registerUser('Forgetful');
    const known = await new Client().post('/auth/forgot-password', { email: user.user.email });
    const unknown = await new Client().post('/auth/forgot-password', { email: 'nobody@example.test' });
    assert.deepEqual(known.body, unknown.body);
    const { token } = setupLinkFor(user.user.email);
    assert.equal((await new Client().post(`/auth/setup/${token}`, { password: 'Fresh-Pass9' })).status, 200);
    assert.equal((await new Client().post('/auth/login', { email: user.user.email, password: 'Fresh-Pass9' })).status, 200);
    assert.equal((await new Client().post('/auth/login', { email: user.user.email, password: 'Password123' })).status, 401);
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
      setups: await prisma.accountSetup.count(),
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
      ['add member to A', () => intruder.post(`/orgs/${a.orgId}/members`, { name: 'Mole', email: 'mole@example.test', role: 'ADMIN' })],
      ['resend setup in A', () => intruder.post(`/orgs/${a.orgId}/members/${a.owner.user.id}/resend-setup`)],
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
      ['add member', () => worker.post(`/orgs/${worker.memberships[0].organization.id}/members`, { name: 'Friend', email: 'friend@example.test', role: 'VIEWER' })],
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
    assert.equal((await admin.post(`/orgs/${orgId}/members`, { name: 'New Admin', email: 'na@example.test', role: 'ADMIN' })).status, 403);
    assert.equal((await admin.post(`/orgs/${orgId}/members`, { name: 'New PM', email: 'pm@example.test', role: 'PROGRAM_MANAGER' })).status, 201);
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

describe('audit log', () => {
  it('records actions in a verifiable chain and detects tampering', async () => {
    const { owner, orgId } = await orgWith('Green Roots', ['FIELD_WORKER']);
    await seedProject(owner);
    const log = await owner.get(`/orgs/${orgId}/audit`);
    assert.equal(log.status, 200);
    const actions = log.body.entries.map((entry: any) => entry.action);
    for (const action of ['org.created', 'member.added', 'project.created', 'evidence.uploaded'])
      assert.ok(actions.includes(action), `missing ${action}`);
    assert.equal(log.body.integrity.valid, true);

    const victim = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: orgId, action: 'member.added' } });
    await prisma.auditLog.update({ where: { id: victim.id }, data: { metadata: { role: 'OWNER' } } });
    const tampered = await owner.get(`/orgs/${orgId}/audit`);
    assert.equal(tampered.body.integrity.valid, false);
    assert.equal(tampered.body.integrity.brokenAt, victim.seq);
  });
});
