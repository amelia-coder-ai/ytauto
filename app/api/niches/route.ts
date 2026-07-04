import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    description?: string;
    videos?: { youtube_url: string; title: string; transcript: string }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, videos } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "`name` (non-empty string) is required" },
      { status: 400 }
    );
  }

  // Insert into niches
  const { data, error } = await supabaseAdmin
    .from("niches")
    .insert({
      name: name.trim(),
      description: description?.trim() ?? null,
      status: "pending",
    })
    .select("id, name, description, status, created_at")
    .single();

  if (error) {
    console.error("Failed to create niche:", error);
    return NextResponse.json(
      { error: "Failed to create niche", detail: error.message },
      { status: 500 }
    );
  }

  // Persist videos to niche_videos if provided
  const nicheId = data.id;
  let savedVideoCount = 0;

  if (Array.isArray(videos) && videos.length > 0) {
    const rows = videos.map((v) => ({
      niche_id: nicheId,
      youtube_url: v.youtube_url,
      title: v.title || null,
      transcript: v.transcript || null,
    }));

    const { error: videosError } = await supabaseAdmin
      .from("niche_videos")
      .insert(rows);

    if (videosError) {
      console.error("Failed to insert niche_videos:", videosError);
      // Non-fatal: niche was created, videos failed
    } else {
      savedVideoCount = rows.length;
    }
  }

  return NextResponse.json(
    { ...data, savedVideos: savedVideoCount },
    { status: 201 }
  );
}
