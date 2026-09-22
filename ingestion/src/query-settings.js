export function normalizeBatchSize(value = process.env.JOB_QUERY_BATCH_SIZE) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return 40;
  return Math.min(parsed, 100);
}

export function normalizeConcurrency(value = process.env.JOB_QUERY_CONCURRENCY) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return 2;
  return Math.min(parsed, 3);
}

export function nextRunHoursForResult({ failed = false, jobsSaved = 0 } = {}) {
  if (failed) return 6;
  if (jobsSaved >= 10) return 6;
  if (jobsSaved >= 3) return 12;
  if (jobsSaved >= 1) return 24;
  return 72;
}
