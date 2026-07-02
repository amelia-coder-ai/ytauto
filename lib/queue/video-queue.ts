import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
  }
);

export interface VideoJobData {
  videoJobId: string;
  scriptId: string;
  nicheName: string;
  imageIntervalSeconds: number;
  voice: string;
  ttsSpeed: number;
  imageWidth?: number;
  imageHeight?: number;
  subtitleSettings?: {
    highlightColor?: string;
    highlightScale?: number;
    fontSize?: number;
    position?: 'bottom' | 'center';
  };
}

export const videoQueue = new Queue<VideoJobData>('video-render', {
  connection,
});
