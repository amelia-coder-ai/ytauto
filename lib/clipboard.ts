import type { ScriptSceneRow } from "@/lib/supabase";

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function sceneTypeLabel(type: string): string {
  if (type === "hook") return "Hook";
  if (type === "intro") return "Intro";
  if (type === "outro") return "Outro";
  if (type === "transition") return "Transition";
  return "Section";
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy fallback.
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function formatScriptForCopy(scenes: ScriptSceneRow[]): string {
  const sorted = [...scenes].sort((a, b) => a.scene_number - b.scene_number);

  return sorted
    .filter((scene) => scene.content?.trim())
    .map((scene) => {
      const label = sceneTypeLabel(scene.scene_type);
      const words = countWords(scene.content);
      const header = `=== SCENE ${scene.scene_number}: ${scene.title || label} ===`;
      const meta = `[${scene.duration_seconds} seconds · ${words} words]`;
      return `${header}\n${meta}\n\n${scene.content.trim()}`;
    })
    .join("\n\n");
}
