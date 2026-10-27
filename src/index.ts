import { tool } from 'ai';
import { Format, Olostep } from 'olostep';
import { z } from 'zod';

export interface OlostepToolOptions {
  /** Olostep API key. Defaults to the `OLOSTEP_API_KEY` environment variable. */
  apiKey?: string;
  /** Maximum characters of page content returned to the model per page. Default: 20,000. */
  maxCharacters?: number;
  /** How long crawl and batch tools wait for the job to finish, in seconds. Default: 300. */
  timeoutSeconds?: number;
}

const DEFAULT_MAX_CHARACTERS = 20_000;
const DEFAULT_TIMEOUT_SECONDS = 300;

function waitOptions(options: OlostepToolOptions) {
  return { checkEveryNSecs: 5, timeoutSeconds: options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS };
}

function client(options: OlostepToolOptions): Olostep {
  return new Olostep({ apiKey: options.apiKey });
}

function truncate(text: string | undefined | null, max: number): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}\n\n[truncated]` : text;
}

// The API returns the answer as a JSON string, usually {"result": "..."}.
function parseAnswer(answer: string | null): unknown {
  if (!answer) return null;
  try {
    const parsed = JSON.parse(answer);
    return parsed && typeof parsed === 'object' && 'result' in parsed ? parsed.result : parsed;
  } catch {
    return answer;
  }
}

/** Scrape a single URL and return its content as clean markdown. */
export const olostepScrape = (options: OlostepToolOptions = {}) =>
  tool({
    description:
      'Scrape a web page and return its content as clean markdown. Handles JavaScript-rendered pages. Use when you need the full content of a specific URL.',
    inputSchema: z.object({
      url: z.string().url().describe('The URL of the page to scrape'),
      waitBeforeScraping: z
        .number()
        .int()
        .min(0)
        .max(10_000)
        .optional()
        .describe('Milliseconds to wait for JavaScript-heavy pages to render'),
    }),
    execute: async ({ url, waitBeforeScraping }) => {
      const result = await client(options).scrapes.create({
        url,
        formats: ['markdown'],
        waitBeforeScraping,
      });
      return {
        url,
        markdown: truncate(result.markdown_content, options.maxCharacters ?? DEFAULT_MAX_CHARACTERS),
      };
    },
  });

/** Search the web and return a list of results with titles, URLs and descriptions. */
export const olostepSearch = (options: OlostepToolOptions = {}) =>
  tool({
    description:
      'Search the live web. Returns result titles, URLs and descriptions. Use to find current information or sources to scrape.',
    inputSchema: z.object({
      query: z.string().describe('The search query'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum number of results (default 10)'),
    }),
    execute: async ({ query, limit }) => {
      const result = await client(options).searches.create({ query, limit });
      return {
        query,
        results: result.links.map(link => ({
          title: link.title,
          url: link.url,
          description: link.description,
        })),
      };
    },
  });

/** Answer a question using live web data, with source URLs. */
export const olostepAnswer = (options: OlostepToolOptions = {}) =>
  tool({
    description:
      'Answer a question by searching and reading the live web. Returns an answer with source URLs. Use for factual or current-events questions that need citations.',
    inputSchema: z.object({
      task: z.string().describe('The question or research task'),
    }),
    execute: async ({ task }) => {
      const result = await client(options).answers.create({ task });
      return { answer: parseAnswer(result.answer), sources: result.sources };
    },
  });

/** List the URLs on a website, optionally ranked by relevance to a query. */
export const olostepMap = (options: OlostepToolOptions = {}) =>
  tool({
    description:
      'Discover the URLs on a website. Optionally rank them by relevance to a search query. Use to find the right pages on a site before scraping them.',
    inputSchema: z.object({
      url: z.string().url().describe('The website to map'),
      searchQuery: z.string().optional().describe('Rank URLs by relevance to this query'),
      topN: z.number().int().min(1).max(500).optional().describe('Maximum number of URLs to return'),
    }),
    execute: async ({ url, searchQuery, topN }) => {
      const result = await client(options).maps.create({ url, searchQuery, topN });
      const urls: string[] = [];
      for await (const found of result.urls()) urls.push(found);
      return { url, urls };
    },
  });

/** Crawl a website and return the markdown content of each page. */
export const olostepCrawl = (options: OlostepToolOptions = {}) =>
  tool({
    description:
      'Crawl a website from a starting URL and return the markdown content of each page found. Use to read several pages of a site, such as documentation.',
    inputSchema: z.object({
      url: z.string().url().describe('The URL to start crawling from'),
      maxPages: z.number().int().min(1).max(25).optional().describe('Maximum pages to crawl (default 5)'),
      includeUrls: z
        .array(z.string())
        .optional()
        .describe('Only crawl URLs matching these glob patterns, e.g. ["/docs/**"]'),
    }),
    execute: async ({ url, maxPages, includeUrls }) => {
      const olostep = client(options);
      const crawl = await olostep.crawls.create({ url, maxPages: maxPages ?? 5, includeUrls });
      await crawl.waitTillDone(waitOptions(options));

      const max = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
      const pages: { url: string; markdown: string }[] = [];
      for await (const page of crawl.pages()) {
        if (!page.retrieve_id) continue;
        const content = await olostep.retrieve.get({ retrieveId: page.retrieve_id, formats: [Format.MARKDOWN] });
        pages.push({ url: page.url ?? '', markdown: truncate(content.markdown_content, max) });
      }
      return { url, pages };
    },
  });

/** Scrape a list of URLs in one batch and return the markdown of each page. */
export const olostepBatch = (options: OlostepToolOptions = {}) =>
  tool({
    description:
      'Scrape several URLs in one batch and return the markdown of each page. Use when you already have a list of URLs to read; for one or two URLs use the scrape tool instead. Can take a minute or more.',
    inputSchema: z.object({
      urls: z.array(z.string().url()).min(1).max(20).describe('The URLs to scrape (up to 20)'),
    }),
    execute: async ({ urls }) => {
      const olostep = client(options);
      const batch = await olostep.batches.create(urls);
      await batch.waitTillDone(waitOptions(options));

      const max = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
      const pages: { url: string; markdown: string }[] = [];
      for await (const item of batch.items()) {
        if (!item.retrieve_id) continue;
        const content = await olostep.retrieve.get({ retrieveId: item.retrieve_id, formats: [Format.MARKDOWN] });
        pages.push({ url: item.url, markdown: truncate(content.markdown_content, max) });
      }
      return { pages };
    },
  });

/** All Olostep tools, keyed by name, ready to pass to `generateText` or `streamText`. */
export const olostepTools = (options: OlostepToolOptions = {}) => ({
  scrape: olostepScrape(options),
  search: olostepSearch(options),
  answer: olostepAnswer(options),
  map: olostepMap(options),
  crawl: olostepCrawl(options),
  batch: olostepBatch(options),
});
