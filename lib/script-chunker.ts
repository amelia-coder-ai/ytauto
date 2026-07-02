import { ScriptSceneRow } from "./supabase";

export interface ScriptChunk {
  slotIndex: number;
  scriptChunk: string;
  imagePrompt: string;
}

export interface ModalScene {
  narration: string;
  image_prompt: string;
}

/**
 * Chunks a script's scenes into image intervals.
 * Each chunk spans imageIntervalSeconds of content.
 */
export function chunkScript(
  scenes: ScriptSceneRow[],
  imageIntervalSeconds: number,
  nicheName: string
): ScriptChunk[] {
  const chunks: ScriptChunk[] = [];
  let currentSlotIndex = 0;
  let accumulatedSeconds = 0;
  let currentChunkContent = "";

  for (const scene of scenes) {
    const sceneSeconds = scene.duration_seconds;

    // If adding this scene exceeds the interval, finalize current chunk
    if (
      accumulatedSeconds > 0 &&
      accumulatedSeconds + sceneSeconds > imageIntervalSeconds
    ) {
      // Save the current chunk
      const imagePrompt = generateImagePrompt(
        currentChunkContent,
        nicheName
      );
      chunks.push({
        slotIndex: currentSlotIndex,
        scriptChunk: currentChunkContent.trim(),
        imagePrompt,
      });

      // Reset for next chunk
      currentSlotIndex++;
      accumulatedSeconds = 0;
      currentChunkContent = "";
    }

    // Add scene content to current chunk
    currentChunkContent += (currentChunkContent ? " " : "") + scene.content;
    accumulatedSeconds += sceneSeconds;
  }

  // Add the final chunk if there's remaining content
  if (currentChunkContent.trim()) {
    const imagePrompt = generateImagePrompt(
      currentChunkContent,
      nicheName
    );
    chunks.push({
      slotIndex: currentSlotIndex,
      scriptChunk: currentChunkContent.trim(),
      imagePrompt,
    });
  }

  return chunks;
}

/**
 * Converts chunks into the ModalScene format expected by Modal.
 */
export function formatChunksForModal(chunks: ScriptChunk[]): ModalScene[] {
  return chunks.map((chunk) => ({
    narration: chunk.scriptChunk,
    image_prompt: chunk.imagePrompt,
  }));
}

/**
 * Generates an image prompt based on script content and niche.
 * This is a placeholder; customize based on your needs.
 */
function generateImagePrompt(scriptContent: string, nicheName: string): string {
  // Extract key terms from the script
  const words = scriptContent.split(/\s+/).filter((w) => w.length > 3);
  const keyTerms = words.slice(0, 3).join(", ");

  return `${nicheName} video scene: ${keyTerms || scriptContent.substring(0, 50)}`;
}
