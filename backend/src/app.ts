import cors from 'cors';
import { adminRoutes, type InventoryOperation } from './routes/admin.js';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createRoutes } from './routes/index.js';
import { JobService } from './services/jobService.js';

export interface AppOptions {
  jobService?: JobService;
  inventoryOperation?: InventoryOperation;
  adminKey?: string;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const jobService = options.jobService || new JobService();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());
  const operation: InventoryOperation = options.inventoryOperation || (async (mode, selection) => {
    const modulePath = fileURLToPath(new URL('../../ingestion/inventory/runtime.js', import.meta.url));
    const runtime = await import(modulePath);
    return runtime.inventoryOperation(mode, selection);
  });
  app.use('/api/admin/jobs', adminRoutes(operation, options.adminKey));
  app.use(createRoutes(jobService));
  app.use(errorHandler);

  return app;
}
