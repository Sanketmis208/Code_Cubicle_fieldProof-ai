import { Router } from 'express';
import {
  createInvite,
  createOrganization,
  getOrganization,
  joinOrganization,
  listAuditLog,
  listInvites,
  listMembers,
  listMyOrganizations,
  removeMember,
  revokeInvite,
  updateMember,
  updateOrganization,
} from '../controllers/org.controller.js';
import { inviteJoinLimiter } from '../middleware/rate-limits.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  createInviteSchema,
  createOrgSchema,
  inviteParamsSchema,
  joinOrgSchema,
  memberParamsSchema,
  orgIdSchema,
  updateMemberSchema,
  updateOrgSchema,
} from '../validators/org.validators.js';

export const orgRouter = Router();
orgRouter.get('/', asyncHandler(listMyOrganizations));
orgRouter.post('/', validate(createOrgSchema), asyncHandler(createOrganization));
orgRouter.post('/join', inviteJoinLimiter, validate(joinOrgSchema), asyncHandler(joinOrganization));
orgRouter.get('/:orgId', validate(orgIdSchema), asyncHandler(getOrganization));
orgRouter.patch('/:orgId', validate(updateOrgSchema), asyncHandler(updateOrganization));
orgRouter.get('/:orgId/members', validate(orgIdSchema), asyncHandler(listMembers));
orgRouter.patch('/:orgId/members/:userId', validate(updateMemberSchema), asyncHandler(updateMember));
orgRouter.delete('/:orgId/members/:userId', validate(memberParamsSchema), asyncHandler(removeMember));
orgRouter.get('/:orgId/invites', validate(orgIdSchema), asyncHandler(listInvites));
orgRouter.post('/:orgId/invites', validate(createInviteSchema), asyncHandler(createInvite));
orgRouter.delete('/:orgId/invites/:inviteId', validate(inviteParamsSchema), asyncHandler(revokeInvite));
orgRouter.get('/:orgId/audit', validate(orgIdSchema), asyncHandler(listAuditLog));
