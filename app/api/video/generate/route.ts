import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { supabaseAdmin } from "@/lib/supabase";
import { chunkScript, formatChunksForModal } from "@/lib/script-chunker";

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
    // Step 1: Fetch script scenes from Supabase
    const { data: scenes, error: scenesError } = await supabaseAdmin
      .from("script_scenes")
      .select("*")
      .eq("script_id", scriptId)
      .order("scene_number", { ascending: true });

    if (scenesError) {
      return NextResponse.json(
        { error: "Failed to fetch script scenes", detail: scenesError.message },
        { status: 500 }
      );
    }

    if (!scenes || scenes.length === 0) {
      return NextResponse.json(
        { error: "No scenes found for this script" },
        { status: 404 }
      );
    }

    // Step 2: Call chunkScript()
    const chunks = chunkScript(scenes, imageIntervalSeconds, nicheName);

    // Step 3: Call formatChunksForModal()
    const modalScenes = formatChunksForModal(chunks);

    // Step 4: Update video_job status to 'generating'
    const { error: updateStatusError } = await supabaseAdmin
      .from("video_jobs")
      .update({
        status: "generating",
        total_scenes: chunks.length,
      })
      .eq("id", videoJobId);

    if (updateStatusError) {
      console.error("Failed to update video_job status:", updateStatusError);
      return NextResponse.json(
        { error: "Failed to update video_job status" },
        { status: 500 }
      );
    }

    // Step 5: Insert all chunks into video_scenes table
    const videoSceneRows = chunks.map((chunk) => ({
      video_job_id: videoJobId,
      slot_index: chunk.slotIndex,
      script_chunk: chunk.scriptChunk,
      image_prompt: chunk.imagePrompt,
      status: "pending",
    }));

    const { error: insertScenesError } = await supabaseAdmin
      .from("video_scenes")
      .insert(videoSceneRows);

    if (insertScenesError) {
      console.error("Failed to insert video scenes:", insertScenesError);
      await supabaseAdmin
        .from("video_jobs")
        .update({
          status: "failed",
          error_message: "Failed to insert video scenes",
        })
        .eq("id", videoJobId);
      return NextResponse.json(
        { error: "Failed to insert video scenes" },
        { status: 500 }
      );
    }

    // Step 6: Call Modal.com endpoint with 30-minute timeout
    const modalEndpoint = process.env.MODAL_ENDPOINT_URL;
    if (!modalEndpoint) {
      const errorMsg = "MODAL_ENDPOINT_URL is not configured";
      await supabaseAdmin
        .from("video_jobs")
        .update({
          status: "failed",
          error_message: errorMsg,
        })
        .eq("id", videoJobId);
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000);

    let videoBuffer: Buffer;
    try {
      const response = await fetch(
        `${modalEndpoint}/generate-video`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            {
              scenes: modalScenes,
              voice: voice,
              tts_speed: ttsSpeed,
              image_width: imageWidth,
              image_height: imageHeight,
              return_base64: false,
            },
          ]),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        const errorMsg = `Modal API error: ${response.statusText} - ${errorBody}`;
        await supabaseAdmin
          .from("video_jobs")
          .update({
            status: "failed",
            error_message: errorMsg,
          })
          .eq("id", videoJobId);
        return NextResponse.json({ error: errorMsg }, { status: 500 });
      }

      // Step 7: Get video as binary buffer
      videoBuffer = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      clearTimeout(timeoutId);

      let errorMsg = "Unknown error";
      if (err instanceof DOMException && err.name === "AbortError") {
        errorMsg = "Generation timed out";
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }

      await supabaseAdmin
        .from("video_jobs")
        .update({
          status: "failed",
          error_message: errorMsg,
        })
        .eq("id", videoJobId);

      return NextResponse.json(
        { error: `Modal API call failed: ${errorMsg}` },
        { status: 500 }
      );
    }

    // Step 8: Save video to /public/videos/{videoJobId}/final.mp4
    const videoDir = join(process.cwd(), "public", "videos", videoJobId);
    await mkdir(videoDir, { recursive: true });

    const videoPath = join(videoDir, "final.mp4");
    await writeFile(videoPath, videoBuffer);

    const outputVideoUrl = `/videos/${videoJobId}/final.mp4`;

    // Step 9: Update video_job with final status
    const { error: updateCompleteError } = await supabaseAdmin
      .from("video_jobs")
      .update({
        status: "ready",
        output_video_url: outputVideoUrl,
        completed_scenes: chunks.length,
      })
      .eq("id", videoJobId);

    if (updateCompleteError) {
      console.error(
        "Failed to update video_job completion status:",
        updateCompleteError
      );
      return NextResponse.json(
        { error: "Failed to update video_job completion status" },
        { status: 500 }
      );
    }

    // Step 10: Return success response
    return NextResponse.json(
      {
        success: true,
        videoJobId,
        outputVideoUrl,
        totalScenes: chunks.length,
      },
      { status: 200 }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("Video generation error:", err);

    // Update video_job with error status
    await supabaseAdmin
      .from("video_jobs")
      .update({
        status: "failed",
        error_message: errorMsg,
      })
      .eq("id", videoJobId)
      .catch(() => {});

    return NextResponse.json(
      { error: "Video generation failed", detail: errorMsg },
      { status: 500 }
    );
  }
}
