import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await fetch(
    `${url}/rest/v1/video_jobs?select=id,status,completed_scenes,total_scenes,output_video_url,error_message,created_at,script_id,scripts(title)&order=created_at.desc`,
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

  const data = await res.json();

  const jobs = (data ?? []).map((row: Record<string, unknown>) => {
    const scripts = row.scripts as { title?: string } | null;
    return {
      id: row.id,
      status: row.status,
      completedScenes: row.completed_scenes ?? 0,
      totalScenes: row.total_scenes ?? 0,
      outputVideoUrl: row.output_video_url ?? null,
      errorMessage: row.error_message ?? null,
      createdAt: row.created_at,
      scriptId: row.script_id,
      scriptTitle: scripts?.title ?? "Unknown script",
    };
  });

  return NextResponse.json(
    { jobs },
    { headers: { "Cache-Control": "no-store" } }
  );
}
