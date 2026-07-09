import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { videoJobId, completedScenes, totalScenes, secret } = await req.json();

    if (!videoJobId || typeof completedScenes !== 'number') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    if (secret !== process.env.PROGRESS_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from('video_jobs')
      .update({
        completed_scenes: completedScenes,
        total_scenes: totalScenes,
        status: 'generating',
      })
      .eq('id', videoJobId);

    if (error) {
      console.error('[Progress] Failed to update:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Progress] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
