import 'dotenv/config';
import { Worker } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { generateVideo } from '@/lib/video-generator';
import { VideoJobData } from './video-queue';

import Redis from 'ioredis';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const connection = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
  }
);

export const videoWorker = new Worker<VideoJobData>(
  'video-render',
  async (job) => {
    const { videoJobId, scriptId, nicheName, imageIntervalSeconds, voice, ttsSpeed, imageWidth, imageHeight, cameraEffect, cameraEffectMode, overlayEffect } = job.data;

    try {
      console.log(`[Worker] Starting video generation for job ${videoJobId}`);
      await job.updateProgress(0);

      const result = await generateVideo(
        {
          videoJobId,
          scriptId,
          nicheName,
          imageIntervalSeconds,
          voice,
          ttsSpeed,
          imageWidth,
          imageHeight,
          cameraEffect,
          cameraEffectMode,
          overlayEffect,
        },
        (completed, total) => {
          const pct = total > 0 ? Math.round((completed / total) * 90) : 0;
          job.updateProgress(pct);
        }
      );

      // Mark the job as ready now that the video file is saved
      const { error: updateError } = await supabaseAdmin
        .from('video_jobs')
        .update({
          status: 'ready',
          output_video_url: result.outputVideoUrl,
        })
        .eq('id', videoJobId);

      if (updateError) {
        throw new Error(`Failed to update final status: ${updateError.message}`);
      }

      await job.updateProgress(100);
      console.log(`[Worker] Video generated: ${result.outputVideoUrl}`);
      return { success: true, videoJobId, finalUrl: result.outputVideoUrl };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Error for job ${videoJobId}:`, errorMsg);

      // Update video_job with error status
      try {
        await supabaseAdmin
          .from('video_jobs')
          .update({ status: 'failed', error_message: errorMsg })
          .eq('id', videoJobId);
      } catch (e) {
        console.error(`[Worker] Failed to update error status for ${videoJobId}:`, e);
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 10 * 60 * 1000,
    stalledInterval: 5 * 60 * 1000,
  }
);

videoWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

videoWorker.on('failed', (job, err) => {
  console.log(
    `[Worker] Job ${job?.id} failed with error: ${err.message}`
  );
});
