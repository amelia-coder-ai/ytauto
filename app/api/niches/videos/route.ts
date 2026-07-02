import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  let body: {
    nicheId?: string;
    videos?: { youtube_url: string; title: string; transcript: string }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { nicheId, videos } = body;

  if (!nicheId || typeof nicheId !== "string") {
    return NextResponse.json(
      { error: "`nicheId` (string) is required" },
      { status: 400 }
    );
  }

  if (!Array.isArray(videos) || videos.length === 0) {
    return NextResponse.json(
      { error: "`videos` (non-empty array) is required" },
      { status: 400 }
    );
  }

  // Insert all videos for this niche
  const rows = videos.map((v) => ({
    niche_id: nicheId,
    youtube_url: v.youtube_url,
    title: v.title || null,
    transcript: v.transcript || null,
  }));

  const { error } = await supabaseAdmin.from("niche_videos").insert(rows);

  if (error) {
    console.error("Failed to insert niche_videos:", error);
    return NextResponse.json(
      { error: "Failed to save videos", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ saved: rows.length }, { status: 201 });
}
