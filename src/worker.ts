import { Worker, Job } from 'bullmq';
import { createRedisConnection } from './db/redis';

console.log('Starting BullMQ worker process...');

// Register the worker for the lecture-ai-pipeline queue
const lectureAiWorker = new Worker(
  'lecture-ai-pipeline',
  async (job: Job) => {
    console.log(`Processing job ${job.id} of type ${job.name}...`);
    // Placeholder logic until we finalize the AI pipeline details 
    return { status: 'completed', message: 'Placeholder processor executed.' };
  },
  {
    connection: createRedisConnection(),
  }
);

lectureAiWorker.on('completed', (job) => {
  console.log(`Job ${job.id} has completed!`);
});

lectureAiWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} has failed with ${err.message}`);
});

console.log('Worker is listening for jobs on "lecture-ai-pipeline" queue.');

if (process.env.WORKER_EXIT_AFTER_START === 'true') {
  console.log('WORKER_EXIT_AFTER_START is set. Exiting worker deterministically.');
  process.exit(0);
}

