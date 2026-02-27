import { Queue } from 'bullmq';
import { getRedis } from '../config/redis';

let _queue: Queue | null = null;

export function getMessageQueue(): Queue {
  if (!_queue) {
    _queue = new Queue('message-processing', {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return _queue;
}
