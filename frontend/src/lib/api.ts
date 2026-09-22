import type { ApiResponse, Job, JobListResult } from '../types/api';

const serverApiBaseUrl = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:4000';

export const apiBaseUrl = typeof window === 'undefined'
  ? serverApiBaseUrl
  : process.env.NEXT_PUBLIC_API_BASE_URL || '';

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {})
    }
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload.data;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiGet<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export function jobsPath(params: URLSearchParams) {
  const query = params.toString();
  return `/api/jobs${query ? `?${query}` : ''}`;
}

export async function getJobs(params: URLSearchParams) {
  return apiGet<JobListResult>(jobsPath(params), { cache: 'no-store' });
}

export async function getJob(slug: string) {
  return apiGet<Job>(`/api/jobs/${encodeURIComponent(slug)}`, { cache: 'no-store' });
}
