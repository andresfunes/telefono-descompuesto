import { describe, expect, it } from "vitest";
import { EXAMPLE_PROMPTS, randomExamplePrompt, nextExamplePrompt } from "@/lib/example-prompts";

describe("example prompts", () => {
  it("provides 100 unique, valid game prompts", () => {
    expect(EXAMPLE_PROMPTS).toHaveLength(100);
    expect(new Set(EXAMPLE_PROMPTS)).toHaveLength(100);
    expect(EXAMPLE_PROMPTS.every((prompt) => prompt.length > 0 && prompt.length <= 240)).toBe(true);
  });

  it("selects a prompt using the supplied random index", () => {
    expect(randomExamplePrompt(() => 17)).toBe(EXAMPLE_PROMPTS[17]);
  });
});

it("offers a different idea without repeating the current suggestion", () => {
  for (const current of EXAMPLE_PROMPTS) {
    const next = nextExamplePrompt(current, () => 0);
    expect(next).not.toBe(current);
    expect(EXAMPLE_PROMPTS).toContain(next);
  }
});
