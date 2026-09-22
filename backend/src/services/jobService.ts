import type { CategoryResult, Job, JobListResult } from '../models/job.js';
import { JobRepository, type RepositoryJobFilters } from '../repositories/jobRepository.js';
import { findWorkCategory, normalizeSupportedCountry, workCategories } from './categoryConfig.js';

export interface ApiJobFilters {
  q?: string;
  category?: string;
  country?: string;
  city?: string;
  state?: string;
  remote?: string | boolean;
  employment_type?: string;
  experience_level?: string;
  page?: number;
  limit?: number;
}

export interface MatchAnswers {
  work?: string;
  location?: string;
  schedule?: string;
  experience?: string;
}

export interface MatchRequest {
  answers?: MatchAnswers;
  city?: string;
  country?: string;
  state?: string;
  page?: number;
  limit?: number;
}

export interface ChatRequest {
  answers?: MatchAnswers;
  message?: string;
  city?: string;
  state?: string;
}

export interface JobRepositoryLike {
  findJobs(filters: RepositoryJobFilters): Promise<JobListResult>;
  findJobBySlug(slug: string): Promise<Job | null>;
  findCategories(): Promise<CategoryResult[]>;
}

const chatQuestions = [
  {
    key: 'work',
    question: 'What kind of work are you looking for?',
    options: workCategories.map((category) => category.label)
  },
  {
    key: 'location',
    question: 'Where do you want to work?',
    options: ['In my local area', 'Remote', 'Anywhere in the U.S.']
  },
  {
    key: 'schedule',
    question: 'What schedule works best?',
    options: ['Full-time', 'Part-time', 'Flexible / any']
  },
  {
    key: 'experience',
    question: 'What is your experience level?',
    options: ['No experience / entry level', 'Some experience', 'Experienced']
  }
] as const;

function asCleanString(value?: string) {
  const text = value?.trim();
  return text || undefined;
}

function parseBoolean(value?: string | boolean) {
  if (typeof value === 'boolean') return value;
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'remote'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return undefined;
}

function employmentValues(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized.includes('flexible') || normalized === 'any') return undefined;
  if (normalized.includes('full')) return ['Full-time'];
  if (normalized.includes('part')) return ['Part-time'];
  return [value as string];
}

function experienceTerms(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized.includes('some')) return undefined;
  if (normalized.includes('no experience') || normalized.includes('entry')) {
    return ['entry', 'trainee', 'associate', 'assistant', 'training'];
  }
  if (normalized.includes('experienced')) {
    return ['experienced', 'senior', 'lead', 'manager', 'specialist'];
  }
  return undefined;
}

function mergeAnswers(existing: MatchAnswers, message?: string): MatchAnswers {
  if (!message) return existing;
  const normalized = message.trim().toLowerCase();
  const next = { ...existing };

  for (const question of chatQuestions) {
    if (next[question.key]) continue;
    const option = question.options.find((candidate) => (
      candidate.toLowerCase() === normalized ||
      normalized.includes(candidate.toLowerCase())
    ));
    if (option) {
      next[question.key] = option;
      break;
    }
  }

  return next;
}

export class JobService {
  constructor(private readonly repository: JobRepositoryLike = new JobRepository()) {}

  private toRepositoryFilters(filters: ApiJobFilters): RepositoryJobFilters {
    const category = findWorkCategory(filters.category);
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(Math.max(1, filters.limit || 20), 100);

    return {
      q: asCleanString(filters.q),
      categoryValues: category?.databaseCategories,
      categoryTerms: category?.terms,
      country: normalizeSupportedCountry(filters.country),
      city: asCleanString(filters.city),
      state: asCleanString(filters.state),
      remote: parseBoolean(filters.remote),
      employmentTypeValues: employmentValues(filters.employment_type),
      experienceTerms: experienceTerms(filters.experience_level),
      page,
      limit
    };
  }

  async searchJobs(filters: ApiJobFilters): Promise<JobListResult> {
    return this.repository.findJobs(this.toRepositoryFilters(filters));
  }

  async getJob(slug: string): Promise<Job | null> {
    return this.repository.findJobBySlug(slug);
  }

  async getCategories(): Promise<CategoryResult[]> {
    return workCategories.map((category) => ({
      value: category.value,
      label: category.label,
      count: 0
    }));
  }

  async matchJobs(request: MatchRequest): Promise<JobListResult> {
    const answers = request.answers || {};
    return this.searchJobs({
      category: answers.work,
      country: request.country,
      city: request.city,
      state: request.state,
      remote: answers.location === 'Remote' ? true : undefined,
      employment_type: answers.schedule,
      experience_level: answers.experience,
      page: request.page || 1,
      limit: request.limit || 10
    });
  }

  async chat(request: ChatRequest) {
    const answers = mergeAnswers(request.answers || {}, request.message);
    const nextQuestion = chatQuestions.find((question) => !answers[question.key]);

    if (nextQuestion) {
      return {
        message: nextQuestion.question,
        nextQuestion,
        answers,
        jobs: null
      };
    }

    const result = await this.matchJobs({
      answers,
      city: request.city,
      state: request.state,
      limit: 5
    });

    return {
      message: result.jobs.length ? 'Here are jobs that match your answers.' : 'No matching jobs were found yet.',
      nextQuestion: null,
      answers,
      jobs: result
    };
  }
}
