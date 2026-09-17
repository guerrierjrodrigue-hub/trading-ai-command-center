import { env } from "@/lib/env";
import { LLMProvider } from "./llm-provider";

/** Local Ollama provider (no API key needed, self-hosted). */
export class OllamaProvider extends LLMProvider {
  readonly name = "ollama";
  private base = env.ai.baseUrl || "http://localhost:11434";
  private model = env.ai.model || "llama3.1";

  protected async complete(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        options: { temperature: 0.4 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(env.ai.timeoutMs),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.message?.content ?? "";
  }
}
