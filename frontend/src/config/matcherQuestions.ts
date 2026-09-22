export const matcherQuestions = [
  {
    key: 'work',
    path: '/find/work',
    nextPath: '/find/location',
    step: 1,
    question: 'What kind of work are you looking for?',
    options: [
      { value: 'warehouse-logistics', label: 'Warehouse & Logistics' },
      { value: 'retail-store', label: 'Retail & Store' },
      { value: 'driving-delivery', label: 'Driving & Delivery' },
      { value: 'food-service', label: 'Food Service' },
      { value: 'cleaning-facilities', label: 'Cleaning & Facilities' },
      { value: 'healthcare-care', label: 'Healthcare & Care' },
      { value: 'hospitality', label: 'Hospitality' },
      { value: 'security', label: 'Security' },
      { value: 'remote-work-from-home', label: 'Remote / Work from Home' },
      { value: 'office-admin', label: 'Office & Admin' },
      { value: 'customer-service', label: 'Customer Service' }
    ]
  },
  {
    key: 'location',
    path: '/find/location',
    nextPath: '/find/schedule',
    step: 2,
    question: 'Where do you want to work?',
    options: [
      { value: 'In my local area', label: 'In my local area' },
      { value: 'Remote', label: 'Remote' },
      { value: 'Anywhere in the U.S.', label: 'Anywhere in the U.S.' }
    ]
  },
  {
    key: 'schedule',
    path: '/find/schedule',
    nextPath: '/find/experience',
    step: 3,
    question: 'What schedule works best?',
    options: [
      { value: 'Full-time', label: 'Full-time' },
      { value: 'Part-time', label: 'Part-time' },
      { value: 'Flexible / any', label: 'Flexible / any' }
    ]
  },
  {
    key: 'experience',
    path: '/find/experience',
    nextPath: '/find/results',
    step: 4,
    question: 'What is your experience level?',
    options: [
      { value: 'No experience / entry level', label: 'No experience / entry level' },
      { value: 'Some experience', label: 'Some experience' },
      { value: 'Experienced', label: 'Experienced' }
    ]
  }
] as const;

export type MatcherQuestion = (typeof matcherQuestions)[number];
export type MatcherKey = MatcherQuestion['key'];
export type MatcherAnswers = Partial<Record<MatcherKey, string>>;

export function questionFor(key: MatcherKey) {
  return matcherQuestions.find((question) => question.key === key);
}

export function optionLabel(key: MatcherKey, value?: string) {
  const question = questionFor(key);
  return question?.options.find((option) => option.value === value)?.label || value || '';
}
