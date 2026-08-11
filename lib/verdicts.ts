import { Redis } from "@upstash/redis";

/**
 * One record per HN item. `ai` is null once classification has been attempted
 * and failed, so a story that keeps failing can be capped instead of being
 * re-fetched and re-billed on every refresh for as long as it sits on the
 * front page.
 */
export type Verdict = {
  ai: boolean | null;
  attempts: number;
  /** Epoch ms of the last write, used to age entries out. */
  at: number;
};

export type VerdictStore = {
  load(): Promise<Map<string, Verdict>>;
  write(updates: Map<string, Verdict>): Promise<void>;
  drop(ids: string[]): Promise<void>;
};

/**
 * The slice of the Upstash client this module uses. Kept narrow so the store
 * can be exercised against a stub.
 */
export type RedisLike = {
  hgetall(key: string): Promise<Record<string, unknown> | null>;
  hset(key: string, values: Record<string, unknown>): Promise<unknown>;
  hdel(key: string, ...fields: string[]): Promise<unknown>;
};

/**
 * Every verdict lives in one hash, so a refresh costs two commands regardless
 * of how many stories are on the front page. Bump the version when the
 * classifier prompts change — old judgements are invalidated in one step
 * rather than pinned forever.
 */
const KEY = process.env.VERDICT_CACHE_KEY ?? "noai-hn:verdicts:v1";

const MEMORY_LIMIT = 5000;

function parse(value: unknown): Verdict | null {
  // The Upstash client deserializes JSON values on read, but a hash written by
  // hand (or by an older client) can still come back as a string.
  let record = value;
  if (typeof record === "string") {
    try {
      record = JSON.parse(record);
    } catch {
      return null;
    }
  }

  if (typeof record !== "object" || record === null) return null;
  const { ai, attempts, at } = record as Record<string, unknown>;

  if (typeof attempts !== "number" || typeof at !== "number") return null;
  if (ai === null) return { ai: null, attempts, at };
  if (typeof ai === "boolean") return { ai, attempts, at };

  return null;
}

export function createMemoryVerdictStore(limit = MEMORY_LIMIT): VerdictStore {
  const records = new Map<string, Verdict>();

  return {
    async load() {
      return new Map(records);
    },

    async write(updates) {
      for (const [id, record] of updates) {
        records.delete(id);
        records.set(id, record);
      }
      while (records.size > limit) {
        const oldest = records.keys().next().value;
        if (oldest === undefined) break;
        records.delete(oldest);
      }
    },

    async drop(ids) {
      for (const id of ids) records.delete(id);
    },
  };
}

/**
 * Redis-backed store with a process-local mirror. A Redis outage degrades to
 * in-process caching rather than taking the feed down or forcing a full
 * re-classification of the front page.
 */
export function createRedisVerdictStore(
  client: RedisLike,
  key = KEY
): VerdictStore {
  const mirror = new Map<string, Verdict>();
  /** Verdicts Redis has not accepted yet. Re-sent with the next write. */
  const pending = new Map<string, Verdict>();

  return {
    async load() {
      try {
        const raw = (await client.hgetall(key)) ?? {};
        mirror.clear();
        for (const [id, value] of Object.entries(raw)) {
          const record = parse(value);
          if (record) mirror.set(id, record);
        }
      } catch (error) {
        console.error("[verdicts] load failed, using in-process cache:", error);
      }

      // Rebuilding the mirror from Redis would otherwise discard verdicts whose
      // write was rejected, and those stories would be classified again.
      for (const [id, record] of pending) mirror.set(id, record);
      return new Map(mirror);
    },

    async write(updates) {
      if (updates.size === 0 && pending.size === 0) return;
      // Mirror first: the process stays correct even if the write is rejected.
      for (const [id, record] of updates) mirror.set(id, record);

      const outgoing = new Map([...pending, ...updates]);
      try {
        await client.hset(key, Object.fromEntries(outgoing));
        pending.clear();
      } catch (error) {
        for (const [id, record] of outgoing) pending.set(id, record);
        console.error("[verdicts] write failed, will retry:", error);
      }
    },

    async drop(ids) {
      if (ids.length === 0) return;
      for (const id of ids) {
        mirror.delete(id);
        pending.delete(id);
      }

      try {
        await client.hdel(key, ...ids);
      } catch (error) {
        console.error("[verdicts] prune failed:", error);
      }
    },
  };
}

let store: VerdictStore | null = null;

/**
 * Upstash credentials are named UPSTASH_REDIS_REST_* by the Upstash
 * integration and KV_REST_API_* by Vercel's own KV integration; both point at
 * the same REST API. Without either, verdicts are cached in-process only.
 */
export function getVerdictStore(): VerdictStore {
  if (store) return store;

  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (url && token) {
    store = createRedisVerdictStore(new Redis({ url, token }));
  } else {
    console.warn(
      "[verdicts] no Upstash credentials set — verdicts are cached in-process only and are lost on every cold start"
    );
    store = createMemoryVerdictStore();
  }

  return store;
}
