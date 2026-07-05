import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { videoQueue } from '@/lib/queue/video-queue';
import { getSupabaseAdmin } from '@/lib/supabase';
import { CameraEffect, CameraEffectMode, OverlayEffect } from '@/lib/script-chunker';

export const dynamic = 'force-dynamic';

interface StartVideoBody {
  scriptId: string;
  nicheName: string;
  imageIntervalSeconds: number;
  voice: string;
  ttsSpeed: number;
  imageWidth?: number;
  imageHeight?: number;
  cameraEffect?: CameraEffect;
  cameraEffectMode?: CameraEffectMode;
  overlayEffect?: OverlayEffect;
}

export async function POST(req: NextRequest) {
  let body: StartVideoBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    scriptId,
    nicheName,
    imageIntervalSeconds,
    voice,
    ttsSpeed,
    imageWidth,
    imageHeight,
    cameraEffect = "none",
    cameraEffectMode = "same",
    overlayEffect = "none",
  } = body;

  // Validate required fields
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
    // Generate video job ID
    const videoJobId = randomUUID();

    // Create video_job record in Supabase
    const supabaseAdmin = getSupabaseAdmin();
    const { error: createError } = await supabaseAdmin.from('video_jobs').insert({
      id: videoJobId,
      status: 'pending',
      script_id: scriptId,
    });

    if (createError) {
      throw new Error(`Failed to create video job: ${createError.message}`);
    }

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
        cameraEffect,
        cameraEffectMode,
        overlayEffect,
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
