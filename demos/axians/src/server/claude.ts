import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";

export const client = new Anthropic();
export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
/** Used where latency matters more than depth (voice agent). */
export const FAST_MODEL = process.env.CLAUDE_FAST_MODEL ?? "claude-sonnet-5-5";

/**
 * Shared request options. Server-side refusal fallback is on by default
 * (a declined request is retried on a suitable model inside the same call).
 */
export const base = {
  model: MODEL,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

/** Tool definition from a zod schema (strict, so inputs always match the schema). */
export function zodTool(name: string, description: string, schema: z.ZodObject): BetaTool {
  const { $schema: _, ...input_schema } = z.toJSONSchema(schema) as Record<string, unknown>;
  return { name, description, strict: true, input_schema: input_schema as BetaTool["input_schema"] };
}

/** Assistant content can be sent back as-is, minus the SDK's client-side parse fields. */
export function asParam(content: unknown[]): BetaMessageParam["content"] {
  return content.map((b) => {
    const { parsed_output: _, ...rest } = b as Record<string, unknown>;
    return rest;
  }) as unknown as BetaMessageParam["content"];
}

export class RefusalError extends Error {}
