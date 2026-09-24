import { z } from 'zod';
import { findWorkCategory } from './categoryConfig.js';

// ISO 3166-1 alpha-2, including markets with no stored inventory.
const countries = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));
const text = z.string().trim().min(1).max(200);
const integer = z.string().trim().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
export const employmentTypes = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'] as const;
export const experienceLevels = ['entry-level', 'mid-level', 'senior'] as const;
export const searchQuerySchema = z.object({
  country: text.transform(v => v.toUpperCase()).refine(v => countries.has(v)).optional(),
  category: text.transform(v => v.toLowerCase()).refine(v => Boolean(findWorkCategory(v))).transform(v => findWorkCategory(v)!.value).optional(),
  q: text.optional(), city: text.optional(), state: text.optional(),
  remote: text.transform(v => v.toLowerCase()).pipe(z.enum(['true', 'false', '1', '0'])).transform(v => v === 'true' || v === '1').optional(),
  employment_type: text.transform(v => employmentTypes.find(t => t.toLowerCase() === v.toLowerCase())).pipe(z.enum(employmentTypes)).optional(),
  experience_level: text.transform(v => v.toLowerCase()).pipe(z.enum(experienceLevels)).optional(),
  page: integer.default(1),
  limit: integer.pipe(z.number().max(100)).default(20)
}).strict().refine(v => Number.isSafeInteger((v.page - 1) * v.limit));
export type SearchFilters = z.infer<typeof searchQuerySchema>;
export function searchTtl(filters: SearchFilters) {
  return filters.q ? 300 : filters.city || filters.state ? 900 : filters.country || filters.category ? 1800 : 300;
}
