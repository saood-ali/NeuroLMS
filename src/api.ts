import app from './app';

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`API running on port ${PORT}`);
    if (process.env.DEV_EXIT_AFTER_START === 'true') {
      server.close(() => process.exit(0));
    }
  });
}
