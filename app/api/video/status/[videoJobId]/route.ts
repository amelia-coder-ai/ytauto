import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface VideoJob {
  id: string;
  status: string;
  completed_scenes?: number;
  total_scenes?: number;
  output_video_url?: string;
  error_message?: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { videoJobId: string } }
) {
  const { videoJobId } = params;

  if (!videoJobId || typeof videoJobId !== 'string') {
    return NextResponse.json(
      { error: '`videoJobId` parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Fetch video_job from Supabase
    const { data: videoJob, error } = await supabaseAdmin
      .from('video_jobs')
      .select('*')
      .eq('id', videoJobId)
      .single();

    if (error || !videoJob) {
      return NextResponse.json(
        { error: 'Video job not found', detail: error?.message },
        { status: 404 }
      );
    }

    const job = videoJob as VideoJob;
    const completedScenes = job.completed_scenes || 0;
    const totalScenes = job.total_scenes || 0;
    const percentComplete =
      totalScenes > 0 ? Math.round((completedScenes / totalScenes) * 100) : 0;

    return NextResponse.json(
      {
        status: job.status,
        completedScenes,
        totalScenes,
        percentComplete,
        outputVideoUrl: job.output_video_url || null,
        errorMessage: job.error_message || null,
      },
      { status: 200 }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to fetch video status:', errorMsg);

    return NextResponse.json(
      { error: 'Failed to fetch video status', detail: errorMsg },
      { status: 500 }
    );
  }
}
