import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin, getSupabaseAdmin } from "@/lib/supabase";

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const nicheId = params?.id;
  console.log("[DELETE niche] Received ID:", JSON.stringify(nicheId));

  if (!nicheId) {
    return NextResponse.json({ error: "Missing niche id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Debug: list all niche IDs to compare
  const { data: allNiches } = await admin
    .from("niches")
    .select("id, name");

  if (allNiches) {
    console.log("[DELETE niche] All niches in DB:", JSON.stringify(allNiches.map(n => ({ id: n.id, name: n.name }))));
  }

  // Verify niche exists
  const { data: existing, error: existingError } = await admin
    .from("niches")
    .select("id")
    .eq("id", nicheId)
    .maybeSingle();
  
  console.log("[DELETE niche] SELECT result:", JSON.stringify({ existing, existingError: existingError?.message }));

  if (existingError) {
    return NextResponse.json(
      { error: "Failed to verify niche", detail: existingError.message },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { error: "Niche not found", debug: { nicheId, dbIds: allNiches?.map(n => n.id) } },
      { status: 404 }
    );
  }

  // Delete related records (best effort)
  await admin.from("niche_videos").delete().eq("niche_id", nicheId);
  await admin.from("niche_profile").delete().eq("niche_id", nicheId);

  // Delete the niche
  const { error: nicheError } = await admin
    .from("niches")
    .delete()
    .eq("id", nicheId);

  if (nicheError) {
    return NextResponse.json(
      { error: "Failed to delete niche", detail: nicheError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

