# noai-hn

Hacker News with AI-driven content removed.

Server-side rendered. The app scrapes the first three front pages of Hacker News,
asks an efficient OpenAI model to classify each submission as AI-driven or not, drops the
AI ones, and renders the rest in Hacker News' own markup and stylesheet.

The whole feed is rebuilt at most once every 30 minutes, and all ~90 submissions are
classified in a single request — so the app makes at most one LLM call per half hour.

## Running it

```bash
echo 'OPENAI_API_KEY=your-api-key' > .env.local
pnpm install
pnpm dev
```

Without `OPENAI_API_KEY` the app still runs — it serves the unfiltered front
pages with a notice explaining that classification is unavailable.

| Env var            | Default          | Purpose                     |
| ------------------ | ---------------- | --------------------------- |
| `OPENAI_API_KEY`   | —                | Required for classification |
| `CLASSIFIER_MODEL` | `gpt-5.6-luna`   | Model used for classification |

## How it works

| File              | Role                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `lib/hn.ts`       | Fetches and parses `news.ycombinator.com/news?p=1..3`                     |
| `lib/classify.ts` | Sends all titles to OpenAI's Responses API with a JSON schema, returns a verdict per story |
| `lib/feed.ts`     | 30-minute feed cache, plus per-story verdicts for the life of the process |
| `pages/index.tsx` | `getStaticProps` + ISR + Hacker News markup                                |

Verdicts are also cached by HN item id, so a story that lingers on the front page is
only ever sent to the model once — a refresh where nothing is new costs zero calls.

A classification failure never hides a post: unclassified submissions are treated as
non-AI and the page says so. Such a window is still spent, so an unfiltered feed can
persist until the next one — the rate cap wins over freshness.
