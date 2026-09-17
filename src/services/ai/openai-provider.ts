import { env } from "@/lib/env";
import { LLMProvider } from "./llm-provider";

/** OpenAI-compatible chat completions provider. */
export class OpenAIProvider extends LLMProvider {
  readonly name = "openai";
  private base = env.ai.baseUrl || "https://api.openai.com/v1";
  private model = env.ai.model || "gpt-4o-mini";

  protected async complete(system: string, user: string): Promise<string> {
    if (!env.ai.apiKey) throw new Error("AI_API_KEY is required for provider=openai");
    const res = await fetch(`${this.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(env.ai.timeoutMs),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  }
}
