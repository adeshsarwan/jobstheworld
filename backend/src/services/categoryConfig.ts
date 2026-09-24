export const workCategories = [
  {
    value: 'warehouse-logistics',
    label: 'Warehouse & Logistics',
    databaseCategories: ['warehouse-logistics', 'blue_collar'],
    terms: ['warehouse', 'logistics', 'forklift', 'picker', 'packer'],
    aliases: []
  },
  {
    value: 'retail-store',
    label: 'Retail & Store',
    databaseCategories: ['retail-store', 'travel'],
    terms: ['retail', 'store', 'cashier', 'sales associate'],
    aliases: []
  },
  {
    value: 'driving-delivery',
    label: 'Driving & Delivery',
    databaseCategories: ['driving-delivery', 'blue_collar'],
    terms: ['driver', 'delivery', 'rider'],
    aliases: []
  },
  {
    value: 'food-service',
    label: 'Food Service',
    databaseCategories: ['food-service'],
    terms: ['food', 'restaurant', 'server', 'cook', 'kitchen'],
    aliases: []
  },
  {
    value: 'cleaning-facilities',
    label: 'Cleaning & Facilities',
    databaseCategories: ['cleaning-facilities', 'blue_collar'],
    terms: ['cleaning', 'janitor', 'facilities', 'custodian'],
    aliases: []
  },
  {
    value: 'healthcare-care',
    label: 'Healthcare & Care',
    databaseCategories: ['healthcare-care'],
    terms: ['healthcare', 'caregiver', 'care', 'assistant'],
    aliases: []
  },
  {
    value: 'hospitality',
    label: 'Hospitality',
    databaseCategories: ['hospitality', 'travel'],
    terms: ['hotel', 'hospitality', 'guest', 'travel'],
    aliases: []
  },
  {
    value: 'security',
    label: 'Security',
    databaseCategories: ['security'],
    terms: ['security', 'guard', 'officer'],
    aliases: []
  },
  {
    value: 'remote-work',
    label: 'Remote / Work from Home',
    databaseCategories: ['remote-work', 'remote-work-from-home', 'remote_tech'],
    terms: ['remote', 'work from home', 'wfh'],
    aliases: ['remote-work-from-home']
  },
  {
    value: 'office-admin',
    label: 'Office & Admin',
    databaseCategories: ['office-admin', 'remote_tech'],
    terms: ['office', 'admin', 'assistant', 'coordinator'],
    aliases: []
  },
  {
    value: 'customer-service',
    label: 'Customer Service',
    databaseCategories: ['customer-service'],
    terms: ['customer service', 'support', 'call center'],
    aliases: []
  },
  {
    value: 'sales',
    label: 'Sales',
    databaseCategories: ['sales'],
    terms: ['sales', 'account executive', 'business development'],
    aliases: []
  },
  {
    value: 'construction-trades',
    label: 'Construction & Trades',
    databaseCategories: ['construction-trades', 'blue_collar'],
    terms: ['construction', 'electrician', 'plumber', 'carpenter', 'welder'],
    aliases: []
  },
  {
    value: 'manufacturing',
    label: 'Manufacturing',
    databaseCategories: ['manufacturing'],
    terms: ['manufacturing', 'production', 'factory', 'machine operator'],
    aliases: []
  },
  {
    value: 'technology',
    label: 'Technology',
    databaseCategories: ['technology', 'remote_tech'],
    terms: ['software', 'developer', 'IT support', 'data analyst'],
    aliases: []
  },
  {
    value: 'finance-accounting',
    label: 'Finance & Accounting',
    databaseCategories: ['finance-accounting'],
    terms: ['accountant', 'finance', 'bookkeeper', 'payroll'],
    aliases: []
  },
  {
    value: 'education',
    label: 'Education',
    databaseCategories: ['education'],
    terms: ['teacher', 'tutor', 'school', 'education'],
    aliases: []
  },
  {
    value: 'marketing',
    label: 'Marketing',
    databaseCategories: ['marketing'],
    terms: ['marketing', 'social media', 'content', 'SEO'],
    aliases: []
  },
  {
    value: 'human-resources',
    label: 'Human Resources',
    databaseCategories: ['human-resources'],
    terms: ['HR', 'recruiter', 'talent acquisition', 'human resources'],
    aliases: []
  },
  {
    value: 'engineering',
    label: 'Engineering',
    databaseCategories: ['engineering'],
    terms: ['engineer', 'mechanical', 'electrical', 'civil'],
    aliases: []
  }
];

export const supportedCountries = [
  { code: 'DE', name: 'Germany' },
  { code: 'AU', name: 'Australia' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'IN', name: 'India' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'QA', name: 'Qatar' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'OM', name: 'Oman' },
  { code: 'BH', name: 'Bahrain' }
];

export function findWorkCategory(input?: string) {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  return workCategories.find((category) => (
    category.value === normalized ||
    category.label.toLowerCase() === normalized ||
    category.aliases.includes(normalized)
  )) || null;
}

export function normalizeSupportedCountry(input?: string) {
  if (!input) return undefined;
  const normalized = input.trim().toUpperCase();
  return supportedCountries.some((country) => country.code === normalized) ? normalized : undefined;
}
