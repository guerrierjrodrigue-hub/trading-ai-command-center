import { env } from "@/lib/env";
import { MockAIProvider } from "./mock-provider";
import { OpenAIProvider } from "./openai-provider";
import { AnthropicProvider } from "./anthropic-provider";
import { OllamaProvider } from "./ollama-provider";
import { ResilientAIProvider } from "./resilient-provider";
import type { AIProvider } from "./types";

let cached: AIProvider | null = null;

/**
 * Factory: returns the configured AI provider. The app depends only on the
 * AIProvider interface. `mock` is the default and needs no API key.
 * If a real provider is selected but misconfigured, we fall back to mock so
 * the app keeps working.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  try {
    switch (env.ai.provider) {
      case "openai":
        cached = new ResilientAIProvider(new OpenAIProvider());
        break;
      case "anthropic":
        cached = new ResilientAIProvider(new AnthropicProvider());
        break;
      case "ollama":
        cached = new ResilientAIProvider(new OllamaProvider());
        break;
      case "mock":
      default:
        cached = new MockAIProvider();
        break;
    }
  } catch {
    cached = new MockAIProvider();
  }
  return cached;
}

export * from "./types";
