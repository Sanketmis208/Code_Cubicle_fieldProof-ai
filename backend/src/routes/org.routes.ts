import { Router } from 'express';
import {
  addMember,
  createOrganization,
  getOrganization,
  listAuditLog,
  listMembers,
  listMyOrganizations,
  removeMember,
  resendSetup,
  updateMember,
  updateOrganization,
} from '../controllers/org.controller.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  addMemberSchema,
  createOrgSchema,
  memberParamsSchema,
  orgIdSchema,
  updateMemberSchema,
  updateOrgSchema,
} from '../validators/org.validators.js';

export const orgRouter = Router();
orgRouter.get('/', asyncHandler(listMyOrganizations));
orgRouter.post('/', validate(createOrgSchema), asyncHandler(createOrganization));
orgRouter.get('/:orgId', validate(orgIdSchema), asyncHandler(getOrganization));
orgRouter.patch('/:orgId', validate(updateOrgSchema), asyncHandler(updateOrganization));
orgRouter.get('/:orgId/members', validate(orgIdSchema), asyncHandler(listMembers));
orgRouter.post('/:orgId/members', validate(addMemberSchema), asyncHandler(addMember));
orgRouter.post('/:orgId/members/:userId/resend-setup', validate(memberParamsSchema), asyncHandler(resendSetup));
orgRouter.patch('/:orgId/members/:userId', validate(updateMemberSchema), asyncHandler(updateMember));
orgRouter.delete('/:orgId/members/:userId', validate(memberParamsSchema), asyncHandler(removeMember));
orgRouter.get('/:orgId/audit', validate(orgIdSchema), asyncHandler(listAuditLog));
