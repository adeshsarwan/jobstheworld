import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '../..');
const rootDir = path.resolve(backendDir, '..');
const fallbackEnvPath = '/home/adesh/test/.env';

const candidates = [
  process.env.ENV_FILE,
  path.join(rootDir, '.env'),
  path.join(backendDir, '.env'),
  fallbackEnvPath
].filter(Boolean) as string[];

for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
    break;
  }
}

dotenv.config({ override: false });

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'job_board'
  }
};
