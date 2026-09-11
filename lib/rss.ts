import type { ClassifiedStory } from "./feed";

const SITE_URL = "https://unslop.news";
const HN_URL = "https://news.ycombinator.com";

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

function itemXml(story: ClassifiedStory, publishedAt: Date): string {
  const itemUrl = `${HN_URL}/item?id=${story.id}`;
  const description = [
    story.site ? `Source: ${story.site}` : null,
    story.points !== null ? `${story.points} points` : null,
    story.comments !== null ? `${story.comments} comments` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <item>
      <title>${escapeXml(story.title)}</title>
      <link>${escapeXml(story.url)}</link>
      <guid isPermaLink="true">${escapeXml(itemUrl)}</guid>
      <pubDate>${publishedAt.toUTCString()}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`;
}

export function buildRss(stories: ClassifiedStory[], updatedAt: number): string {
  const publishedAt = new Date(updatedAt);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>unslop.news</title>
    <link>${SITE_URL}</link>
    <description>Hacker News with AI content removed.</description>
    <language>en-us</language>
    <lastBuildDate>${publishedAt.toUTCString()}</lastBuildDate>${stories
      .map((story) => itemXml(story, publishedAt))
      .join("")}
  </channel>
</rss>`;
}
