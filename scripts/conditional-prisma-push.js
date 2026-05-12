const { execSync } = require('child_process');

if (process.env.DATABASE_URL) {
  try {
    execSync('npx prisma db push', { stdio: 'inherit' });
  } catch (error) {
    let exitCode = 1;
    if (typeof error.status === 'number') {
      exitCode = error.status;
    } else if (typeof error.exitCode === 'number') {
      exitCode = error.exitCode;
    }
    process.exit(exitCode);
  }
} else {
  console.log('Skipping Prisma db push (DATABASE_URL is not set).');
}
