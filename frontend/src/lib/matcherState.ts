import type { MatcherAnswers, MatcherKey } from '../config/matcherQuestions';

const storageKey = 'job-guide-match.answers';

export function readAnswers(): MatcherAnswers {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as MatcherAnswers : {};
  } catch {
    return {};
  }
}

export function writeAnswer(key: MatcherKey, value: string) {
  if (typeof window === 'undefined') return;
  const answers = readAnswers();
  answers[key] = value;
  window.sessionStorage.setItem(storageKey, JSON.stringify(answers));
}

export function writeAnswers(answers: MatcherAnswers) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(storageKey, JSON.stringify(answers));
}
