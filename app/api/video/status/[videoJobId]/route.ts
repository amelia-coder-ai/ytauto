import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  { params }: { params: { videoJobId: string } }
) {
  const { videoJobId } = params;

  if (!videoJobId || typeof videoJobId !== 'string') {
    return NextResponse.json(
      { error: '`videoJobId` parameter is required' },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const res = await fetch(
      `${url}/rest/v1/video_jobs?select=id,status,completed_scenes,total_scenes,output_video_url,error_message&id=eq.${videoJobId}`,
      {
        headers: {
          apikey: key!,
          Authorization: `Bearer ${key!}`,
        },
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: 502 });
    }

    const rows = await res.json();
    const job = rows?.[0];

    if (!job) {
      return NextResponse.json(
        { error: 'Video job not found' },
        { status: 404 }
      );
    }

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
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
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
