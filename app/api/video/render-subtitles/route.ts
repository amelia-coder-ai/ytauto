import { NextRequest, NextResponse } from 'next/server';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { renderSubtitles } from '@/lib/remotion-render';
import { SubtitleProps } from '@/remotion/SubtitleVideo';

export const maxDuration = 600;
export const dynamic = 'force-dynamic';

interface RenderSubtitlesBody {
  videoJobId: string;
  scenes: { content: string; durationSeconds: number }[];
  subtitleSettings: {
    highlightColor?: string;
    highlightScale?: number;
    fontSize?: number;
    position?: 'bottom' | 'center';
  };
  durationSeconds: number;
}

export async function POST(req: NextRequest) {
  let body: RenderSubtitlesBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { videoJobId, scenes, subtitleSettings, durationSeconds } = body;

  // Validate required fields
  if (!videoJobId || typeof videoJobId !== 'string') {
    return NextResponse.json(
      { error: '`videoJobId` (string) is required' },
      { status: 400 }
    );
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return NextResponse.json(
      { error: '`scenes` array is required and must not be empty' },
      { status: 400 }
    );
  }

  if (typeof durationSeconds !== 'number' || durationSeconds <= 0) {
    return NextResponse.json(
      { error: '`durationSeconds` must be a positive number' },
      { status: 400 }
    );
  }

  try {
    // Prepare subtitle props with defaults
    const subtitleProps: SubtitleProps = {
      scenes,
      totalDurationSeconds: durationSeconds,
      highlightColor: subtitleSettings?.highlightColor || '#68C0FF',
      highlightScale: subtitleSettings?.highlightScale || 115,
      fontSize: subtitleSettings?.fontSize || 48,
      position: subtitleSettings?.position || 'bottom',
    };

    // Create output directory
    const videoDir = join(process.cwd(), 'public', 'videos', videoJobId);
    await mkdir(videoDir, { recursive: true });

    const outputPath = join(videoDir, 'subtitles.mp4');

    // Render subtitles video
    await renderSubtitles(
      subtitleProps,
      outputPath,
      durationSeconds
    );

    const subtitleVideoPath = `/videos/${videoJobId}/subtitles.mp4`;

    return NextResponse.json(
      {
        success: true,
        subtitleVideoPath,
      },
      { status: 200 }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Subtitle rendering error:', err);

    return NextResponse.json(
      { error: 'Subtitle rendering failed', detail: errorMsg },
      { status: 500 }
    );
  }
}
