import { generateText, gateway } from "ai";

export type AIProvider = "vercel-ai-gateway" | "openrouter" | "deepseek" | "ollama";

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

export interface CallAIOptions {
  provider?: AIProvider;
  timeoutMs?: number;
  reasoning?: boolean;
}

const PRIMARY_PROVIDER: AIProvider = isAIProvider(process.env.PRIMARY_AI_PROVIDER)
  ? (process.env.PRIMARY_AI_PROVIDER as AIProvider)
  : "ollama";

const AI_GATEWAY_MODEL = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-4o-mini";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:free";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 300_000;

export async function callAI(
  prompt: string,
  systemPrompt: string,
  options?: CallAIOptions,
): Promise<AIResponse> {
  const provider = options?.provider ?? PRIMARY_PROVIDER;

  switch (provider) {
    case "vercel-ai-gateway":
      return callVercelGateway(prompt, systemPrompt, options);
    case "openrouter":
      return callOpenRouter(prompt, systemPrompt, options);
    case "deepseek":
      return callDeepseek(prompt, systemPrompt, options);
    case "ollama":
      return callOllama(prompt, systemPrompt, options);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

export async function callAIWithFallback(
  prompt: string,
  systemPrompt: string,
  options?: CallAIOptions,
): Promise<AIResponse> {
  const provider = options?.provider ?? PRIMARY_PROVIDER;

  try {
    return await callAI(prompt, systemPrompt, { ...options, provider });
  } catch (err) {
    console.warn(`[AI] Primary provider "${provider}" failed:`, err);

    if (provider !== "ollama") {
      console.warn("[AI] Falling back to ollama");
      try {
        return await callOllama(prompt, systemPrompt, options);
      } catch (fallbackErr) {
        console.warn("[AI] Ollama fallback also failed:", fallbackErr);
        throw new Error(
          `AI call failed. Primary: ${extractMessage(err)}, Fallback: ${extractMessage(fallbackErr)}`,
        );
      }
    }

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Vercel AI Gateway
// ---------------------------------------------------------------------------

async function callVercelGateway(
  prompt: string,
  systemPrompt: string,
  options?: CallAIOptions,
): Promise<AIResponse> {
  const modelId = AI_GATEWAY_MODEL;

  const { text, usage } = await generateText({
    model: gateway.languageModel(modelId),
    system: systemPrompt,
    prompt,
    ...(options?.timeoutMs ? { timeout: options.timeoutMs } : {}),
  });

  return {
    content: text,
    provider: "vercel-ai-gateway",
    model: modelId,
    usage: usage
      ? {
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// OpenRouter
// ---------------------------------------------------------------------------

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content?: string | null;
  reasoning?: string | null;
  reasoning_details?: unknown;
}

function extractOpenRouterContent(
  message: OpenRouterMessage | undefined,
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

async function callOpenRouter(
  prompt: string,
  systemPrompt: string,
  options?: CallAIOptions,
): Promise<AIResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const reasoning = options?.reasoning ?? true;
  const timeoutMs = options?.timeoutMs ?? 90_000;

  if (!apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Set it in your environment variables.",
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
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "GLM Demo",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        ...(reasoning ? { reasoning: { enabled: true } } : {}),
        max_tokens: 8192,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
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

  return { content, provider: "openrouter", model: OPENROUTER_MODEL, usage };
}

// ---------------------------------------------------------------------------
// DeepSeek (OpenAI-compatible API)
// ---------------------------------------------------------------------------

async function callDeepseek(
  prompt: string,
  systemPrompt: string,
  options?: CallAIOptions,
): Promise<AIResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = DEEPSEEK_MODEL;
  const timeoutMs = options?.timeoutMs ?? 90_000;

  if (!apiKey) {
    throw new Error(
      "Missing DEEPSEEK_API_KEY. Set it in your environment variables.",
    );
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 8192,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `DeepSeek request timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw err;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const content: string = json.choices?.[0]?.message?.content ?? "";

  const usage = json.usage
    ? {
        promptTokens: json.usage.prompt_tokens,
        completionTokens: json.usage.completion_tokens,
        totalTokens: json.usage.total_tokens,
      }
    : undefined;

  return { content, provider: "deepseek", model, usage };
}

// ---------------------------------------------------------------------------
// Ollama (local)
// ---------------------------------------------------------------------------

async function callOllama(
  prompt: string,
  systemPrompt: string,
  options?: CallAIOptions,
): Promise<AIResponse> {
  const model = OLLAMA_MODEL;
  const url = `${OLLAMA_BASE_URL}/api/chat`;
  const timeoutMs = options?.timeoutMs ?? OLLAMA_TIMEOUT_MS;

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    stream: false,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Ollama request timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw err;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${errorText}`);
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAIProvider(value: string | undefined): value is AIProvider {
  return (
    value === "vercel-ai-gateway" ||
    value === "openrouter" ||
    value === "deepseek" ||
    value === "ollama"
  );
}

function extractMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function getProviderFromHeader(request: Request): AIProvider {
  const header = request.headers.get("x-ai-provider");
  if (header && isAIProvider(header)) {
    return header;
  }
  return PRIMARY_PROVIDER;
}
