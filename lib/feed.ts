import { classifyStories } from "./classify";
import { fetchFrontPages, type Story } from "./hn";
import { getVerdictStore, type Verdict } from "./verdicts";
import { recordClassifiedStories } from "./stats";

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

/**
 * A story whose content cannot be classified is retried this many times and
 * then left withheld. Without the cap, every refresh re-fetches and re-bills
 * the same unclassifiable page for as long as it stays on the front page.
 */
const MAX_ATTEMPTS = 3;

/**
 * Verdicts older than this are pruned once the story is off the front page.
 * A verdict never changes, so this only bounds the size of the hash.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let snapshot: Feed | null = null;
let inFlight: Promise<Feed> | null = null;

/** Nothing more to spend on this story: it has a verdict, or it has run out of tries. */
function isSettled(record: Verdict | undefined): boolean {
  if (!record) return false;
  return record.ai !== null || record.attempts >= MAX_ATTEMPTS;
}

async function build(): Promise<Feed> {
  const store = getVerdictStore();
  const [stories, stored] = await Promise.all([
    fetchFrontPages(6),
    store.load(),
  ]);
  const now = Date.now();

  const present = new Set(stories.map((story) => story.id));
  const stale = [...stored]
    .filter(([id, record]) => !present.has(id) && now - record.at > MAX_AGE_MS)
    .map(([id]) => id);

  if (stale.length > 0) {
    for (const id of stale) stored.delete(id);
    await store.drop(stale);
  }

  const unseen = stories.filter((story) => !isSettled(stored.get(story.id)));

  let warning: string | null = null;
  if (unseen.length > 0) {
    const updates = new Map<string, Verdict>();

    try {
      const fresh = await classifyStories(unseen);

      for (const story of unseen) {
        const ai = fresh.get(story.id);
        if (ai === undefined) {
          // The classifier ran but returned nothing for this story, so the
          // page itself is the problem — count it against the retry cap.
          const attempts = (stored.get(story.id)?.attempts ?? 0) + 1;
          updates.set(story.id, { ai: null, attempts, at: now });
        } else {
          updates.set(story.id, { ai, attempts: 0, at: now });
        }
      }
    } catch (error) {
      // A total outage is not the story's fault. Record nothing, so an hour of
      // downtime cannot exhaust the retry cap for the whole front page.
      console.error("[feed] classification unavailable:", error);
      warning =
        "Classification is unavailable right now — unverified submissions were withheld.";
    }

    for (const [id, record] of updates) stored.set(id, record);
    await store.write(updates);
  }

  const withheld = stories.filter((story) => stored.get(story.id)?.ai == null);
  if (!warning && withheld.length > 0) {
    warning = `${withheld.length} of ${stories.length} submissions could not be fully classified and were withheld.`;
  }

  const feed: Feed = {
    stories: stories.map((story) => ({
      ...story,
      ai: stored.get(story.id)?.ai ?? null,
    })),
    fetchedAt: now,
    warning,
  };

  try {
    await recordClassifiedStories(feed.stories);
  } catch (error) {
    // Stats persistence must not take the feed down.
    console.error("[feed] stats persistence failed:", error);
  }

  return feed;
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
