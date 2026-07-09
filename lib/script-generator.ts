import { callAIWithFallback } from "@/lib/ai";
import {
  estimateWordCount,
  getSceneStructure,
  type SceneTemplate,
} from "@/lib/script-structure";
import {
  supabaseAdmin,
  type NicheProfileRow,
  type ScriptSceneRow,
} from "@/lib/supabase";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function buildSystemPrompt(profile: NicheProfileRow): string {
  const tone = profile.tone ?? "conversational";
  const style = profile.style ?? "educational";
  const audience = profile.audience_type ?? "general YouTube viewers";
  const keywords = asStringArray(profile.keywords).join(", ") || "none specified";
  const topics =
    asStringArray(profile.common_topics).join(", ") || "none specified";
  const hooks = asStringArray(profile.hooks).join("; ") || "none specified";
  const structure =
    profile.content_structure_pattern ?? "hook → problem → solution → CTA";

  return (
    `You are a YouTube scriptwriter. Write in this style: ${tone}, ${style}.\n` +
    `Target audience: ${audience}.\n` +
    `Use these keywords naturally: ${keywords}.\n` +
    `Channel niche context: ${topics}.\n` +
    `Preferred hook patterns: ${hooks}.\n` +
    `Typical content structure: ${structure}.`
  );
}

function buildScenePrompt(
  topic: string,
  template: SceneTemplate,
  sceneNumber: number,
  totalScenes: number
): string {
  const wordCount = estimateWordCount(template.duration_seconds);

  return (
    `Write the '${template.scene_type}' scene titled '${template.title}' for a YouTube video about: ${topic}\n` +
    `This is scene ${sceneNumber} of ${totalScenes}.\n` +
    `This scene should be ${template.duration_seconds} seconds long (~${wordCount} words).\n` +
    `Scene notes: ${template.notes}\n` +
    `Write ONLY the spoken script text. No labels, no stage directions.\n` +
    `Start directly with the content.`
  );
}

export async function runScriptGeneration(options: {
  scriptId: string;
  nicheProfile: NicheProfileRow;
  topic: string;
  durationMinutes: number;
}): Promise<void> {
  const { scriptId, nicheProfile, topic, durationMinutes } = options;
  const sceneTemplates = getSceneStructure(durationMinutes);
  const systemPrompt = buildSystemPrompt(nicheProfile);

  let failedSceneCount = 0;

  for (let index = 0; index < sceneTemplates.length; index++) {
    const template = sceneTemplates[index];
    const sceneNumber = index + 1;
    const userPrompt = buildScenePrompt(
      topic,
      template,
      sceneNumber,
      sceneTemplates.length
    );

    let content = "";
    let notes = template.notes;

    try {
      const aiResponse = await callAIWithFallback(userPrompt, systemPrompt, {
        reasoning: false,
        timeoutMs: 90_000,
      });
      content = aiResponse.content?.trim() ?? "";

      if (!content) {
        throw new Error("AI returned empty content");
      }
    } catch (err) {
      failedSceneCount += 1;
      const message =
        err instanceof Error ? err.message : "Scene generation failed";
      console.error(
        `[script] Scene ${sceneNumber}/${sceneTemplates.length} failed:`,
        message
      );
      notes = `GENERATION_FAILED: ${message}\n\n${template.notes}`;
      content = "[Scene could not be generated]";
    }

    const { error: sceneError } = await supabaseAdmin.from("script_scenes").insert({
      script_id: scriptId,
      scene_number: sceneNumber,
      scene_type: template.scene_type,
      title: template.title,
      content,
      duration_seconds: template.duration_seconds,
      notes,
    });

    if (sceneError) {
      failedSceneCount += 1;
      console.error(
        `[script] Scene ${sceneNumber} DB insert failed:`,
        sceneError.message
      );
    } else {
      console.log(
        `[script] Scene ${sceneNumber}/${sceneTemplates.length} saved for ${scriptId}`
      );
    }
  }

  const finalStatus =
    failedSceneCount === sceneTemplates.length ? "failed" : "ready";

  const { error: updateError } = await supabaseAdmin
    .from("scripts")
    .update({ status: finalStatus })
    .eq("id", scriptId);

  if (updateError) {
    console.error(
      `[script] Failed to update status for ${scriptId}:`,
      updateError.message
    );
    throw new Error(`Failed to update script status: ${updateError.message}`);
  }

  console.log(`[script] Status for ${scriptId} set to ${finalStatus}`);
}

function normalizeNicheProfile(profile: NicheProfileRow): NicheProfileRow {
  return {
    ...profile,
    common_topics: asStringArray(profile.common_topics),
    hooks: asStringArray(profile.hooks),
    keywords: asStringArray(profile.keywords),
  };
}

export async function regenerateScriptScene(
  sceneId: string
): Promise<ScriptSceneRow> {
  const { data: scene, error: sceneError } = await supabaseAdmin
    .from("script_scenes")
    .select(
      "id, script_id, scene_number, scene_type, title, content, duration_seconds, notes, created_at"
    )
    .eq("id", sceneId)
    .single();

  if (sceneError || !scene) {
    throw new Error("Scene not found");
  }

  const { data: script, error: scriptError } = await supabaseAdmin
    .from("scripts")
    .select("id, niche_id, title, duration_minutes")
    .eq("id", scene.script_id)
    .single();

  if (scriptError || !script) {
    throw new Error("Script not found");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("niche_profile")
    .select(
      "id, niche_id, tone, style, common_topics, hooks, keywords, audience_type, content_structure_pattern, created_at"
    )
    .eq("niche_id", script.niche_id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error("Niche profile not found");
  }

  const sceneTemplates = getSceneStructure(script.duration_minutes as number);
  const template = sceneTemplates[scene.scene_number - 1];

  if (!template) {
    throw new Error("Scene template not found");
  }

  const nicheProfile = normalizeNicheProfile(profile as NicheProfileRow);
  const systemPrompt = buildSystemPrompt(nicheProfile);
  const userPrompt = buildScenePrompt(
    script.title as string,
    template,
    scene.scene_number,
    sceneTemplates.length
  );

  let content = "";
  let notes = template.notes;

  try {
    const aiResponse = await callAIWithFallback(userPrompt, systemPrompt, {
      reasoning: false,
      timeoutMs: 90_000,
    });
    content = aiResponse.content?.trim() ?? "";

    if (!content) {
      throw new Error("AI returned empty content");
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Scene generation failed";
    notes = `GENERATION_FAILED: ${message}\n\n${template.notes}`;
    content = "[Scene could not be generated]";
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("script_scenes")
    .update({ content, notes })
    .eq("id", sceneId)
    .select(
      "id, script_id, scene_number, scene_type, title, content, duration_seconds, notes, created_at"
    )
    .single();

  if (updateError || !updated) {
    throw new Error("Failed to update scene");
  }

  return updated as ScriptSceneRow;
}
