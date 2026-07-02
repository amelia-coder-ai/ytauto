/**
 * Multi-model AI abstraction layer.
 *
 * A single entry point — `callAI` — routes a prompt to one of these providers:
 * Ollama (local - development), Google Gemini, OpenAI GPT, or Anthropic Claude.
 * Each provider has its own implementation below.
 */

export type AIProvider = "ollama" | "gemini" | "openai" | "claude";

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** Provider resolved from DEFAULT_AI_PROVIDER, falling back to Ollama. */
const DEFAULT_PROVIDER: AIProvider = isAIProvider(
  process.env.DEFAULT_AI_PROVIDER
)
  ? (process.env.DEFAULT_AI_PROVIDER as AIProvider)
  : "ollama";

/** API keys keyed by provider. */
const API_KEYS: Record<AIProvider, string | undefined> = {
  ollama: undefined, // No API key needed — Ollama runs locally.
  gemini: process.env.GEMINI_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  claude: process.env.ANTHROPIC_API_KEY,
};

/** Default model per provider (free/low-cost tiers). */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  ollama: process.env.OLLAMA_MODEL ?? "llama3.2",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  claude: "claude-3-5-sonnet-20241022",
};

/** Base URL for Ollama. Defaults to http://localhost:11434. */
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

/**
 * Call an AI model with a user prompt and a system prompt.
 *
 * @param prompt       The user message.
 * @param systemPrompt Instructions that shape the model's behavior.
 * @param provider     Which provider to use. Defaults to DEFAULT_AI_PROVIDER.
 */
export async function callAI(
  prompt: string,
  systemPrompt: string,
  provider: AIProvider = DEFAULT_PROVIDER
): Promise<AIResponse> {
  // Ollama does not require an API key — it runs on your local machine.
  if (provider === "ollama") {
    return callOllama(prompt, systemPrompt);
  }

  const apiKey = API_KEYS[provider];

  if (!apiKey) {
    throw new Error(
      `Missing API key for provider "${provider}". Set the corresponding environment variable ` +
      `(GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY).`
    );
  }

  switch (provider) {
    case "gemini":
      return callGemini(prompt, systemPrompt, apiKey);
    case "openai":
      return callOpenAI(prompt, systemPrompt, apiKey);
    case "claude":
      return callClaude(prompt, systemPrompt, apiKey);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported AI provider: ${exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

/** Ollama (local development — no API key needed). */
async function callOllama(
  prompt: string,
  systemPrompt: string
): Promise<AIResponse> {
  const model = DEFAULT_MODELS.ollama;
  const url = `${OLLAMA_BASE_URL}/api/chat`;

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    stream: false,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Ollama API error (${response.status}): ${errorText}`
    );
  }

  const json = await response.json();

  const content: string = json.message?.content ?? "";

  const usage =
    json.eval_count !== undefined || json.prompt_eval_count !== undefined
      ? {
          promptTokens: json.prompt_eval_count as number | undefined,
          completionTokens: json.eval_count as number | undefined,
          totalTokens:
            ((json.prompt_eval_count ?? 0) + (json.eval_count ?? 0)) as
              | number
              | undefined,
        }
      : undefined;

  return { content, provider: "ollama", model, usage };
}

/** Google Gemini. */
async function callGemini(
  prompt: string,
  systemPrompt: string,
  apiKey: string
): Promise<AIResponse> {
  const model = DEFAULT_MODELS.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API error (${response.status}): ${errorText}`
    );
  }

  const json = await response.json();

  const content =
    json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const usage = json.usageMetadata
    ? {
        promptTokens: json.usageMetadata.promptTokenCount,
        completionTokens: json.usageMetadata.candidatesTokenCount,
        totalTokens: json.usageMetadata.totalTokenCount,
      }
    : undefined;

  return { content, provider: "gemini", model, usage };
}

/** OpenAI GPT. */
async function callOpenAI(
  prompt: string,
  systemPrompt: string,
  apiKey: string
): Promise<AIResponse> {
  const model = DEFAULT_MODELS.openai;
  // TODO: Implement OpenAI Chat Completions API call.
  //   - POST https://api.openai.com/v1/chat/completions
  //     with Authorization: Bearer {apiKey}
  //   - Body: { model, messages: [
  //       { role: "system", content: systemPrompt },
  //       { role: "user", content: prompt },
  //     ] }
  //   - Parse `choices[0].message.content` into `content`.
  //   - Normalize `usage` (prompt_tokens/completion_tokens/total_tokens).
  void prompt;
  void systemPrompt;
  void apiKey;
  throw new Error(`callOpenAI(${model}) not implemented yet`);
}

/** Anthropic Claude. */
async function callClaude(
  prompt: string,
  systemPrompt: string,
  apiKey: string
): Promise<AIResponse> {
  const model = DEFAULT_MODELS.claude;
  // TODO: Implement Anthropic Messages API call.
  //   - POST https://api.anthropic.com/v1/messages
  //   - Headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01",
  //                "content-type": "application/json" }
  //   - Body: { model, system: systemPrompt,
  //             messages: [{ role: "user", content: prompt }], max_tokens: 1024 }
  //   - Parse `content[0].text` into `content`.
  //   - Normalize `usage` (input_tokens/output_tokens).
  void prompt;
  void systemPrompt;
  void apiKey;
  throw new Error(`callClaude(${model}) not implemented yet`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAIProvider(value: string | undefined): value is AIProvider {
  return value === "ollama" || value === "gemini" || value === "openai" || value === "claude";
}

/**
 * Extract the preferred AI provider from the `x-ai-provider` request header.
 * Falls back to DEFAULT_PROVIDER if the header is missing or invalid.
 */
export function getProviderFromHeader(request: Request): AIProvider {
  const header = request.headers.get("x-ai-provider");
  if (header && isAIProvider(header)) {
    return header;
  }
  return DEFAULT_PROVIDER;
}

// ---------------------------------------------------------------------------
// OpenRouter (used for viral topic + script generation)
// ---------------------------------------------------------------------------

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:free";

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content?: string | null;
  reasoning?: string | null;
  reasoning_details?: unknown;
}

/** Pull final text from OpenRouter responses (reasoning models may split fields). */
function extractOpenRouterContent(
  message: OpenRouterMessage | undefined
): string {
  if (!message) return "";

  const direct =
    typeof message.content === "string" ? message.content.trim() : "";
  if (direct) return direct;

  const reasoning =
    typeof message.reasoning === "string" ? message.reasoning.trim() : "";
  if (reasoning) return reasoning;

  if (Array.isArray(message.reasoning_details)) {
    const parts = message.reasoning_details
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join("\n").trim();
  }

  return "";
}

/**
 * Call OpenRouter chat completions.
 * Used for viral topic ideas and scene-by-scene script generation.
 */
export async function callOpenRouter(
  prompt: string,
  systemPrompt: string,
  options?: { reasoning?: boolean; timeoutMs?: number }
): Promise<AIResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const reasoning = options?.reasoning ?? true;
  const timeoutMs = options?.timeoutMs ?? 90_000;

  if (!apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Set it in your environment variables."
    );
  }

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
          "X-Title": "GLM Demo",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages,
          ...(reasoning ? { reasoning: { enabled: true } } : {}),
          max_tokens: 2048,
        }),
        signal: controller.signal,
      }
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter API error (${response.status}): ${errorText}`
    );
  }

  const json = await response.json();
  const message = json.choices?.[0]?.message;
  const content = extractOpenRouterContent(message);

  const usage = json.usage
    ? {
        promptTokens: json.usage.prompt_tokens,
        completionTokens: json.usage.completion_tokens,
        totalTokens: json.usage.total_tokens,
      }
    : undefined;

  return {
    content,
    provider: "openai",
    model: OPENROUTER_MODEL,
    usage,
  };
}
