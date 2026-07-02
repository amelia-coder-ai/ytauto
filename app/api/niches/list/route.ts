import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("niches")
    .select("id, name, description, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch niches", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ niches: data ?? [] });
}

