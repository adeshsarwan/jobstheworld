import { Router } from 'express';
import { JobController } from '../controllers/jobController.js';
import type { JobService } from '../services/jobService.js';

export function createRoutes(jobService: JobService) {
  const router = Router();
  const controller = new JobController(jobService);

  router.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });
  router.get('/api/jobs', controller.listJobs);
  router.get('/api/jobs/search', controller.searchJobs);
  router.get('/api/jobs/:slug', controller.getJob);
  router.get('/api/categories', controller.getCategories);
  router.post('/api/match', controller.match);
  router.post('/api/chat', controller.chat);

  return router;
}
