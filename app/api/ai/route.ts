import { NextRequest, NextResponse } from "next/server";

import { callAI, getProviderFromHeader, type AIProvider } from "@/lib/ai";

export async function POST(req: NextRequest) {
  // TODO: Validate the request body with a schema (e.g. zod).
  let body: {
    prompt?: string;
    systemPrompt?: string;
    provider?: AIProvider;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { prompt, systemPrompt, provider: bodyProvider } = body;

  // Resolve provider: body > header > env default
  const provider = bodyProvider ?? getProviderFromHeader(req);

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json(
      { error: "`prompt` (string) is required" },
      { status: 400 }
    );
  }

  try {
    const result = await callAI(
      prompt,
      systemPrompt ?? "",
      provider
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // callAI throws "not implemented yet" until the skeletons are filled in.
    return NextResponse.json({ error: message }, { status: 501 });
  }
}
