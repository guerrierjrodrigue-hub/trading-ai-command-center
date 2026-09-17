import { describe, expect, it } from "vitest";
import { tokenize, searchKnowledge, knowledgeMeta } from "@/services/knowledge";

describe("tokenize", () => {
  it("lowercases, strips accents and drops stopwords", () => {
    const t = tokenize("La Gestion du RISQUE et la Stratégie");
    expect(t).toContain("gestion");
    expect(t).toContain("risque"); // accent-free already
    expect(t).toContain("strategie"); // é -> e
    expect(t).not.toContain("la");
    expect(t).not.toContain("du");
  });
});

describe("searchKnowledge", () => {
  it("has a non-empty corpus", () => {
    expect(knowledgeMeta().chunks).toBeGreaterThan(50);
  });

  it("finds the Fibonacci material for a relevant query", () => {
    const hits = searchKnowledge("Fibonacci retracement niveaux", 4);
    expect(hits.length).toBeGreaterThan(0);
    const joined = hits.map((h) => `${h.title} ${h.text}`).join(" ").toLowerCase();
    expect(joined).toContain("fibonacci");
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it("returns nothing for a query with no content overlap", () => {
    const hits = searchKnowledge("zzzqqqxyz", 4);
    expect(hits.length).toBe(0);
  });
});
