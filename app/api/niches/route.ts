import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// One-shot migration: make user_id nullable since there's no auth yet.
// Runs once per process lifetime. If the Management API call fails, the
// console warning tells you exactly what SQL to run in the Supabase editor.
// ---------------------------------------------------------------------------
let migrationRan = false;

async function ensureUserIdNullable(): Promise<void> {
  if (migrationRan) return;
  migrationRan = true;

  // Extract project ref from the Supabase URL (e.g. vqbfsitujcdqhhzhqyew)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const match = url?.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match || !key) return;

  try {
    // Use the Management API (server-to-server, no CORS issues from a route)
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${match[1]}/sql`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "alter table if exists public.niches alter column user_id drop not null;",
        }),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    console.warn(
      "Auto-migration failed. Run this in the Supabase SQL Editor:\n" +
        "  ALTER TABLE public.niches ALTER COLUMN user_id DROP NOT NULL;\n"
    );
  }
}

export async function POST(req: NextRequest) {
  // Ensure the DB schema is compatible before inserting
  await ensureUserIdNullable();
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
