import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { createDatabaseConfig, ensurePhaseOneSchema } from '../database/run-migrations.js';

export const pool = mysql.createPool(createDatabaseConfig());

export function sourceHash(apiSource, sourceId) {
  return crypto.createHash('sha256').update(`${apiSource}:${sourceId}`, 'utf8').digest('hex');
}

export async function ensureDatabaseSchema(connection) {
  await ensurePhaseOneSchema(connection);
}
