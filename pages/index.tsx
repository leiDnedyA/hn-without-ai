import Head from "next/head";
import Link from "next/link";
import type { GetStaticProps, InferGetStaticPropsType } from "next";
import { getFeed, type ClassifiedStory } from "@/lib/feed";
import { useHNUsername } from "@/lib/use-hn-username";

const HN = "https://news.ycombinator.com";
const UNSLOP_NEWS = "https://unslop.news"

type Props = {
  stories: ClassifiedStory[];
  removed: number;
  withheld: number;
  model: string;
  updated: string;
  warning: string | null;
};

function Row({ story, rank }: { story: ClassifiedStory; rank: number }) {
  return (
    <>
      <tr className="athing">
        <td className="title rankcell">
          <span className="rank">{rank}.</span>
        </td>
        <td className="votelinks">
          <a
            href={`${HN}/item?id=${story.id}`}
            className="votearrow"
            aria-label={`Open Hacker News thread for ${story.title}`}
            rel="noreferrer"
            title="Open Hacker News thread"
          />
        </td>
        <td className="title">
          <span className="titleline">
            <a href={story.url} rel="noreferrer">
              {story.title}
            </a>

            {story.site ? (
              <span className="sitebit comhead">
                {" ("}
                <a href={`${HN}/from?site=${story.site}`} rel="noreferrer">
                  <span className="sitestr">{story.site}</span>
                </a>
                {")"}
              </span>
            ) : null}
          </span>
        </td>
      </tr>

      <tr>
        <td colSpan={2} />
        <td className="subtext">
          <span className="subline">
            {story.points !== null ? (
              <span className="score">{story.points} points</span>
            ) : null}

            {story.user ? (
              <>
                {" by "}
                <a
                  href={`${HN}/user?id=${story.user}`}
                  className="hnuser"
                  rel="noreferrer"
                >
                  {story.user}
                </a>
              </>
            ) : null}

            {story.age ? (
              <>
                {" "}
                <span className="age">
                  <a href={`${HN}/item?id=${story.id}`} rel="noreferrer">
                    {story.age}
                  </a>
                </span>
              </>
            ) : null}

            {" | "}

            <a href={`${HN}/item?id=${story.id}`} rel="noreferrer">
              {story.comments === null
                ? "discuss"
                : `${story.comments} comments`}
            </a>
          </span>
        </td>
      </tr>

      <tr className="spacer" style={{ height: 5 }} />
    </>
  );
}

export default function Home({
  stories,
  removed,
  withheld,
  model,
  updated,
  warning,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const { username, login, logout } = useHNUsername();

  return (
    <>
      <Head>
        <title>unslop.news</title>
        <meta
          name="description"
          content="Hacker News with AI content removed."
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="unslop.news RSS"
          href="/rss.xml"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <center>
        <table
          id="hnmain"
          border={0}
          cellPadding={0}
          cellSpacing={0}
          width="85%"
        >
          <tbody>
            <tr>
              <td style={{ backgroundColor: "#00cc88" }}>
                <table
                  border={0}
                  cellPadding={0}
                  cellSpacing={0}
                  width="100%"
                  style={{ padding: 2 }}
                >
                  <tbody>
                    <tr>
                      <td style={{ width: 18, paddingRight: 4 }}>
                        <a href={UNSLOP_NEWS} className="logo" rel="noreferrer">
                          U
                        </a>
                      </td>

                      <td style={{ lineHeight: "12pt", height: 10 }}>
                        <span className="pagetop">
                          <b className="hnname">
                            <Link href="/">unslop.news</Link>
                          </b>

                          <a href={`${HN}/newest`} rel="noreferrer">
                            new
                          </a>

                          {username ? (
                            <>
                              {" | "}
                              <a href={`${HN}/threads?id=${encodeURIComponent(username)}`} rel="noreferrer">
                                threads
                              </a>
                            </>
                          ) : null}

                          {" | "}

                          <a href={`${HN}/front`} rel="noreferrer">
                            past
                          </a>

                          {" | "}

                          <a href={`${HN}/newcomments`} rel="noreferrer">
                            comments
                          </a>

                          {" | "}

                          <a href={`${HN}/ask`} rel="noreferrer">
                            ask
                          </a>

                          {" | "}

                          <a href={`${HN}/show`} rel="noreferrer">
                            show
                          </a>

                          {" | "}

                          <a href={`${HN}/jobs`} rel="noreferrer">
                            jobs
                          </a>

                          {" | "}

                          <a href={`${HN}/submit`} rel="noreferrer">
                            submit
                          </a>
                        </span>
                      </td>

                      <td style={{ textAlign: "right", paddingRight: 4 }}>
                        <span className="pagetop">
                          <button
                            type="button"
                            className="navbutton"
                            onClick={username ? logout : login}
                          >
                            {username ? "logout" : "login"}
                          </button>
                        </span>
                      </td>

                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            <tr id="pagespace" style={{ height: 10 }} />

            <tr>
              <td>
                <table
                  border={0}
                  cellPadding={0}
                  cellSpacing={0}
                  className="itemlist"
                >
                  <tbody>
                    {stories.map((story, i) => (
                      <Row key={story.id} story={story} rank={i + 1} />
                    ))}
                  </tbody>
                </table>

                <hr className="footdivider" />

                <div className="yclinks">
                  <p>
                    <a href="https://github.com/leiDnedyA/hn-without-ai">Contribute</a>
                    {" "}&middot;{" "}
                    <Link href="/rss.xml">RSS</Link>
                    {" "}&middot;{" "}
                    {stories.length} of {stories.length + removed + withheld}{" "}
                    submissions survived the filter &middot; <a href="https://news.ycombinator.com/item?id=49660783#49663549">made with {"&lt;3"}</a> by <a href="https://aydendiel.dev/">Ayden Diel</a>
                   
                  </p>

                  <p></p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </center>
    </>
  );
}

export const getStaticProps = (async () => {
  const feed = await getFeed();
  const stories = feed.stories.filter((story) => story.ai === false);

  return {
    props: {
      stories,
      removed: feed.stories.filter((story) => story.ai === true).length,
      withheld: feed.stories.filter((story) => story.ai === null).length,
      model: process.env.CLASSIFIER_MODEL ?? "gpt-5.6-luna",
      updated: `${new Date(feed.fetchedAt)
        .toISOString()
        .slice(11, 16)} UTC`,
      warning: feed.warning,
    },

    // Keep the generated page cached for 30 minutes.
    // After that, the next request triggers background regeneration.
    revalidate: 60 * 30,
  };
}) satisfies GetStaticProps<Props>;
