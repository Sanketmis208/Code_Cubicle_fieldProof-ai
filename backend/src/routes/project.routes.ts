import { Router } from 'express';
import { createProject, deleteProject, generateProjectInsight, getProject, listProjects, updateProject } from '../controllers/project.controller.js';
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
