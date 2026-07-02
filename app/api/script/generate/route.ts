import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface GenerateScriptBody {
  nicheId?: string;
  topic?: string;
  durationMinutes?: number;
}

export async function POST(req: NextRequest) {
  let body: GenerateScriptBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { nicheId, topic, durationMinutes } = body;

  if (!nicheId || typeof nicheId !== "string") {
    return NextResponse.json(
      { error: "`nicheId` (string) is required" },
      { status: 400 }
    );
  }

  if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
    return NextResponse.json(
      { error: "`topic` (non-empty string) is required" },
      { status: 400 }
    );
  }

  if (
    typeof durationMinutes !== "number" ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 120
  ) {
    return NextResponse.json(
      { error: "`durationMinutes` must be between 1 and 120" },
      { status: 400 }
    );
  }

  const trimmedTopic = topic.trim();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("niche_profile")
    .select("id")
    .eq("niche_id", nicheId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: "Failed to fetch niche profile", detail: profileError.message },
      { status: 500 }
    );
  }

  if (!profile) {
    return NextResponse.json(
      { error: "Niche profile not found. Train the niche first." },
      { status: 404 }
    );
  }

  const { data: script, error: scriptError } = await supabaseAdmin
    .from("scripts")
    .insert({
      niche_id: nicheId,
      title: trimmedTopic,
      duration_minutes: Math.round(durationMinutes),
      status: "generating",
    })
    .select("id")
    .single();

  if (scriptError || !script) {
    return NextResponse.json(
      { error: "Failed to create script", detail: scriptError?.message },
      { status: 500 }
    );
  }

  const scriptId = script.id as string;

  return NextResponse.json({ scriptId, status: "generating" }, { status: 202 });
}
