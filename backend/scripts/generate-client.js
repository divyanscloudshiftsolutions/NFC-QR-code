const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Attempt to load dotenv if available in dependencies
try {
  const dotenvPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(dotenvPath)) {
    require('dotenv').config({ path: dotenvPath });
  }
} catch (e) {
  // Ignore dotenv errors if not installed/present
}

// Fallback placeholder DATABASE_URL to pass validation during CI/CD build pipelines
if (!process.env.DATABASE_URL) {
  console.log('[Prisma Builder] DATABASE_URL not set in environment. Injecting validation placeholder...');
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/placeholder_db?schema=public';
}

try {
  console.log('[Prisma Builder] Running prisma generate...');
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });
} catch (error) {
  console.error('[Prisma Builder] Generation failed:', error);
  process.exit(1);
}
