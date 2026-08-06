import OpenAI from "openai";
import type { Story } from "./hn";

/**
 * Luna is the efficient, high-volume GPT-5.6 tier, which fits this
 * one-line-per-title classification. Override with CLASSIFIER_MODEL.
 */
const MODEL = process.env.CLASSIFIER_MODEL ?? "gpt-5.6-luna";

/**
 * Large enough that three front pages (~90 submissions) go out as a single
 * request, so a feed refresh costs exactly one LLM call.
 */
const BATCH_SIZE = 150;

const SYSTEM = `You classify Hacker News submissions by whether they are AI-driven content.

Mark a submission as AI (true) when its subject matter is:
- LLMs, chatbots, generative AI, diffusion models, agents, prompting, RAG, embeddings
- AI companies, models, or products (OpenAI, Anthropic, Claude, GPT, Gemini, Llama, Copilot, Cursor, Midjourney, ...)
- AI funding, regulation, safety, hype, backlash, job displacement, or AI-generated media
- Tooling whose primary purpose is building, serving, or running AI models
- Posts that read as AI-generated slop or "I built X with an LLM" showcases

Mark it as not AI (false) for everything else, including:
- Classical algorithms, statistics, or mathematics with no AI framing
- Systems, languages, databases, networking, security, hardware, graphics
- Science, history, culture, business, and policy that do not centre on AI
- GPUs, chips, or datacenters discussed without an AI angle

Judge the actual subject, not incidental word matches. Return one entry per
submission, using the exact index given.`;

const SCHEMA = {
  type: "object",
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "The index given in the input" },
          ai: { type: "boolean", description: "True if the submission is AI-driven content" },
        },
        required: ["index", "ai"],
        additionalProperties: false,
      },
    },
  },
  required: ["classifications"],
  additionalProperties: false,
} as const;

type Batch = { index: number; story: Story };

async function classifyBatch(
  client: OpenAI,
  batch: Batch[]
): Promise<Map<string, boolean>> {
  const listing = batch
    .map(({ index, story }) => {
      const site = story.site ? ` (${story.site})` : "";
      return `${index}. ${story.title}${site}`;
    })
    .join("\n");

  const response = await client.responses.create({
    model: MODEL,
    instructions: SYSTEM,
    input: `Classify each of these ${batch.length} Hacker News submissions:\n\n${listing}`,
    max_output_tokens: 8000,
    reasoning: { effort: "none" },
    text: {
      format: {
        type: "json_schema",
        name: "story_classifications",
        strict: true,
        schema: SCHEMA,
      },
    },
  });

  if (response.status !== "completed") {
    const reason = response.incomplete_details?.reason ?? response.error?.message;
    throw new Error(`Classification stopped early: ${reason ?? response.status}`);
  }

  const refusal = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content)
    .find((content) => content.type === "refusal");

  if (refusal) {
    throw new Error(`Classification refused: ${refusal.refusal}`);
  }

  const parsed = JSON.parse(response.output_text) as {
    classifications: { index: number; ai: boolean }[];
  };

  const byIndex = new Map(batch.map(({ index, story }) => [index, story.id]));
  const result = new Map<string, boolean>();
  for (const { index, ai } of parsed.classifications) {
    const id = byIndex.get(index);
    if (id) result.set(id, ai);
  }
  return result;
}

/**
 * Classify stories as AI-driven or not. Batched across parallel requests.
 * Stories the model fails to classify are simply absent from the result —
 * callers treat an absent verdict as "not AI" so a failure never hides a post.
 */
export async function classifyStories(stories: Story[]): Promise<Map<string, boolean>> {
  const verdicts = new Map<string, boolean>();
  if (stories.length === 0) return verdicts;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const client = new OpenAI();

  const batches: Batch[][] = [];
  for (let i = 0; i < stories.length; i += BATCH_SIZE) {
    batches.push(
      stories.slice(i, i + BATCH_SIZE).map((story, offset) => ({
        index: i + offset + 1,
        story,
      }))
    );
  }

  const settled = await Promise.allSettled(
    batches.map((batch) => classifyBatch(client, batch))
  );

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      for (const [id, ai] of outcome.value) verdicts.set(id, ai);
    } else {
      console.error("[classify] batch failed:", outcome.reason);
    }
  }

  return verdicts;
}
