import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(
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
  cameraEffect?: string;
  cameraEffectMode?: string;
  overlayEffect?: string;
}

export const videoQueue = new Queue<VideoJobData>('video-render', {
  connection,
});
