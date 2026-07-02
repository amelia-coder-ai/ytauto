import { NextRequest, NextResponse } from 'next/server';
import { videoQueue } from '@/lib/queue/video-queue';

export const dynamic = 'force-dynamic';

interface StartVideoBody {
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

export async function POST(req: NextRequest) {
  let body: StartVideoBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    videoJobId,
    scriptId,
    nicheName,
    imageIntervalSeconds,
    voice,
    ttsSpeed,
    imageWidth,
    imageHeight,
    subtitleSettings,
  } = body;

  // Validate required fields
  if (!videoJobId || typeof videoJobId !== 'string') {
    return NextResponse.json(
      { error: '`videoJobId` (string) is required' },
      { status: 400 }
    );
  }

  if (!scriptId || typeof scriptId !== 'string') {
    return NextResponse.json(
      { error: '`scriptId` (string) is required' },
      { status: 400 }
    );
  }

  if (!nicheName || typeof nicheName !== 'string') {
    return NextResponse.json(
      { error: '`nicheName` (string) is required' },
      { status: 400 }
    );
  }

  if (
    typeof imageIntervalSeconds !== 'number' ||
    imageIntervalSeconds <= 0
  ) {
    return NextResponse.json(
      { error: '`imageIntervalSeconds` must be a positive number' },
      { status: 400 }
    );
  }

  if (!voice || typeof voice !== 'string') {
    return NextResponse.json(
      { error: '`voice` (string) is required' },
      { status: 400 }
    );
  }

  if (typeof ttsSpeed !== 'number' || ttsSpeed <= 0) {
    return NextResponse.json(
      { error: '`ttsSpeed` must be a positive number' },
      { status: 400 }
    );
  }

  try {
    // Add job to queue
    await videoQueue.add(
      'render',
      {
        videoJobId,
        scriptId,
        nicheName,
        imageIntervalSeconds,
        voice,
        ttsSpeed,
        imageWidth,
        imageHeight,
        subtitleSettings,
      },
      {
        jobId: videoJobId,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    return NextResponse.json(
      {
        message: 'Video generation started',
        videoJobId,
      },
      { status: 202 }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to enqueue video job:', errorMsg);

    return NextResponse.json(
      { error: 'Failed to start video generation', detail: errorMsg },
      { status: 500 }
    );
  }
}
