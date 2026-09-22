import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createRoutes } from './routes/index.js';
import { JobService } from './services/jobService.js';

export interface AppOptions {
  jobService?: JobService;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const jobService = options.jobService || new JobService();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());
  app.use(createRoutes(jobService));
  app.use(errorHandler);

  return app;
}
