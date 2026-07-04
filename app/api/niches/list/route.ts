import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("niches")
    .select("id, name, description, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[niches/list] DB error:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch niches", detail: error.message },
      { status: 500 }
    );
  }

  console.log("[niches/list] returning", data?.length ?? 0, "niches");
  return NextResponse.json({ niches: data ?? [] });
}

