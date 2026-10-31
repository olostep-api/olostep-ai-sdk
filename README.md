# @olostep/ai-sdk

**Live web search, scraping and crawling API for AI. Get structured, LLM-ready data from any site. Scale to 1M requests with 10 parallel batches at low cost.**

[Olostep](https://www.olostep.com) is web data infrastructure for AI agents and enterprise AI workflows. Its APIs provide live web search, scraping and crawling to extract, clean and structure data from the web. This package gives agents built with the [Vercel AI SDK](https://ai-sdk.dev) ready-made Olostep tools.

## Why Olostep

- Web data infrastructure for developers and enterprises
- Scales to hundreds of millions to billions of requests per customer per month
- The most performant, reliable and cost-effective API on the market
- Used by the fastest-growing AI companies

From extracting data from a handful of URLs to crawling hundreds of millions of pages, Olostep gives developers and AI companies reliable, scalable and highly cost-effective access to clean, structured web data.

## Install

```bash
npm install @olostep/ai-sdk ai zod
```

Get an API key at [olostep.com/auth](https://olostep.com/auth) and set it as `OLOSTEP_API_KEY`.

## Usage

```ts
import { generateText, isStepCount } from 'ai';
import { olostepTools } from '@olostep/ai-sdk';

const { text } = await generateText({
  model: 'openai/gpt-5-mini',
  tools: olostepTools(),
  stopWhen: isStepCount(5),
  prompt: 'Read the Next.js 15 release notes and list the breaking changes, with sources.',
});

console.log(text);
```

Or pick individual tools:

```ts
import { olostepScrape, olostepSearch } from '@olostep/ai-sdk';

const tools = {
  scrape: olostepScrape(),
  search: olostepSearch(),
};
```

## Tools

| Tool | What it does |
|---|---|
| `olostepScrape` | Scrape a URL and return clean markdown (JavaScript rendering included) |
| `olostepSearch` | Search the live web and return titles, URLs and descriptions |
| `olostepAnswer` | Answer a question from the live web, with source URLs |
| `olostepMap` | List the URLs on a website, optionally ranked by a query |
| `olostepCrawl` | Crawl a site and return the markdown of each page, 20 at a time by default |
| `olostepBatch` | Scrape up to 100k URLs in one batch and return the markdown of each page, 20 at a time by default |
| `olostepResults` | Get the remaining pages of a crawl or batch |
| `olostepTools` | All of the above, keyed by name |

## Options

Every tool accepts the same options:

```ts
olostepTools({
  apiKey: 'olostep_...',   // defaults to process.env.OLOSTEP_API_KEY
  maxCharacters: 20_000,   // max page content returned to the model, per page
  timeoutSeconds: 300,     // how long crawl and batch tools wait for the job to finish
  pagesPerCall: 20,        // pages returned per call, up to 100
});
```

## Large crawls and batches

Page content goes to the model, so large jobs return their pages a set at a time. If a job is still running when the wait ends, the tool returns its `id` with `status` set to `in_progress`. If more pages are available, the result includes `nextCursor`. Pass the `id` and `nextCursor` to `olostepResults` to get the next pages, until you have every page.

New accounts are limited to 100 URLs per batch: contact info@olostep.com to lift this.

## Examples

```bash
# Call each tool directly (no LLM needed)
OLOSTEP_API_KEY=... npx tsx examples/tools.ts

# Run an agent through the Vercel AI Gateway
OLOSTEP_API_KEY=... AI_GATEWAY_API_KEY=... npx tsx examples/agent.ts
```

## About Olostep

[Olostep](https://www.olostep.com) is web data infrastructure for AI agents and enterprise AI workflows. It helps businesses power AI agents, knowledge bases and data-intensive workflows without the high costs of traditional web data infrastructure, and it is trusted by some of the fastest-growing businesses in the world.

- Website: https://www.olostep.com
- Documentation: https://docs.olostep.com
- Get an API key: https://olostep.com/auth

## License

MIT
