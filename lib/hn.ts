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
    Array.from({ length: pages }, (_, i) =>
      fetch(`${BASE}/news?p=${i + 1}`, {
        headers: { "user-agent": "noai-hn (+https://github.com/)" },
      }).then((res) => {
        if (!res.ok) throw new Error(`HN page ${i + 1} returned ${res.status}`);
        return res.text();
      })
    )
  );

  const seen = new Set<string>();
  return htmls
    .flatMap(parsePage)
    .filter((s) => (seen.has(s.id) ? false : seen.add(s.id)))
    .sort((a, b) => a.rank - b.rank);
}
