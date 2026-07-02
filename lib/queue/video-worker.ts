import { Worker } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { getVideoDuration } from '@/lib/video-assembler';
import { getSupabaseAdmin } from '@/lib/supabase';
import { VideoJobData } from './video-queue';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Use bullmq's internal redis to avoid version conflicts
import Redis from 'bullmq/node_modules/ioredis';

const connection = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
  }
);

export const videoWorker = new Worker<VideoJobData>(
  'video-render',
  async (job) => {
    const { videoJobId, scriptId, nicheName, imageIntervalSeconds, voice, ttsSpeed, imageWidth, imageHeight, subtitleSettings } = job.data;

    try {
      console.log(`[Worker] Starting video generation for job ${videoJobId}`);

      // Step 1: Fetch video_job from Supabase
      const { data: videoJob, error: fetchError } = await supabaseAdmin
        .from('video_jobs')
        .select('*')
        .eq('id', videoJobId)
        .single();

      if (fetchError || !videoJob) {
        throw new Error(`Failed to fetch video_job: ${fetchError?.message}`);
      }

      console.log(`[Worker] Fetched video_job for ${videoJobId}`);

      // Step 2: Call /api/video/generate (Modal video generation)
      console.log(`[Worker] Calling video/generate for ${videoJobId}`);
      const generateRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/video/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoJobId,
            scriptId,
            nicheName,
            imageIntervalSeconds,
            voice,
            ttsSpeed,
            imageWidth: imageWidth || 1920,
            imageHeight: imageHeight || 1080,
          }),
        }
      );

      if (!generateRes.ok) {
        throw new Error(
          `Video generation failed: ${generateRes.statusText} - ${await generateRes.text()}`
        );
      }

      const generateData = await generateRes.json();
      console.log(`[Worker] Modal video generated: ${generateData.outputVideoUrl}`);

      // Step 3: Get video duration
      const videoPath = `${process.cwd()}/public${generateData.outputVideoUrl}`;
      const duration = await getVideoDuration(videoPath);
      console.log(`[Worker] Video duration: ${duration}s`);

      // Step 4: Call /api/video/render-subtitles (Remotion rendering)
      console.log(`[Worker] Calling video/render-subtitles for ${videoJobId}`);

      // First, fetch script scenes to build subtitle content
      const { data: scenes, error: scenesError } = await supabaseAdmin
        .from('script_scenes')
        .select('*')
        .eq('script_id', scriptId)
        .order('scene_number', { ascending: true });

      if (scenesError || !scenes) {
        throw new Error(`Failed to fetch scenes: ${scenesError?.message}`);
      }

      const subtitleRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/video/render-subtitles`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoJobId,
            scenes: scenes.map((s) => ({
              content: s.content,
              durationSeconds: s.duration_seconds,
            })),
            subtitleSettings: subtitleSettings || {},
            durationSeconds: duration,
          }),
        }
      );

      if (!subtitleRes.ok) {
        throw new Error(
          `Subtitle rendering failed: ${subtitleRes.statusText} - ${await subtitleRes.text()}`
        );
      }

      const subtitleData = await subtitleRes.json();
      console.log(`[Worker] Subtitles rendered: ${subtitleData.subtitleVideoPath}`);

      // Update video_job with subtitle URL
      await supabaseAdmin
        .from('video_jobs')
        .update({ subtitle_video_url: subtitleData.subtitleVideoPath })
        .eq('id', videoJobId);

      // Step 5: Call /api/video/assemble (FFmpeg assembly)
      console.log(`[Worker] Calling video/assemble for ${videoJobId}`);
      const assembleRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/video/assemble`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoJobId }),
        }
      );

      if (!assembleRes.ok) {
        throw new Error(
          `Video assembly failed: ${assembleRes.statusText} - ${await assembleRes.text()}`
        );
      }

      const assembleData = await assembleRes.json();
      console.log(`[Worker] Final video assembled: ${assembleData.finalVideoUrl}`);

      // Step 6: Update video_job with final status
      const { error: updateError } = await supabaseAdmin
        .from('video_jobs')
        .update({
          status: 'ready',
          output_video_url: assembleData.finalVideoUrl,
        })
        .eq('id', videoJobId);

      if (updateError) {
        throw new Error(`Failed to update final status: ${updateError.message}`);
      }

      console.log(`[Worker] Video generation complete for ${videoJobId}`);
      return { success: true, videoJobId, finalUrl: assembleData.finalVideoUrl };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Error for job ${videoJobId}:`, errorMsg);

      // Update video_job with error status
      try {
        await supabaseAdmin
          .from('video_jobs')
          .update({
            status: 'failed',
            error_message: errorMsg,
          })
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
