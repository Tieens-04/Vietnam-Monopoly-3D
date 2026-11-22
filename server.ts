import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const bundledServerPath = path.join(rootDir, 'server.js');
const isDevWithTsx =
  process.env.NODE_ENV !== 'production' &&
  process.execArgv.some((arg) => arg.includes('tsx'));

if (process.env.NODE_ENV !== 'test') {
  if (!isDevWithTsx && fs.existsSync(bundledServerPath)) {
    await import(new URL('./server.js', import.meta.url).href);
  } else {
    await import(new URL('./src/server/appServer.ts', import.meta.url).href);
  }
}
