export interface Job {
  id: number;
  slug: string;
  title: string;
  company: {
    id: number;
    name: string;
    logoUrl: string | null;
  };
  category: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  employmentType: string | null;
  isRemote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  description?: string | null;
  applyUrl?: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface JobListResult {
  jobs: Job[];
  pagination: Pagination;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
