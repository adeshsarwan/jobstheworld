import { sourceHash } from '../db.js';
import { resolveJobCountry } from './country-utils.js';

export const queryMatrix = [
  { keyword: 'Warehouse & Logistics', category: 'warehouse-logistics', searchString: 'warehouse logistics jobs' },
  { keyword: 'Retail & Store', category: 'retail-store', searchString: 'retail store associate jobs' },
  { keyword: 'Driving & Delivery', category: 'driving-delivery', searchString: 'delivery driver jobs' },
  { keyword: 'Food Service', category: 'food-service', searchString: 'food service jobs' },
  { keyword: 'Cleaning & Facilities', category: 'cleaning-facilities', searchString: 'cleaning facilities jobs' },
  { keyword: 'Healthcare & Care', category: 'healthcare-care', searchString: 'caregiver healthcare assistant jobs' },
  { keyword: 'Hospitality', category: 'hospitality', searchString: 'hotel hospitality jobs' },
  { keyword: 'Security', category: 'security', searchString: 'security guard jobs' },
  { keyword: 'Remote / Work from Home', category: 'remote-work-from-home', searchString: 'remote work from home jobs' },
  { keyword: 'Office & Admin', category: 'office-admin', searchString: 'office admin jobs' },
  { keyword: 'Customer Service', category: 'customer-service', searchString: 'customer service jobs' }
];

export function cleanText(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).replace(/\u0000/g, '').trim();
  return text || fallback;
}

export function cleanDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) >= 1e16) return null;
  return number;
}

export function slugify(value) {
  const slug = String(value || 'job')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 190);

  return slug || 'job';
}

function normalizeEmploymentType(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = cleanText(raw);
  if (!text) return null;

  const normalized = text.toLowerCase().replace(/[_-]+/g, ' ');
  if (normalized.includes('full')) return 'Full-time';
  if (normalized.includes('part')) return 'Part-time';
  if (normalized.includes('contract')) return 'Contract';
  if (normalized.includes('intern')) return 'Internship';
  if (normalized.includes('temporary') || normalized.includes('temp')) return 'Temporary';
  return text;
}

function parseLocation(rawJob, configuredCountryCode) {
  const city = cleanText(rawJob?.job_city);
  const state = cleanText(rawJob?.job_state);
  const country = resolveJobCountry(cleanText(rawJob?.job_country), configuredCountryCode);
  const locationFallback = [city, state, country].filter(Boolean).join(', ');

  return {
    location: cleanText(rawJob?.job_location, locationFallback || 'Remote'),
    city,
    state,
    country
  };
}

function inferRemote(rawJob, title, location) {
  if (rawJob?.job_is_remote === true || rawJob?.job_is_remote === 1) return 1;
  const haystack = `${title || ''} ${location || ''}`.toLowerCase();
  return /\b(remote|work from home|wfh)\b/.test(haystack) ? 1 : 0;
}

function parsePostedAt(rawJob) {
  const direct = cleanText(rawJob?.job_posted_at_datetime_utc);
  if (direct && !Number.isNaN(Date.parse(direct))) {
    return new Date(direct);
  }

  const timestamp = Number(rawJob?.job_posted_at_timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000);
  }

  return null;
}

export function normalizeJob(rawJob, target) {
  const apiSource = 'jsearch';
  const sourceId = cleanText(rawJob?.job_id);
  if (!sourceId) return null;

  const hash = sourceHash(apiSource, sourceId);
  const title = cleanText(rawJob?.job_title, 'Untitled Position');
  const category = target.categorySlug || target.category;
  const location = parseLocation(rawJob, target.countryCode);
  const applyLink = cleanText(rawJob?.job_apply_link, cleanText(rawJob?.job_google_link, 'https://www.google.com'));

  return {
    apiSource,
    sourceId,
    sourceHash: hash,
    slug: `${slugify(title)}-${hash.slice(0, 8)}`,
    title,
    companyName: cleanText(rawJob?.employer_name, 'Unknown Company').slice(0, 255),
    companyLogoUrl: cleanText(rawJob?.employer_logo),
    category,
    location: location.location,
    city: location.city,
    state: location.state,
    country: location.country,
    employmentType: normalizeEmploymentType(rawJob?.job_employment_type || rawJob?.job_employment_types),
    isRemote: inferRemote(rawJob, title, location.location),
    description: cleanText(rawJob?.job_description, ''),
    redirectUrl: applyLink,
    salaryMin: cleanDecimal(rawJob?.job_min_salary),
    salaryMax: cleanDecimal(rawJob?.job_max_salary),
    salaryPeriod: cleanText(rawJob?.job_salary_period),
    postedAt: parsePostedAt(rawJob),
    rawPayload: JSON.stringify(rawJob)
  };
}
