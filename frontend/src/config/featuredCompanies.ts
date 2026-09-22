export interface FeaturedCompany {
  slug: string;
  name: string;
  searchQuery: string;
  category: string;
  payRange: string;
  summary: string;
  headline: string;
  openingsLabel: string;
  schedule: string;
  where: string;
  roles: string[];
  applySteps: string[];
  colorClass: string;
  initials: string;
}

export const featuredCompanies: FeaturedCompany[] = [
  {
    slug: 'amazon',
    name: 'Amazon',
    searchQuery: 'Amazon',
    category: 'Fulfillment and delivery',
    payRange: '$16 - $23 / hr',
    summary: 'Warehouse, picker packer, delivery, and fulfillment roles with many entry-level openings.',
    headline: 'Amazon warehouse and delivery jobs are hiring near you',
    openingsLabel: 'Fulfillment centers and delivery routes',
    schedule: 'Full-time, part-time, and seasonal',
    where: 'U.S. and supported countries',
    roles: ['Warehouse associate', 'Picker packer', 'Delivery driver', 'Sortation associate'],
    applySteps: ['Choose a warehouse or delivery role', 'Check schedule and location', 'Open the job detail page', 'Apply on the official posting'],
    colorClass: 'company-amazon',
    initials: 'amazon'
  },
  {
    slug: 'costco',
    name: 'Costco',
    searchQuery: 'Costco',
    category: 'Warehouses nationwide',
    payRange: '$18 - $30 / hr',
    summary: 'Cashier, food service, stocking, and warehouse roles known for steady schedules and benefits.',
    headline: 'Costco is hiring warehouse and front-end staff',
    openingsLabel: 'Warehouse and store openings',
    schedule: 'Full-time and part-time',
    where: 'U.S. nationwide',
    roles: ['Food service assistant', 'Stocker', 'Cashier assistant', 'Warehouse support'],
    applySteps: ['Pick a nearby warehouse', 'Review the role details', 'Confirm pay and schedule', 'Apply on the official posting'],
    colorClass: 'company-costco',
    initials: 'costco'
  },
  {
    slug: 'fedex',
    name: 'FedEx',
    searchQuery: 'FedEx',
    category: 'Hubs and delivery',
    payRange: '$17 - $27 / hr',
    summary: 'Package handler, warehouse, courier, and driver roles for people comfortable with active work.',
    headline: 'FedEx is hiring package handlers and drivers',
    openingsLabel: 'Hubs, warehouses, and delivery routes',
    schedule: 'Early, late, and flexible shifts',
    where: 'U.S. and supported countries',
    roles: ['Package handler', 'Courier', 'Delivery driver', 'Warehouse associate'],
    applySteps: ['Choose a hub or route role', 'Check shift requirements', 'Compare nearby openings', 'Apply through the official job page'],
    colorClass: 'company-fedex',
    initials: 'FedEx'
  },
  {
    slug: 'mcdonalds',
    name: "McDonald's",
    searchQuery: "McDonald's",
    category: 'Restaurant crew',
    payRange: '$13 - $21 / hr',
    summary: 'Crew, cashier, cook, and shift roles with entry-level options and flexible scheduling.',
    headline: "McDonald's is hiring restaurant crew and shift staff",
    openingsLabel: 'Restaurants and local franchises',
    schedule: 'Flexible, part-time, and full-time',
    where: 'Local restaurants',
    roles: ['Crew member', 'Cashier', 'Cook', 'Shift lead'],
    applySteps: ['Search by city or nearby restaurant', 'Pick a schedule fit', 'Review restaurant requirements', 'Apply on the official posting'],
    colorClass: 'company-mcdonalds',
    initials: 'M'
  },
  {
    slug: 'starbucks',
    name: 'Starbucks',
    searchQuery: 'Starbucks',
    category: 'Cafe and customer service',
    payRange: '$15 - $22 / hr',
    summary: 'Barista, shift supervisor, and store support roles for customer-focused job seekers.',
    headline: 'Starbucks is hiring baristas and shift supervisors',
    openingsLabel: 'Cafe and store openings',
    schedule: 'Part-time and flexible shifts',
    where: 'Local stores',
    roles: ['Barista', 'Shift supervisor', 'Store support', 'Customer service'],
    applySteps: ['Find a nearby store', 'Compare shift needs', 'Review benefits and requirements', 'Apply on the official posting'],
    colorClass: 'company-starbucks',
    initials: 'ST'
  }
];

export function getFeaturedCompany(slug: string) {
  return featuredCompanies.find((company) => company.slug === slug);
}
