import { NextRequest, NextResponse } from "next/server";

import { callAIWithFallback } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Shape of the AI response we instruct the model to return.
 */
interface NicheProfileAIResult {
  tone_and_style: string;
  top_recurring_topics: string[];
  hook_patterns: string[];
  high_frequency_keywords: string[];
  audience_type: string;
  content_structure_pattern: string;
}

const SYSTEM_PROMPT =
  "You are a YouTube content strategist. Analyze these video transcripts from the same niche channel.";

/** Rough char ceiling per transcript (~128k tokens). Each token ≈ 0.5 English chars.
 *  If a transcript exceeds this it is trimmed from the middle with bookends preserved. */
const MAX_CHARS_PER_TRANSCRIPT = 256_000;

function truncateTranscript(text: string, label: string): string {
  if (text.length <= MAX_CHARS_PER_TRANSCRIPT) return text;
  const half = Math.floor(MAX_CHARS_PER_TRANSCRIPT / 2);
  const head = text.slice(0, half);
  const tail = text.slice(text.length - half);
  return (
    head +
    `\n\n[... ${label} trimmed due to length — ${text.length.toLocaleString()} chars → ${MAX_CHARS_PER_TRANSCRIPT.toLocaleString()} chars ...]\n\n` +
    tail
  );
}

function buildUserPrompt(transcripts: string[]): string {
  const joinedTranscripts = transcripts
    .map((t, i) => {
      const label = `Transcript ${i + 1}`;
      return `[${label}]\n${truncateTranscript(t, label)}`;
    })
    .join("\n\n---\n\n");

  return `Analyze the following video transcripts from the same YouTube niche channel. Extract the following information and return it in **strict JSON format only** (no markdown, no commentary, no code fences — just the raw JSON object):

{
  "tone_and_style": "Describe the overall tone and style — e.g. formal, casual, educational, entertaining, or a mix.",
  "top_recurring_topics": ["Topic 1", "Topic 2", "..."],
  "hook_patterns": ["Example hook 1", "Example hook 2", "..."],
  "high_frequency_keywords": ["keyword1", "keyword2", "..."],
  "audience_type": "Describe the likely target audience.",
  "content_structure_pattern": "Describe how the videos are typically structured (e.g. hook → problem → solution → CTA)."
}

Transcripts:
${joinedTranscripts}`;
}

export async function POST(req: NextRequest) {
  // 1. Parse and validate the request body
  let body: { nicheId?: string; transcripts?: string[] };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { nicheId, transcripts } = body;

  if (!nicheId || typeof nicheId !== "string") {
    return NextResponse.json(
      { error: "`nicheId` (string) is required" },
      { status: 400 }
    );
  }

  if (
    !Array.isArray(transcripts) ||
    transcripts.length === 0 ||
    !transcripts.every((t) => typeof t === "string")
  ) {
    return NextResponse.json(
      { error: "`transcripts` (non-empty array of strings) is required" },
      { status: 400 }
    );
  }

  // 2. Call AI — primary provider with Ollama fallback
  const userPrompt = buildUserPrompt(transcripts);
  const userPromptTruncated = userPrompt.length > 60000
    ? userPrompt.slice(0, 30000) + "\n\n[...truncated...]\n\n" + userPrompt.slice(-30000)
    : userPrompt;

  let aiContent = "";
  let aiError: string | null = null;

  try {
    const res = await callAIWithFallback(userPromptTruncated, SYSTEM_PROMPT, { reasoning: false, timeoutMs: 120_000 });
    aiContent = res.content;
  } catch (err) {
    aiError = err instanceof Error ? err.message : "AI call failed";
    console.warn("[niche/analyze] AI failed:", aiError);
  }

  if (!aiContent) {
    return NextResponse.json(
      { error: aiError ?? "AI returned empty content" },
      { status: 502 }
    );
  }

  // 4. Parse the AI JSON response (strip potential code fences)
  let parsed: NicheProfileAIResult;
  try {
    const cleaned = aiContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    parsed = JSON.parse(cleaned) as NicheProfileAIResult;
  } catch {
    console.error("Failed to parse AI response as JSON:", aiContent);
    return NextResponse.json(
      { error: "Failed to parse AI response as JSON", raw: aiContent },
      { status: 502 }
    );
  }

  // Validate required fields are present
  const requiredFields: (keyof NicheProfileAIResult)[] = [
    "tone_and_style",
    "top_recurring_topics",
    "hook_patterns",
    "high_frequency_keywords",
    "audience_type",
    "content_structure_pattern",
  ];

  for (const field of requiredFields) {
    if (parsed[field] === undefined || parsed[field] === null) {
      return NextResponse.json(
        {
          error: `AI response is missing required field: ${field}`,
          raw: aiContent,
        },
        { status: 502 }
      );
    }
  }

  // 5. Save the niche profile to Supabase
  const [tone, style] = parsed.tone_and_style.includes(",")
    ? parsed.tone_and_style.split(",").map((s) => s.trim())
    : [parsed.tone_and_style, ""];

  try {
      const { error: upsertError } = await supabaseAdmin
      .from("niche_profile")
      .upsert({
        niche_id: nicheId,
        tone,
        style,
        common_topics: parsed.top_recurring_topics,
        hooks: parsed.hook_patterns,
        keywords: parsed.high_frequency_keywords,
        audience_type: parsed.audience_type,
        content_structure_pattern: parsed.content_structure_pattern,
      });

    if (upsertError) {
      console.error("Supabase niche_profile upsert error:", upsertError);
      return NextResponse.json(
        { error: "Failed to save niche profile", detail: upsertError.message },
        { status: 500 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Supabase niche_profile upsert error:", message);
    return NextResponse.json(
      { error: "Failed to save niche profile", detail: message },
      { status: 500 }
    );
  }

  // 6. Update the niche status to "ready"
  try {
      const { error: statusError } = await supabaseAdmin
      .from("niches")
      .update({ status: "ready" })
      .eq("id", nicheId);

    if (statusError) {
      console.error("Supabase niche status update error:", statusError);
      // Non-fatal — the profile was saved. Log and continue.
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Supabase niche status update error:", message);
    // Non-fatal — the profile was saved. Log and continue.
  }

  // 7. Return the parsed niche profile
  return NextResponse.json({
    nicheId,
    profile: {
      tone,
      style,
      tone_and_style: parsed.tone_and_style,
      top_recurring_topics: parsed.top_recurring_topics,
      hook_patterns: parsed.hook_patterns,
      high_frequency_keywords: parsed.high_frequency_keywords,
      audience_type: parsed.audience_type,
      content_structure_pattern: parsed.content_structure_pattern,
    },
    status: "ready",
  });
}
