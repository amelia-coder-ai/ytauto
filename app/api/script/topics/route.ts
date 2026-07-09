import { NextRequest, NextResponse } from "next/server";

import { callAIWithFallback } from "@/lib/ai";
import { supabaseAdmin, type NicheProfileRow } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface TopicsBody {
  nicheId?: string;
}

interface TopicsAIResult {
  topics: string[];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Normalize for duplicate detection across script titles. */
function normalizeTopic(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildSystemPrompt(profile: NicheProfileRow): string {
  const tone = profile.tone ?? "conversational";
  const style = profile.style ?? "educational";
  const audience = profile.audience_type ?? "general YouTube viewers";
  const keywords = asStringArray(profile.keywords).join(", ") || "none";
  const topics =
    asStringArray(profile.common_topics).join(", ") || "none";
  const hooks = asStringArray(profile.hooks).join("; ") || "none";

  return (
    `You are a viral YouTube content strategist.\n` +
    `Tone & style: ${tone}, ${style}\n` +
    `Audience: ${audience}\n` +
    `Keywords: ${keywords}\n` +
    `Common topics: ${topics}\n` +
    `Hook patterns: ${hooks}`
  );
}

function buildUserPrompt(usedTopics: string[]): string {
  const exclusion =
    usedTopics.length > 0
      ? `\n\nAlready used topics (DO NOT repeat or rephrase these):\n${usedTopics.map((t) => `- ${t}`).join("\n")}`
      : "";

  return (
    `Generate exactly 5 viral YouTube video topic ideas for this niche.\n` +
    `Each topic should be a compelling video title (max 200 characters) that would get high CTR.\n` +
    `Mix formats: how-to, listicle, myth-busting, story-driven, and contrarian takes.\n` +
    `Return strict JSON only (no markdown, no code fences):\n` +
    `{\n  "topics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"]\n}` +
    exclusion
  );
}

function parseTopicsResponse(raw: string): string[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  const parsed = JSON.parse(cleaned) as TopicsAIResult;
  if (!Array.isArray(parsed.topics)) {
    throw new Error("AI response missing topics array");
  }

  return parsed.topics
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 200);
}

function dedupeTopics(
  candidates: string[],
  usedNormalized: Set<string>
): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const topic of candidates) {
    const key = normalizeTopic(topic);
    if (!key || usedNormalized.has(key) || seen.has(key)) continue;
    seen.add(key);
    unique.push(topic);
    if (unique.length >= 5) break;
  }

  return unique;
}

export async function POST(req: NextRequest) {
  let body: TopicsBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { nicheId } = body;

  if (!nicheId || typeof nicheId !== "string") {
    return NextResponse.json(
      { error: "`nicheId` (string) is required" },
      { status: 400 }
    );
  }

  const [{ data: niche }, { data: profile }, { data: existingScripts }] =
    await Promise.all([
      supabaseAdmin
        .from("niches")
        .select("id, name, status")
        .eq("id", nicheId)
        .single(),
      supabaseAdmin
        .from("niche_profile")
        .select(
          "id, niche_id, tone, style, common_topics, hooks, keywords, audience_type, content_structure_pattern, created_at"
        )
        .eq("niche_id", nicheId)
        .maybeSingle(),
      supabaseAdmin
        .from("scripts")
        .select("title")
        .eq("niche_id", nicheId)
        .in("status", ["generating", "ready", "pending"]),
    ]);

  if (!niche) {
    return NextResponse.json({ error: "Niche not found" }, { status: 404 });
  }

  if (!profile) {
    return NextResponse.json(
      { error: "Niche profile not found. Train the niche first." },
      { status: 404 }
    );
  }

  const nicheProfile = profile as NicheProfileRow;
  nicheProfile.common_topics = asStringArray(profile.common_topics);
  nicheProfile.hooks = asStringArray(profile.hooks);
  nicheProfile.keywords = asStringArray(profile.keywords);

  const usedTopics = (existingScripts ?? [])
    .map((s) => (typeof s.title === "string" ? s.title.trim() : ""))
    .filter(Boolean);

  const usedNormalized = new Set(usedTopics.map(normalizeTopic));

  const systemPrompt = buildSystemPrompt(nicheProfile);
  const userPrompt = buildUserPrompt(usedTopics);

  let aiContent: string;
  try {
    const aiResponse = await callAIWithFallback(userPrompt, systemPrompt);
    aiContent = aiResponse.content;
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI call failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!aiContent) {
    return NextResponse.json(
      { error: "AI returned empty content" },
      { status: 502 }
    );
  }

  let topics: string[];
  try {
    topics = dedupeTopics(parseTopicsResponse(aiContent), usedNormalized);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse AI topic suggestions", raw: aiContent },
      { status: 502 }
    );
  }

  // One retry if duplicates left us short
  if (topics.length < 5) {
    const retryPrompt = buildUserPrompt([...usedTopics, ...topics]);
    try {
      const retryResponse = await callAIWithFallback(retryPrompt, systemPrompt);
      if (retryResponse.content) {
        const more = dedupeTopics(
          parseTopicsResponse(retryResponse.content),
          new Set([
            ...Array.from(usedNormalized),
            ...topics.map(normalizeTopic),
          ])
        );
        topics = dedupeTopics([...topics, ...more], usedNormalized);
      }
    } catch {
      // Return partial list if retry fails
    }
  }

  return NextResponse.json({
    topics,
    usedTopicCount: usedTopics.length,
  });
}
