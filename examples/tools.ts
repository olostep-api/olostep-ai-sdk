// Calls each tool directly (no LLM), to check the Olostep side works.
// Run: OLOSTEP_API_KEY=... npx tsx examples/tools.ts
import { olostepTools } from '../src/index.js';

const tools = olostepTools();

// Calls a tool the way the AI SDK would after the model picks it.
async function run(name: keyof typeof tools, input: Record<string, unknown>) {
  const execute = tools[name].execute as (input: unknown, options: unknown) => Promise<any>;
  return execute(input, { toolCallId: 'test', messages: [], context: {} });
}

const scrape = await run('scrape', { url: 'https://docs.olostep.com' });
console.log('scrape:', scrape.url, `${scrape.markdown.length} chars`);

const search = await run('search', { query: 'Vercel AI SDK tools', limit: 3 });
console.log('search:', search.results.map((r: { url: string }) => r.url));

const answer = await run('answer', { task: 'What is the latest stable version of Next.js?' });
console.log('answer:', answer.answer, answer.sources.slice(0, 2));

const map = await run('map', { url: 'https://docs.olostep.com', topN: 5 });
console.log('map:', map.urls);

const crawl = await run('crawl', { url: 'https://docs.olostep.com', maxPages: 2 });
console.log('crawl:', crawl.pages.map((p: { url: string; markdown: string }) => `${p.url} (${p.markdown.length} chars)`));

const batch = await run('batch', { urls: ['https://docs.olostep.com', 'https://www.olostep.com'] });
console.log('batch:', batch.pages.map((p: { url: string; markdown: string }) => `${p.url} (${p.markdown.length} chars)`));
