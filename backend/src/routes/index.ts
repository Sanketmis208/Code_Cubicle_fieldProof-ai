import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { projectRouter } from './project.routes.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { dashboardSummary } from '../controllers/project.controller.js';
import { assetRouter } from './asset.routes.js';
import { comparisonRouter } from './comparison.routes.js';
import { reportRouter } from './report.routes.js';

export const apiRouter = Router();
apiRouter.use('/auth', authRouter);
apiRouter.get('/dashboard/summary', requireAuth, asyncHandler(dashboardSummary));
apiRouter.use('/projects', requireAuth, projectRouter);
apiRouter.use('/assets', requireAuth, assetRouter);
apiRouter.use('/comparisons', requireAuth, comparisonRouter);
apiRouter.use('/reports', requireAuth, reportRouter);
