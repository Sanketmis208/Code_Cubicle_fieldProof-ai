import { Router } from 'express';
import { addProjectMember, createProject, deleteProject, generateProjectInsight, getProject, listProjectMembers, listProjects, removeProjectMember, updateProject } from '../controllers/project.controller.js';
import { projectMemberParamsSchema, projectMemberSchema } from '../validators/org.validators.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { createProjectSchema, projectIdSchema, updateProjectSchema } from '../validators/project.validators.js';
import { aiLimiter } from '../middleware/rate-limits.js';

export const projectRouter = Router();
projectRouter.get('/', asyncHandler(listProjects));
projectRouter.post('/', validate(createProjectSchema), asyncHandler(createProject));
projectRouter.get('/:id', validate(projectIdSchema), asyncHandler(getProject));
projectRouter.post('/:id/summary', aiLimiter, validate(projectIdSchema), asyncHandler(generateProjectInsight));
projectRouter.patch('/:id', validate(projectIdSchema), validate(updateProjectSchema), asyncHandler(updateProject));
projectRouter.delete('/:id', validate(projectIdSchema), asyncHandler(deleteProject));
projectRouter.get('/:id/members', validate(projectIdSchema), asyncHandler(listProjectMembers));
projectRouter.post('/:id/members', validate(projectMemberSchema), asyncHandler(addProjectMember));
projectRouter.delete('/:id/members/:userId', validate(projectMemberParamsSchema), asyncHandler(removeProjectMember));
