import { classifyStories } from "./classify";
import { fetchFrontPages, type Story } from "./hn";

export type ClassifiedStory = Story & { ai: boolean | null };

export type Feed = {
  stories: ClassifiedStory[];
  fetchedAt: number;
  /** Set when classification was unavailable, so the page can say so. */
  warning: string | null;
};

/**
 * The whole feed — scrape and both classification stages alike — is rebuilt at
 * most this often.
 */
const TTL_MS = 30 * 60 * 1000;
const VERDICT_CACHE_LIMIT = 5000;

/**
 * Verdicts are keyed by HN item id and survive feed refreshes, so a story that
 * sticks around on the front page is only ever sent to the model once.
 */
const verdicts = new Map<string, boolean>();

let snapshot: Feed | null = null;
let inFlight: Promise<Feed> | null = null;

function remember(id: string, ai: boolean) {
  verdicts.delete(id);
  verdicts.set(id, ai);
  while (verdicts.size > VERDICT_CACHE_LIMIT) {
    const oldest = verdicts.keys().next().value;
    if (oldest === undefined) break;
    verdicts.delete(oldest);
  }
}

async function build(): Promise<Feed> {
  const stories = await fetchFrontPages(3);
  const unseen = stories.filter((story) => !verdicts.has(story.id));

  let warning: string | null = null;
  if (unseen.length > 0) {
    try {
      const fresh = await classifyStories(unseen);
      for (const [id, ai] of fresh) remember(id, ai);
      const missed = unseen.filter((story) => !verdicts.has(story.id));
      if (missed.length > 0) {
        warning = `${missed.length} of ${stories.length} submissions could not be fully classified and were withheld.`;
      }
    } catch (error) {
      console.error("[feed] classification unavailable:", error);
      warning =
        "Classification is unavailable right now — unverified submissions were withheld.";
    }
  }

  return {
    stories: stories.map((story) => ({ ...story, ai: verdicts.get(story.id) ?? null })),
    fetchedAt: Date.now(),
    warning,
  };
}

/**
 * Cached feed. Concurrent callers share one refresh, and a window that ends in
 * a classification failure is still spent — the cap is honoured over freshness,
 * so unverified stories remain withheld until the next window.
 */
export async function getFeed(): Promise<Feed> {
  if (snapshot && Date.now() - snapshot.fetchedAt < TTL_MS) return snapshot;
  if (inFlight) return inFlight;

  inFlight = build()
    .then((feed) => {
      snapshot = feed;
      return feed;
    })
    .catch((error) => {
      if (snapshot) return snapshot; // serve stale rather than erroring out
      throw error;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
