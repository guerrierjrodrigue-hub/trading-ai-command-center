import { env } from "@/lib/env";
import { LLMProvider } from "./llm-provider";

/** Anthropic Messages API provider. */
export class AnthropicProvider extends LLMProvider {
  readonly name = "anthropic";
  private base = env.ai.baseUrl || "https://api.anthropic.com/v1";
  private model = env.ai.model || "claude-3-5-sonnet-latest";

  protected async complete(system: string, user: string): Promise<string> {
    if (!env.ai.apiKey) throw new Error("AI_API_KEY is required for provider=anthropic");
    const res = await fetch(`${this.base}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ai.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1500,
        temperature: 0.4,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(env.ai.timeoutMs),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.content?.[0]?.text ?? "";
  }
}
