import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';
import type { JobService } from '../services/jobService.js';

const jobQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  remote: z.string().optional(),
  employment_type: z.string().optional(),
  experience_level: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

const slugSchema = z.object({
  slug: z.string().min(1)
});

const matchSchema = z.object({
  answers: z.object({
    work: z.string().optional(),
    location: z.string().optional(),
    schedule: z.string().optional(),
    experience: z.string().optional()
  }).optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

const chatSchema = z.object({
  answers: z.object({
    work: z.string().optional(),
    location: z.string().optional(),
    schedule: z.string().optional(),
    experience: z.string().optional()
  }).optional(),
  message: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional()
});

function parseOrThrow<T>(schema: z.ZodSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'Invalid request');
  return parsed.data;
}

export class JobController {
  constructor(private readonly service: JobService) {}

  listJobs = async (req: Request, res: Response) => {
    const filters = parseOrThrow(jobQuerySchema, req.query);
    const data = await this.service.searchJobs(filters);
    const ttl = filters.q ? 300 : filters.city || filters.state ? 900 : 1800;
    res.set('Cache-Control', `public, max-age=0, s-maxage=${ttl}, must-revalidate`);
    res.json({ success: true, data });
  };

  getJob = async (req: Request, res: Response) => {
    const { slug } = parseOrThrow(slugSchema, req.params);
    const data = await this.service.getJob(slug);
    if (!data) throw new HttpError(404, 'Job not found');
    res.set('Cache-Control', 'public, max-age=0, s-maxage=3600, must-revalidate');
    res.json({ success: true, data });
  };

  getCategories = async (_req: Request, res: Response) => {
    const data = await this.service.getCategories();
    res.json({ success: true, data });
  };

  match = async (req: Request, res: Response) => {
    const body = parseOrThrow(matchSchema, req.body);
    const data = await this.service.matchJobs(body);
    res.json({ success: true, data });
  };

  chat = async (req: Request, res: Response) => {
    const body = parseOrThrow(chatSchema, req.body);
    const data = await this.service.chat(body);
    res.json({ success: true, data });
  };
}
