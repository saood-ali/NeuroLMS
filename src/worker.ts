console.log('Worker started');

if (process.env.WORKER_EXIT_AFTER_START === 'true') {
  process.exit(0);
}

export {};

