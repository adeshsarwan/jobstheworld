const countryAliases = new Map([
  ['DE', 'DE'], ['GERMANY', 'DE'], ['AU', 'AU'], ['AUSTRALIA', 'AU'],
  ['US', 'US'],
  ['USA', 'US'],
  ['UNITED STATES', 'US'],
  ['UNITED STATES OF AMERICA', 'US'],
  ['GB', 'GB'],
  ['UK', 'GB'],
  ['UNITED KINGDOM', 'GB'],
  ['GREAT BRITAIN', 'GB'],
  ['CA', 'CA'],
  ['CANADA', 'CA'],
  ['IN', 'IN'],
  ['INDIA', 'IN'],
  ['NG', 'NG'],
  ['NIGERIA', 'NG'],
  ['ZA', 'ZA'],
  ['SOUTH AFRICA', 'ZA'],
  ['AE', 'AE'],
  ['UAE', 'AE'],
  ['UNITED ARAB EMIRATES', 'AE'],
  ['SA', 'SA'],
  ['SAUDI ARABIA', 'SA'],
  ['KSA', 'SA'],
  ['KINGDOM OF SAUDI ARABIA', 'SA'],
  ['QA', 'QA'],
  ['QATAR', 'QA'],
  ['KW', 'KW'],
  ['KUWAIT', 'KW'],
  ['OM', 'OM'],
  ['OMAN', 'OM'],
  ['BH', 'BH'],
  ['BAHRAIN', 'BH']
]);

export function normalizeCountryCode(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return null;
  return countryAliases.get(normalized) || null;
}

export function resolveJobCountry(rawCountry, configuredCountryCode) {
  const apiCountry = normalizeCountryCode(rawCountry);
  if (apiCountry) return apiCountry;
  if (rawCountry) return null;
  return normalizeCountryCode(configuredCountryCode);
}
