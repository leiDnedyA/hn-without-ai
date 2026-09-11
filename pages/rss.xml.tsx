import type { GetServerSideProps } from "next";
import { getFeed } from "@/lib/feed";
import { buildRss } from "@/lib/rss";

export default function RssFeed() {
  return null;
}

export const getServerSideProps = (async ({ res }) => {
  const feed = await getFeed();
  const stories = feed.stories.filter((story) => story.ai === false);

  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=1800, stale-while-revalidate=3600"
  );
  res.write(buildRss(stories, feed.fetchedAt));
  res.end();

  return { props: {} };
}) satisfies GetServerSideProps;
