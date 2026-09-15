import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import {
  getDailyStats,
  getEstDate,
  isValidStatsDate,
  type DailyStats,
} from "@/lib/stats";

type Props = { date: string; stats: DailyStats };

export default function Stats({
  date,
  stats,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head><title>AI on Hacker News | unslop.news</title></Head>
      <main className="stats">
        <p><Link href="/">← back to the front page</Link></p>
        <h1>AI on Hacker News</h1>
        <form method="get">
          <label>
            Day (EST):{" "}
            <input type="date" name="date" defaultValue={date} />
          </label>{" "}
          <button type="submit">View</button>
        </form>
        <p>{date} (EST)</p>
        <p className="stats-number">{(stats.percentage * 100).toFixed(1)}%</p>
        <p>
          {stats.aiCount} AI-related posts out of {stats.totalCount} classified
          posts.
        </p>
      </main>
    </>
  );
}

export const getServerSideProps = (async ({ query }) => {
  const requested = typeof query.date === "string" ? query.date : getEstDate();
  const date = isValidStatsDate(requested) ? requested : getEstDate();
  return { props: { date, stats: await getDailyStats(date) } };
}) satisfies GetServerSideProps<Props>;
