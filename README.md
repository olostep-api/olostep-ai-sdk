# @olostep/ai-sdk

**Live web search, scraping and crawling API for AI. Get structured, LLM-ready data from any site. Scale to 1M requests in a single batch at low cost.**

[Olostep](https://www.olostep.com) is web data infrastructure for AI. It provides live web search, scraping and crawling API to extract and structure data. This package gives agents built with the [Vercel AI SDK](https://ai-sdk.dev) ready-made Olostep tools.

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
| `olostepCrawl` | Crawl a site and return the markdown of each page |
| `olostepBatch` | Scrape up to 20 URLs in one batch and return the markdown of each |
| `olostepTools` | All of the above, keyed by name |

## Options

Every tool accepts the same options:

```ts
olostepTools({
  apiKey: 'olostep_...',   // defaults to process.env.OLOSTEP_API_KEY
  maxCharacters: 20_000,   // max page content returned to the model, per page
  timeoutSeconds: 300,     // how long crawl and batch tools wait for the job to finish
});
```

## Examples

```bash
# Call each tool directly (no LLM needed)
OLOSTEP_API_KEY=... npx tsx examples/tools.ts

# Run an agent through the Vercel AI Gateway
OLOSTEP_API_KEY=... AI_GATEWAY_API_KEY=... npx tsx examples/agent.ts
```

## About Olostep

[Olostep](https://www.olostep.com) is web data infrastructure for AI. It provides live web search, scraping and crawling API to extract and structure data, used in production by AI companies to give their agents fresh, LLM-ready web data at scale.

- Website: https://www.olostep.com
- Documentation: https://docs.olostep.com
- Get an API key: https://olostep.com/auth

## License

MIT
