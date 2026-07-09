import { ScriptSceneRow } from "./supabase";
import { callAIWithFallback } from "@/lib/ai";

export type CameraEffect = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';

export type CameraEffectMode = 'same' | 'random';

export type OverlayEffect = 'none' | 'particles' | 'old-film';

export interface ScriptChunk {
  slotIndex: number;
  scriptChunk: string;
  imagePrompt: string;
  effect: CameraEffect;
}

export interface ModalScene {
  narration: string;
  image_prompt: string;
  effect: CameraEffect;
}

const ALL_CAMERA_EFFECTS: CameraEffect[] = [
  'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down',
];

export function pickCameraEffect(
  index: number,
  total: number,
  mode: CameraEffectMode,
  fixedEffect: CameraEffect,
): CameraEffect {
  if (mode === 'same' || total === 0) {
    return fixedEffect;
  }
  // random mode: pick deterministically based on index to keep it stable
  const seed = index * 2654435761 + 0xdeadbeef;
  const idx = Math.abs(seed) % ALL_CAMERA_EFFECTS.length;
  return ALL_CAMERA_EFFECTS[idx];
}

/**
 * Chunks a script's scenes into image intervals.
 * Each chunk spans up to imageIntervalSeconds of content.
 * Scenes longer than the interval are split proportionally across multiple chunks.
 */
export async function chunkScript(
  scenes: ScriptSceneRow[],
  imageIntervalSeconds: number,
  cameraEffect: CameraEffect = 'none',
  cameraEffectMode: CameraEffectMode = 'same',
  onProgress?: (completed: number, total: number) => void,
): Promise<ScriptChunk[]> {
  // Step 1: split content into timed chunks (sync)
  const rawChunks: { slotIndex: number; scriptChunk: string }[] = [];
  let slotIndex = 0;
  let accumulatedSeconds = 0;
  let currentWords: string[] = [];

  for (const scene of scenes) {
    const words = scene.content.split(/\s+/);
    const wordsPerSecond = words.length / scene.duration_seconds;
    let wordIndex = 0;

    while (wordIndex < words.length) {
      const remainingCapacity = imageIntervalSeconds - accumulatedSeconds;
      const wordsForCapacity = Math.max(
        1,
        Math.round(remainingCapacity * wordsPerSecond)
      );
      const wordsToTake = Math.min(wordsForCapacity, words.length - wordIndex);

      currentWords.push(...words.slice(wordIndex, wordIndex + wordsToTake));
      wordIndex += wordsToTake;
      accumulatedSeconds += wordsToTake / wordsPerSecond;

      if (accumulatedSeconds >= imageIntervalSeconds || wordIndex >= words.length) {
        const content = currentWords.join(" ").trim();
        if (content) {
          rawChunks.push({ slotIndex, scriptChunk: content });
          slotIndex++;
        }
        currentWords = [];
        accumulatedSeconds = 0;
      }
    }
  }

  // Step 2: generate all image prompts in parallel batches (concurrency limit)
  const batchSize = 5;
  const prompts: string[] = [];
  const totalBatches = Math.ceil(rawChunks.length / batchSize);
  for (let i = 0; i < rawChunks.length; i += batchSize) {
    const batch = rawChunks.slice(i, i + batchSize);
    const batchPrompts = await Promise.all(
      batch.map((chunk) => generateImagePrompt(chunk.scriptChunk))
    );
    prompts.push(...batchPrompts);
    onProgress?.(Math.min(i + batchSize, rawChunks.length), rawChunks.length);
  }

  // Step 3: combine with effects
  return rawChunks.map((chunk, i) => ({
    slotIndex: chunk.slotIndex,
    scriptChunk: chunk.scriptChunk,
    imagePrompt: prompts[i],
    effect: pickCameraEffect(i, rawChunks.length, cameraEffectMode, cameraEffect),
  }));
}

/**
 * Converts chunks into the ModalScene format expected by Modal.
 */
export function formatChunksForModal(chunks: ScriptChunk[]): ModalScene[] {
  return chunks.map((chunk) => ({
    narration: chunk.scriptChunk,
    image_prompt: chunk.imagePrompt,
    effect: chunk.effect,
  }));
}

/**
 * Fallback: extract visual keywords from content to build a text-free prompt.
 */
function buildFallbackPrompt(scriptContent: string): string {
  const words = scriptContent.split(/\s+/);
  const stopWords = new Set([
    "the","a","an","is","are","was","were","be","been","being","have","has","had",
    "do","does","did","will","would","could","should","may","might","shall","can",
    "to","of","in","for","on","with","at","by","from","as","into","through","during",
    "before","after","above","below","between","out","off","over","under","again",
    "further","then","once","here","there","when","where","why","how","all","each",
    "every","both","few","more","most","other","some","such","no","nor","not","only",
    "own","same","so","than","too","very","just","because","but","and","or","if",
    "while","about","up","like","this","that","it","its","you","your","we","our",
    "they","them","their","he","him","his","she","her","what","which","who","these",
    "those","not","don't","doesn't","didn't","won't","can't","isn't","aren't",
  ]);
  const keywords = words
    .map((w) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ""))
    .filter((w) => w.length > 3 && !stopWords.has(w.toLowerCase()))
    .slice(0, 8);

  const visualDesc = keywords.length >= 3
    ? `Scene featuring ${keywords.join(", ")}`
    : `Cinematic scene`;

  return `${visualDesc}, cinematic 4K, dramatic lighting, photorealistic, no text, no watermarks, no subtitles, no words, no captions, no letters`;
}

/**
 * Generates a structured image prompt using AI (Ollama → Gemini fallback).
 * Falls back to keyword-based prompt if all AI providers fail.
 */
async function generateImagePrompt(scriptContent: string): Promise<string> {
  const systemPrompt = `You are a visual director for YouTube videos.
Given a script chunk, return ONLY a valid JSON object with NO extra text.

Rules for image_prompt:
- Describe ONLY what to show visually, NOT what is being said
- Never include any text, words, letters in the image description
- Make it cinematic and visually engaging

Return this exact JSON structure:
{
  "scene": "brief visual description",
  "main_subject": "who or what is shown with visual details",
  "action": "what subject is doing",
  "environment": "location and background",
  "camera": "angle and framing"
}`;

  const userPrompt = `Script chunk: "${scriptContent.substring(0, 500)}"
Return JSON only. No markdown.`;

  try {
    const res = await callAIWithFallback(userPrompt, systemPrompt, { reasoning: false, timeoutMs: 120_000 });
    const text = res.content.trim();

    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
        scene?: string;
        main_subject?: string;
        action?: string;
        environment?: string;
        camera?: string;
      };

      const parts = [parsed.scene, parsed.main_subject, parsed.action, parsed.environment, parsed.camera].filter(Boolean);
      if (parts.length > 0) {
        return [...parts, "cinematic 4K, dramatic lighting, photorealistic", "no text, no watermarks, no subtitles, no words, no captions, no letters"].join(", ");
      }
    }
  } catch (err) {
    console.warn("[generateImagePrompt] AI providers failed:", err);
  }

  console.warn("[generateImagePrompt] using fallback");
  return buildFallbackPrompt(scriptContent);
}
