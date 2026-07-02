import { NextResponse } from "next/server";

import { supabaseAdmin, type ScriptSceneRow } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ScriptListRow = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  created_at: string;
  niche_id: string | null;
  niches: { id: string; name: string } | { id: string; name: string }[] | null;
  script_scenes: ScriptSceneRow[];
};

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("scripts")
    .select(
      `
      id,
      title,
      status,
      duration_minutes,
      created_at,
      niche_id,
      niches ( id, name ),
      script_scenes (
        id,
        script_id,
        scene_number,
        scene_type,
        title,
        content,
        duration_seconds,
        notes,
        created_at
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch scripts", detail: error.message },
      { status: 500 }
    );
  }

  const scripts = ((data ?? []) as ScriptListRow[]).map((row) => {
    const niche = Array.isArray(row.niches) ? row.niches[0] : row.niches;
    const scenes = [...(row.script_scenes ?? [])].sort(
      (a, b) => a.scene_number - b.scene_number
    );

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      durationMinutes: row.duration_minutes,
      createdAt: row.created_at,
      nicheId: row.niche_id,
      nicheName: niche?.name ?? "Unknown niche",
      sceneCount: scenes.length,
      scenes,
    };
  });

  return NextResponse.json({ scripts });
}
