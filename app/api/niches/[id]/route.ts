import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const nicheId = params?.id;
  if (!nicheId) {
    return NextResponse.json({ error: "Missing niche id" }, { status: 400 });
  }

  const { data: niche, error: nicheError } = await supabaseAdmin
    .from("niches")
    .select("id, name, description, status, created_at")
    .eq("id", nicheId)
    .single();

  if (nicheError) {
    return NextResponse.json(
      { error: "Failed to fetch niche", detail: nicheError.message },
      { status: 404 }
    );
  }

  const [{ data: profile }, { data: videos }] = await Promise.all([
    supabaseAdmin
      .from("niche_profile")
      .select(
        "tone, style, common_topics, hooks, keywords, audience_type, content_structure_pattern, created_at"
      )
      .eq("niche_id", nicheId)
      .maybeSingle(),
    supabaseAdmin
      .from("niche_videos")
      .select("id, youtube_url, title, created_at")
      .eq("niche_id", nicheId)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    niche,
    profile: profile ?? null,
    videos: videos ?? [],
  });
}

