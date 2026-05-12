const { execSync } = require('child_process');

if (process.env.DATABASE_URL) {
  try {
    execSync('npx prisma db push', { stdio: 'inherit' });
  } catch (error) {
    process.exit(typeof error.status === 'number' ? error.status : 1);
  }
} else {
  console.log('Skipping Prisma db push (DATABASE_URL is not set).');
}
