import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 900;
export const dynamic = 'force-dynamic';

interface AssembleVideoBody {
  videoJobId: string;
  subtitleVideoPath?: string;
}

interface VideoJob {
  id: string;
  output_video_url: string;
  subtitle_video_url?: string;
  watermark_url?: string;
  status: string;
}

export async function POST(req: NextRequest) {
  let body: AssembleVideoBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { videoJobId, subtitleVideoPath: bodySubtitlePath } = body;

  if (!videoJobId || typeof videoJobId !== 'string') {
    return NextResponse.json(
      { error: '`videoJobId` (string) is required' },
      { status: 400 }
    );
  }

  try {
    // Fetch video_job from Supabase
    const { data: videoJob, error: fetchError } = await supabaseAdmin
      .from('video_jobs')
      .select('*')
      .eq('id', videoJobId)
      .single();

    if (fetchError || !videoJob) {
      return NextResponse.json(
        { error: 'Video job not found', detail: fetchError?.message },
        { status: 404 }
      );
    }

    const job = videoJob as VideoJob;

    // Validate that required video paths exist
    if (!job.output_video_url) {
      return NextResponse.json(
        { error: 'Main video (output_video_url) not found for this job' },
        { status: 400 }
      );
    }

    // Accept subtitle path from request body or fall back to DB
    const subtitleUrl = bodySubtitlePath || job.subtitle_video_url;
    if (!subtitleUrl) {
      return NextResponse.json(
        { error: 'Subtitle video not found for this job' },
        { status: 400 }
      );
    }

    // Convert URL paths to file system paths
    const modalVideoPath = join(process.cwd(), 'public', job.output_video_url.replace(/^\//, ''));
    const subtitleVideoPath = join(process.cwd(), 'public', subtitleUrl.replace(/^\//, ''));

    const finalOutputPath = join(
      process.cwd(),
      'public',
      'videos',
      videoJobId,
      'final-assembled.mp4'
    );

    // Assemble the final video (dynamic import to avoid webpack bundling native modules)
    const { assembleFinalVideo } = await import('@/lib/video-assembler');
    await assembleFinalVideo({
      videoJobId,
      modalVideoPath,
      subtitleVideoPath,
      watermarkPath: job.watermark_url
        ? join(process.cwd(), 'public', job.watermark_url.replace(/^\//, ''))
        : undefined,
      outputPath: finalOutputPath,
    });

    const finalVideoUrl = `/videos/${videoJobId}/final-assembled.mp4`;

    // Update video_job with final video URL
    const { error: updateError } = await supabaseAdmin
      .from('video_jobs')
      .update({
        output_video_url: finalVideoUrl,
        subtitle_video_url: subtitleUrl,
        status: 'completed',
      })
      .eq('id', videoJobId);

    if (updateError) {
      console.error('Failed to update video_job:', updateError);
      return NextResponse.json(
        { error: 'Failed to update video_job after assembly' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        finalVideoUrl,
      },
      { status: 200 }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Video assembly error:', err);

    // Update video_job with error status
    try {
      await supabaseAdmin
        .from('video_jobs')
        .update({
          status: 'failed',
          error_message: `Assembly failed: ${errorMsg}`,
        })
        .eq('id', videoJobId);
    } catch {} // ignore cleanup error

    return NextResponse.json(
      { error: 'Video assembly failed', detail: errorMsg },
      { status: 500 }
    );
  }
}
