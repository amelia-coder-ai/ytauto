import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ScriptScene {
  id: string;
  script_id: string;
  scene_number: number;
  scene_type: string;
  title: string;
  content: string;
  duration_seconds: number;
  notes: string | null;
  created_at: string;
}

interface ScriptRow {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  created_at: string;
  niche_id: string | null;
  niches: { id: string; name: string } | null;
  script_scenes: ScriptScene[];
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await fetch(
    `${url}/rest/v1/scripts?select=id,title,status,duration_minutes,created_at,niche_id,niches(id,name),script_scenes(id,script_id,scene_number,scene_type,title,content,duration_seconds,notes,created_at)&order=created_at.desc`,
    {
      headers: {
        apikey: key!,
        Authorization: `Bearer ${key!}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: 502 });
  }

  const data: ScriptRow[] = await res.json();

  const scripts = (data ?? []).map((row) => {
    const niche = row.niches;
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

  return NextResponse.json(
    { scripts },
    { headers: { "Cache-Control": "no-store" } }
  );
}
