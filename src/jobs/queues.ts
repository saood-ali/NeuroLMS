import { Queue } from 'bullmq';
import { createRedisConnection } from '../db/redis';

// Create the lecture AI pipeline queue
export const lectureAiQueue = new Queue('lecture-ai-pipeline', {
  connection: createRedisConnection(),
});
