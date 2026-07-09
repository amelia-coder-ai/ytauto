import { NextRequest, NextResponse } from "next/server";
import { generateVideo } from "@/lib/video-generator";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface VideoGenerateBody {
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

export async function POST(req: NextRequest) {
  let body: VideoGenerateBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    videoJobId,
    scriptId,
    nicheName,
    imageIntervalSeconds,
    voice,
    ttsSpeed,
    imageWidth = 1920,
    imageHeight = 1080,
    cameraEffect = "none",
    cameraEffectMode = "same",
    overlayEffect = "none",
  } = body;

  // Validate required fields
  if (!videoJobId || typeof videoJobId !== "string") {
    return NextResponse.json(
      { error: "`videoJobId` (string) is required" },
      { status: 400 }
    );
  }

  if (!scriptId || typeof scriptId !== "string") {
    return NextResponse.json(
      { error: "`scriptId` (string) is required" },
      { status: 400 }
    );
  }

  if (!nicheName || typeof nicheName !== "string") {
    return NextResponse.json(
      { error: "`nicheName` (string) is required" },
      { status: 400 }
    );
  }

  if (
    typeof imageIntervalSeconds !== "number" ||
    imageIntervalSeconds <= 0
  ) {
    return NextResponse.json(
      { error: "`imageIntervalSeconds` must be a positive number" },
      { status: 400 }
    );
  }

  if (!voice || typeof voice !== "string") {
    return NextResponse.json(
      { error: "`voice` (string) is required" },
      { status: 400 }
    );
  }

  if (typeof ttsSpeed !== "number" || ttsSpeed <= 0) {
    return NextResponse.json(
      { error: "`ttsSpeed` must be a positive number" },
      { status: 400 }
    );
  }

  try {
    const result = await generateVideo({
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
    });

    return NextResponse.json(
      {
        success: true,
        videoJobId,
        outputVideoUrl: result.outputVideoUrl,
        totalScenes: result.totalScenes,
      },
      { status: 200 }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("Video generation error:", err);

    return NextResponse.json(
      { error: "Video generation failed", detail: errorMsg },
      { status: 500 }
    );
  }
}
