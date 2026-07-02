import { NextRequest, NextResponse } from "next/server";

import { runScriptGeneration } from "@/lib/script-generator";
import { supabaseAdmin, type NicheProfileRow } from "@/lib/supabase";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { scriptId: string } }
) {
  const scriptId = params?.scriptId;

  if (!scriptId) {
    return NextResponse.json({ error: "Missing script id" }, { status: 400 });
  }

  const { data: script, error: scriptError } = await supabaseAdmin
    .from("scripts")
    .select("id, niche_id, title, duration_minutes, status")
    .eq("id", scriptId)
    .single();

  if (scriptError || !script) {
    return NextResponse.json(
      { error: "Script not found", detail: scriptError?.message },
      { status: 404 }
    );
  }

  if (script.status !== "generating") {
    return NextResponse.json({
      scriptId,
      status: script.status,
      message: "Script is not in generating state",
    });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("niche_profile")
    .select(
      "id, niche_id, tone, style, common_topics, hooks, keywords, audience_type, content_structure_pattern, created_at"
    )
    .eq("niche_id", script.niche_id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabaseAdmin
      .from("scripts")
      .update({ status: "failed" })
      .eq("id", scriptId);

    return NextResponse.json(
      { error: "Niche profile not found" },
      { status: 404 }
    );
  }

  const nicheProfile = profile as NicheProfileRow;
  nicheProfile.common_topics = asStringArray(profile.common_topics);
  nicheProfile.hooks = asStringArray(profile.hooks);
  nicheProfile.keywords = asStringArray(profile.keywords);

  try {
    console.log(`[script] Starting run for ${scriptId}`);
    await runScriptGeneration({
      scriptId,
      nicheProfile,
      topic: script.title as string,
      durationMinutes: script.duration_minutes as number,
    });

    const { data: updated } = await supabaseAdmin
      .from("scripts")
      .select("status")
      .eq("id", scriptId)
      .single();

    return NextResponse.json({
      scriptId,
      status: updated?.status ?? "ready",
    });
  } catch (err) {
    console.error(`[script] Run failed for ${scriptId}:`, err);
    await supabaseAdmin
      .from("scripts")
      .update({ status: "failed" })
      .eq("id", scriptId);

    const message = err instanceof Error ? err.message : "Script generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
