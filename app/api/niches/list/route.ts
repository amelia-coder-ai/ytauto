import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await fetch(
    `${url}/rest/v1/niches?select=id,name,description,status,created_at&order=created_at.desc`,
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
  return NextResponse.json(
    { niches: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

