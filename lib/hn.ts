export type Story = {
  id: string;
  rank: number;
  title: string;
  url: string;
  site: string | null;
  points: number | null;
  user: string | null;
  age: string;
  comments: number | null;
};

const BASE = "https://news.ycombinator.com";

const configuredRequestsPerMinute = Number(process.env.HN_REQUESTS_PER_MINUTE);
const HN_REQUESTS_PER_MINUTE =
  Number.isInteger(configuredRequestsPerMinute) &&
  configuredRequestsPerMinute > 0
    ? configuredRequestsPerMinute
    : 60;
const HN_REQUEST_INTERVAL_MS = Math.ceil(60_000 / HN_REQUESTS_PER_MINUTE);

let nextHNRequestAt = 0;
let hnRequestSchedule: Promise<void> = Promise.resolve();

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#x27": "'",
  "#x2F": "/",
  "#39": "'",
  "#47": "/",
  nbsp: " ",
};

/** Space HN request starts across every fetch in this server process. */
async function waitForHNRequestSlot(): Promise<void> {
  const slot = hnRequestSchedule.then(async () => {
    const delay = Math.max(0, nextHNRequestAt - Date.now());
    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    nextHNRequestAt = Date.now() + HN_REQUEST_INTERVAL_MS;
  });

  hnRequestSchedule = slot.catch(() => undefined);
  await slot;
}

async function fetchPage(page: number): Promise<string> {
  await waitForHNRequestSlot();

  const response = await fetch(`${BASE}/news?p=${page}`, {
    headers: { "user-agent": "noai-hn (+https://github.com/)" },
  });
  if (!response.ok) {
    throw new Error(`HN page ${page} returned ${response.status}`);
  }
  return response.text();
}

function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, name: string) => {
    if (name in ENTITIES) return ENTITIES[name];
    if (name.startsWith("#x") || name.startsWith("#X")) {
      return String.fromCodePoint(parseInt(name.slice(2), 16));
    }
    if (name.startsWith("#")) {
      return String.fromCodePoint(parseInt(name.slice(1), 10));
    }
    return whole;
  });
}

function stripTags(s: string): string {
  return decode(s.replace(/<[^>]*>/g, "")).trim();
}

function match(chunk: string, re: RegExp): string | null {
  const m = chunk.match(re);
  return m ? m[1] : null;
}

/**
 * HN renders each submission as an `athing` row followed by a `subtext` row.
 * Splitting on `athing` gives one chunk per story containing both.
 */
function parsePage(html: string): Story[] {
  const chunks = html.split(/<tr class=['"]athing/).slice(1);
  const stories: Story[] = [];

  for (const chunk of chunks) {
    const id = match(chunk, /id=['"](\d+)['"]/);
    const rank = match(chunk, /class=["']rank["']>(\d+)\./);
    const titleline = chunk.match(
      /<span class=["']titleline["']><a href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/
    );
    if (!id || !titleline) continue;

    const href = decode(titleline[1]);
    const comments = match(chunk, />(\d+)(?:&nbsp;|\s)comments?<\/a>/);

    stories.push({
      id,
      rank: rank ? Number(rank) : stories.length + 1,
      title: stripTags(titleline[2]),
      url: /^https?:\/\//.test(href) ? href : `${BASE}/${href.replace(/^\//, "")}`,
      site: match(chunk, /<span class=["']sitestr["']>([^<]*)<\/span>/),
      points: Number(match(chunk, /<span class=["']score["'][^>]*>(\d+)\s+point/)) || null,
      user: match(chunk, /class=["']hnuser["']>([^<]*)<\/a>/),
      age: stripTags(match(chunk, /<span class=["']age["'][^>]*><a[^>]*>([^<]*)<\/a>/) ?? ""),
      comments: comments ? Number(comments) : null,
    });
  }

  return stories;
}

/** Fetch and parse the first `pages` front pages of Hacker News. */
export async function fetchFrontPages(pages = 3): Promise<Story[]> {
  const htmls = await Promise.all(
    Array.from({ length: pages }, (_, i) => fetchPage(i + 1))
  );

  const seen = new Set<string>();
  return htmls
    .flatMap(parsePage)
    .filter((s) => (seen.has(s.id) ? false : seen.add(s.id)))
    .sort((a, b) => a.rank - b.rank);
}
