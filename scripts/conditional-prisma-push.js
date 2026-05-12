const { execSync } = require('child_process');

if (process.env.DATABASE_URL) {
  try {
    execSync('npx prisma db push', { stdio: 'inherit' });
  } catch (error) {
    const exitCode =
      typeof error.status === 'number'
        ? error.status
        : typeof error.exitCode === 'number'
          ? error.exitCode
          : 1;
    process.exit(exitCode);
  }
} else {
  console.log('Skipping Prisma db push (DATABASE_URL is not set).');
}
