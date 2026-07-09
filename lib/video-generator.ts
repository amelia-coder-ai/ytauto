import { writeFile, mkdir, copyFile } from "fs/promises";
import { join } from "path";
import { supabaseAdmin } from "@/lib/supabase";
import {
  chunkScript,
  formatChunksForModal,
  CameraEffect,
  CameraEffectMode,
  OverlayEffect,
} from "@/lib/script-chunker";

export interface VideoGenerateInput {
  videoJobId: string;
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

export interface VideoGenerateResult {
  outputVideoUrl: string;
  totalScenes: number;
}

export async function generateVideo(
  input: VideoGenerateInput,
  onProgress?: (progress: number, total: number) => void,
): Promise<VideoGenerateResult> {
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
  } = input;

  const { data: scenes, error: scenesError } = await supabaseAdmin
    .from("script_scenes")
    .select("*")
    .eq("script_id", scriptId)
    .order("scene_number", { ascending: true });

  if (scenesError) {
    throw new Error(`Failed to fetch script scenes: ${scenesError.message}`);
  }

  if (!scenes || scenes.length === 0) {
    throw new Error("No scenes found for this script");
  }

  const chunks = await chunkScript(
    scenes,
    imageIntervalSeconds,
    cameraEffect,
    cameraEffectMode,
    onProgress,
  );

  const modalScenes = formatChunksForModal(chunks);

  const { error: updateStatusError } = await supabaseAdmin
    .from("video_jobs")
    .update({
      status: "generating",
      total_scenes: chunks.length,
    })
    .eq("id", videoJobId);

  if (updateStatusError) {
    throw new Error(
      `Failed to update video_job status: ${updateStatusError.message}`
    );
  }

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
    await supabaseAdmin
      .from("video_jobs")
      .update({
        status: "failed",
        error_message: "Failed to insert video scenes",
      })
      .eq("id", videoJobId);
    throw new Error(`Failed to insert video scenes: ${insertScenesError.message}`);
  }

  const skipModal = process.env.SKIP_MODAL === "true";
  const testVideoSource = process.env.TEST_VIDEO_SOURCE;

  let outputVideoUrl: string;

  if (skipModal && testVideoSource) {
    const sourceFile = join(process.cwd(), "public", testVideoSource, "final.mp4");
    console.log(`[DEV] SKIP_MODAL=true, copying from ${sourceFile}`);

    const targetDir = join(process.cwd(), "public", "videos", videoJobId);
    await mkdir(targetDir, { recursive: true });
    const targetFile = join(targetDir, "final.mp4");
    await copyFile(sourceFile, targetFile);

    outputVideoUrl = `/videos/${videoJobId}/final.mp4`;
    console.log(`[DEV] Copied to ${outputVideoUrl}`);
  } else {
    const modalEndpoint = process.env.MODAL_ENDPOINT_URL?.trim();
    if (
      !modalEndpoint ||
      modalEndpoint.includes("your-username--explainer-videos-flask-app")
    ) {
      const errorMsg =
        "MODAL_ENDPOINT_URL is not configured. Set it to your deployed Modal video generation endpoint.";
      await supabaseAdmin
        .from("video_jobs")
        .update({ status: "failed", error_message: errorMsg })
        .eq("id", videoJobId);
      throw new Error(errorMsg);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') || '';
    const progressSecret = process.env.PROGRESS_SECRET || 'dev-secret';
    const progressUrl = `${appUrl}/api/video/progress`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000);

    let videoBuffer: Buffer;
    try {
      const response = await fetch(`${modalEndpoint}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            scenes: modalScenes,
            voice: voice,
            tts_speed: ttsSpeed,
            image_width: imageWidth,
            image_height: imageHeight,
            overlay_effect: overlayEffect,
            return_base64: false,
            video_job_id: videoJobId,
            progress_url: progressUrl,
            progress_secret: progressSecret,
          },
        ]),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Modal API error: ${response.statusText} - ${errorBody}`);
      }

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
        .update({ status: "failed", error_message: errorMsg })
        .eq("id", videoJobId);

      throw new Error(`Modal API call failed: ${errorMsg}`);
    }

    const videoDir = join(process.cwd(), "public", "videos", videoJobId);
    await mkdir(videoDir, { recursive: true });
    const videoPath = join(videoDir, "final.mp4");
    await writeFile(videoPath, videoBuffer);

    outputVideoUrl = `/videos/${videoJobId}/final.mp4`;
  }

  const { error: updateCompleteError } = await supabaseAdmin
    .from("video_jobs")
    .update({
      status: "rendering",
      output_video_url: outputVideoUrl,
      completed_scenes: chunks.length,
    })
    .eq("id", videoJobId);

  if (updateCompleteError) {
    throw new Error(
      `Failed to update video_job completion status: ${updateCompleteError.message}`
    );
  }

  return { outputVideoUrl, totalScenes: chunks.length };
}
