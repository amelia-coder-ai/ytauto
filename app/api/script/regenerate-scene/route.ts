import { NextRequest, NextResponse } from "next/server";

import { regenerateScriptScene } from "@/lib/script-generator";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface RegenerateSceneBody {
  sceneId?: string;
}

export async function POST(req: NextRequest) {
  let body: RegenerateSceneBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sceneId } = body;

  if (!sceneId || typeof sceneId !== "string") {
    return NextResponse.json(
      { error: "`sceneId` (string) is required" },
      { status: 400 }
    );
  }

  try {
    const scene = await regenerateScriptScene(sceneId);
    return NextResponse.json({ scene });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Scene regeneration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
