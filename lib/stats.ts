import { Redis } from "@upstash/redis";
import { supabaseRequest } from "./supabase";
import type { ClassifiedStory } from "./feed";

export type DailyStats = {
  aiCount: number;
  totalCount: number;
  percentage: number;
};

const TIMEZONE = "EST";
const CLASSIFIER_VERSION = process.env.CLASSIFIER_VERSION ?? "v1";
const CACHE_PREFIX = "noai-hn:stats:v1";
const TODAY_CACHE_TTL_SECONDS = 60 * 60;

type StatsCache = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<unknown>;
};

function getCache(): StatsCache | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/** The requested timezone is fixed EST (UTC-05:00), including during DST. */
export function getEstDate(date = new Date()): string {
  return new Date(date.getTime() - 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function isValidStatsDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

function cacheKey(date: string): string {
  return `${CACHE_PREFIX}:${TIMEZONE}:${CLASSIFIER_VERSION}:${date}`;
}

export function emptyStats(): DailyStats {
  return { aiCount: 0, totalCount: 0, percentage: 0 };
}

function calculateStats(rows: { is_ai: boolean }[]): DailyStats {
  const aiCount = rows.filter((row) => row.is_ai).length;
  const totalCount = rows.length;
  return {
    aiCount,
    totalCount,
    percentage: totalCount === 0 ? 0 : aiCount / totalCount,
  };
}

/** Persist all successfully classified stories from the current feed snapshot. */
export async function recordClassifiedStories(
  stories: ClassifiedStory[],
  date = getEstDate()
): Promise<void> {
  const rows = stories
    .filter((story) => story.ai !== null)
    .map((story) => ({
      snapshot_date: date,
      hn_item_id: story.id,
      is_ai: story.ai as boolean,
      classifier_version: CLASSIFIER_VERSION,
    }));

  if (rows.length === 0) return;

  await supabaseRequest("classified_stories", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

export async function getDailyStats(date: string): Promise<DailyStats> {
  if (!isValidStatsDate(date)) {
    throw new Error("Invalid date; expected YYYY-MM-DD");
  }

  const today = date === getEstDate();
  const cache = getCache();
  const key = cacheKey(date);

  if (cache) {
    const cached = await cache.get<DailyStats>(key);
    if (cached) return cached;
  }

  const data = await supabaseRequest<{ is_ai: boolean }[]>(
    `classified_stories?select=is_ai&snapshot_date=eq.${encodeURIComponent(date)}&classifier_version=eq.${encodeURIComponent(CLASSIFIER_VERSION)}`
  );
  if (!data) return emptyStats();

  const stats = calculateStats(data);
  if (cache) {
    // Historical entries intentionally have no expiry. Today's value is
    // allowed to lag by at most one hour to keep reads inexpensive.
    await cache.set(
      key,
      stats,
      today ? { ex: TODAY_CACHE_TTL_SECONDS } : undefined
    );
  }
  return stats;
}
