import countries from '../config/countries.js';
import categories from '../config/categories.js';
import countrySpecificCategories, { countriesWithSpecificCategories } from '../config/country-specific-categories.js';

function categoriesForCountry(countryCode) {
  return countrySpecificCategories[countryCode] || categories;
}

function buildQueryText(searchTerm, country) {
  const term = String(searchTerm).trim();
  const locationSuffix = `in ${country.searchName}`;
  if (/\bjobs?\b/i.test(term)) return `${term} ${locationSuffix}`;
  return `${term} jobs ${locationSuffix}`;
}

export function generateQueries() {
  const queries = [];

  for (const country of countries.filter((item) => item.enabled)) {
    for (const category of categoriesForCountry(country.code).filter((item) => item.enabled !== false)) {
      for (const searchTerm of category.queries) {
        queries.push({
          countryCode: country.code,
          countryName: country.name,
          categorySlug: category.slug,
          categoryLabel: category.label,
          searchTerm,
          query: buildQueryText(searchTerm, country)
        });
      }
    }
  }

  return queries;
}

export function countrySpecificQueryKeys() {
  const keysByCountry = new Map();

  for (const countryCode of countriesWithSpecificCategories()) {
    const keys = new Set();
    for (const category of categoriesForCountry(countryCode).filter((item) => item.enabled !== false)) {
      for (const searchTerm of category.queries) {
        keys.add(`${category.slug}\u0000${searchTerm}`);
      }
    }
    keysByCountry.set(countryCode, keys);
  }

  return keysByCountry;
}

export function priorityForCountry(countryCode) {
  const country = countries.find((item) => item.code === countryCode);
  if (!country) return 100;
  return country.priority === 1 ? 10 : 20;
}
