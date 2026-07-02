import { NextRequest, NextResponse } from "next/server";

import { getSceneStructure } from "@/lib/script-structure";
import { getSupabaseAdmin, type ScriptSceneRow } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ScriptStatus = "pending" | "generating" | "ready" | "failed";
type SceneStatus = "pending" | "ready" | "failed";

type StatusScene = {
  scene_number: number;
  scene_type: string;
  title: string;
  content: string | null;
  duration_seconds: number;
  status: SceneStatus;
};

const SCENE_SELECT =
  "id, script_id, scene_number, scene_type, title, content, duration_seconds, notes, created_at";

function resolveSceneStatus(row: ScriptSceneRow): SceneStatus {
  if (row.notes?.startsWith("GENERATION_FAILED:")) return "failed";
  const content = row.content?.trim() ?? "";
  if (!content || content === "[Scene could not be generated]") return "failed";
  return "ready";
}

function buildStatusScenes(
  durationMinutes: number,
  sceneRows: ScriptSceneRow[]
): StatusScene[] {
  const templates = getSceneStructure(durationMinutes);
  const sceneByNumber = new Map(
    sceneRows.map((row) => [row.scene_number, row])
  );

  return templates.map((template, index) => {
    const sceneNumber = index + 1;
    const row = sceneByNumber.get(sceneNumber);

    if (!row) {
      return {
        scene_number: sceneNumber,
        scene_type: template.scene_type,
        title: template.title,
        content: null,
        duration_seconds: template.duration_seconds,
        status: "pending" as const,
      };
    }

    const status = resolveSceneStatus(row);

    return {
      scene_number: sceneNumber,
      scene_type: row.scene_type,
      title: row.title,
      content: status === "ready" ? row.content : row.content || null,
      duration_seconds: row.duration_seconds,
      status,
    };
  });
}

function resolveScriptStatus(
  dbStatus: string,
  scenes: StatusScene[]
): ScriptStatus {
  if (dbStatus === "ready" || dbStatus === "failed") {
    return dbStatus;
  }

  if (scenes.length === 0) {
    return dbStatus as ScriptStatus;
  }

  const allResolved = scenes.every(
    (scene) => scene.status === "ready" || scene.status === "failed"
  );

  if (!allResolved) {
    return dbStatus === "pending" ? "pending" : "generating";
  }

  return scenes.some((scene) => scene.status === "ready") ? "ready" : "failed";
}

async function fetchSceneRows(scriptId: string): Promise<ScriptSceneRow[]> {
  const admin = getSupabaseAdmin();
  const { data: directScenes, error: directError } = await admin
    .from("script_scenes")
    .select(SCENE_SELECT)
    .eq("script_id", scriptId)
    .order("scene_number", { ascending: true });

  if (!directError && directScenes && directScenes.length > 0) {
    return directScenes as ScriptSceneRow[];
  }

  const { data: script, error: embedError } = await admin
    .from("scripts")
    .select(`id, script_scenes ( ${SCENE_SELECT} )`)
    .eq("id", scriptId)
    .single();

  if (!embedError && script?.script_scenes) {
    const embedded = script.script_scenes as ScriptSceneRow[];
    if (embedded.length > 0) {
      return [...embedded].sort((a, b) => a.scene_number - b.scene_number);
    }
  }

  return (directScenes ?? []) as ScriptSceneRow[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { scriptId: string } }
) {
  const scriptId = params?.scriptId;

  if (!scriptId) {
    return NextResponse.json({ error: "Missing script id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: script, error: scriptError } = await admin
    .from("scripts")
    .select("id, status, duration_minutes")
    .eq("id", scriptId)
    .single();

  if (scriptError || !script) {
    return NextResponse.json(
      { error: "Script not found", detail: scriptError?.message },
      { status: 404 }
    );
  }

  const sceneRows = await fetchSceneRows(scriptId);
  const scenes = buildStatusScenes(script.duration_minutes as number, sceneRows);
  const totalScenes = scenes.length;
  const completedScenes = scenes.filter((s) => s.status === "ready").length;
  const percentComplete =
    totalScenes > 0 ? Math.round((completedScenes / totalScenes) * 100) : 0;

  let status = resolveScriptStatus(script.status as string, scenes);

  if (status !== script.status && script.status === "generating") {
    await admin
      .from("scripts")
      .update({ status })
      .eq("id", scriptId)
      .eq("status", "generating");
  }

  return NextResponse.json(
    {
      scriptId,
      status,
      scenes,
      completedScenes,
      totalScenes,
      percentComplete,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
