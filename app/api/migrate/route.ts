import { NextResponse } from "next/server";

/**
 * POST /api/migrate
 *
 * One-shot DB migrations that can't run via the schema.sql file alone.
 * Hit this endpoint once after deploying schema changes.
 */
export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const match = url?.match(/https:\/\/([^.]+)\.supabase\.co/);

  if (!match || !key) {
    return NextResponse.json(
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const projectRef = match[1];
  const results: string[] = [];
  let allOk = true;

  const migrations = [
    {
      name: "niches.user_id nullable",
      sql: "alter table if exists public.niches alter column user_id drop not null;",
    },
    {
      name: "niche_profile audience_type + content_structure_pattern",
      sql: `
        alter table if exists public.niche_profile
          add column if not exists audience_type text,
          add column if not exists content_structure_pattern text;
      `,
    },
  ];

  for (const m of migrations) {
    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/sql`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: m.sql }),
        }
      );

      if (res.ok) {
        results.push(`OK: ${m.name}`);
      } else {
        const body = await res.text().catch(() => "");
        results.push(`FAILED (${res.status}): ${m.name} — ${body}`);
        allOk = false;
      }
    } catch (err) {
      results.push(
        `FAILED: ${m.name} — ${err instanceof Error ? err.message : String(err)}`
      );
      allOk = false;
    }
  }

  return NextResponse.json(
    { ok: allOk, results },
    { status: allOk ? 200 : 500 }
  );
}
