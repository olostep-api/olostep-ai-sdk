import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { asSchema } from 'ai';
import {
  olostepAnswer,
  olostepBatch,
  olostepCrawl,
  olostepMap,
  olostepResults,
  olostepScrape,
  olostepSearch,
  olostepTools,
} from '../src/index.js';

const KEY = 'test-key';

type Handler = (url: URL, init: { method?: string; headers: Record<string, string | string[] | undefined> }) => unknown;

class ApiError {
  constructor(readonly status: number, readonly body: unknown = {}) {}
}

// The Olostep SDK uses node-fetch, so the tools talk to this local server rather than a mocked global fetch.
let server: Server;
let apiBaseUrl: string;
let handler: Handler;
let calls: URL[];

function mockApi(next: Handler) {
  handler = next;
  calls = [];
  return calls;
}

function opts<T extends object>(extra?: T) {
  return { apiBaseUrl, ...extra };
}

before(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    calls.push(url);
    request.resume();
    request.on('end', () => {
      let status = 200;
      let body: unknown;
      try {
        body = handler(url, { method: request.method, headers: request.headers });
      } catch (error) {
        status = 500;
        body = { detail: String(error) };
      }
      if (body instanceof ApiError) {
        status = body.status;
        body = body.body;
      }
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

function run(toolInstance: { execute?: unknown }, input: unknown) {
  const execute = toolInstance.execute as (input: unknown, options: unknown) => Promise<any>;
  return execute(input, { toolCallId: 'test', messages: [] });
}

function accepts(toolInstance: { inputSchema: unknown }, input: unknown) {
  const schema = asSchema(toolInstance.inputSchema as Parameters<typeof asSchema>[0]);
  return Promise.resolve(schema.validate!(input)).then(result => result.success);
}

function items(count: number, start = 0) {
  return Array.from({ length: count }, (_, i) => ({ url: `https://a.com/${start + i}`, retrieve_id: `r${start + i}` }));
}

function finishedBatch(pages: (url: URL) => unknown): Handler {
  return (url, init) => {
    if (url.pathname.endsWith('/batches') && init.method === 'POST') return { id: 'batch_1', total_urls: 2 };
    if (url.pathname.endsWith('/batches/batch_1')) return { id: 'batch_1', status: 'completed' };
    if (url.pathname.endsWith('/batches/batch_1/items')) return pages(url);
    if (url.pathname.endsWith('/retrieve')) return { markdown_content: `content of ${url.searchParams.get('retrieve_id')}` };
    throw new Error(`Unexpected request ${url}`);
  };
}

beforeEach(() => {
  process.env.OLOSTEP_API_KEY = KEY;
});

test('batch accepts the 100k limit and rejects more', async () => {
  const batch = olostepBatch();
  const urls = (count: number) => ({ urls: Array.from({ length: count }, () => 'https://a.com') });
  assert.equal(await accepts(batch, urls(100_000)), true);
  assert.equal(await accepts(batch, urls(100_001)), false);
  assert.equal(await accepts(batch, urls(0)), false);
});

test('crawl, map and search accept their documented limits', async () => {
  assert.equal(await accepts(olostepCrawl(), { url: 'https://a.com', maxPages: 100_000 }), true);
  assert.equal(await accepts(olostepCrawl(), { url: 'https://a.com', maxPages: 100_001 }), false);
  assert.equal(await accepts(olostepMap(), { url: 'https://a.com', topN: 100_000 }), true);
  assert.equal(await accepts(olostepSearch(), { query: 'q', limit: 25 }), true);
  assert.equal(await accepts(olostepSearch(), { query: 'q', limit: 26 }), false);
});

test('batch returns the pages of a finished job', async () => {
  const calls = mockApi(finishedBatch(() => ({ items: items(2), cursor: null })));
  const result = await run(olostepBatch(opts()), { urls: ['https://a.com/0', 'https://a.com/1'] });

  assert.deepEqual(result, {
    id: 'batch_1',
    status: 'completed',
    pages: [
      { url: 'https://a.com/0', markdown: 'content of r0' },
      { url: 'https://a.com/1', markdown: 'content of r1' },
    ],
  });
  const list = calls.find(url => url.pathname.endsWith('/items'))!;
  assert.equal(list.searchParams.get('limit'), '20');
  assert.equal(list.searchParams.get('status'), 'completed');
});

test('a full page returns nextCursor and the results tool continues from it', async () => {
  const calls = mockApi(
    finishedBatch(url => {
      const cursor = Number(url.searchParams.get('cursor') ?? 0);
      if (cursor === 0) return { items: items(2), cursor: 2 };
      return cursor === 2 ? { items: items(1, 2), cursor: 3 } : { items: [] };
    }),
  );
  const first = await run(olostepResults(opts({ pagesPerCall: 2 })), { id: 'batch_1' });
  assert.equal(first.pages.length, 2);
  assert.equal(first.nextCursor, '2');

  const second = await run(olostepResults(opts({ pagesPerCall: 2 })), { id: 'batch_1', cursor: first.nextCursor });
  assert.equal(second.pages[0].url, 'https://a.com/2');
  assert.equal(second.nextCursor, '3');

  const third = await run(olostepResults(opts({ pagesPerCall: 2 })), { id: 'batch_1', cursor: second.nextCursor });
  assert.deepEqual(third.pages, []);
  assert.equal(third.nextCursor, undefined);
  assert.deepEqual(calls.filter(url => url.pathname.endsWith('/items')).map(url => url.searchParams.get('cursor')), [null, '2', '3']);
});

test('pagesPerCall stays between 1 and 100', async () => {
  for (const [pagesPerCall, expected] of [[500, '100'], [0, '1'], [-5, '1']] as const) {
    const calls = mockApi(finishedBatch(() => ({ items: [], cursor: null })));
    await run(olostepResults(opts({ pagesPerCall })), { id: 'batch_1' });
    assert.equal(calls.find(url => url.pathname.endsWith('/items'))!.searchParams.get('limit'), expected);
  }
});

test('a job that outlasts the wait returns its id instead of failing', async () => {
  mockApi(url => (url.pathname.endsWith('/batches') ? { id: 'batch_1', total_urls: 1 } : { status: 'in_progress' }));
  const result = await run(olostepBatch(opts({ timeoutSeconds: 0 })), { urls: ['https://a.com'] });
  assert.equal(result.id, 'batch_1');
  assert.equal(result.status, 'in_progress');
  assert.equal(result.pages, undefined);
});

test('the results tool reports a job that is still running', async () => {
  mockApi(() => ({ status: 'in_progress' }));
  assert.equal((await run(olostepResults(opts()), { id: 'crawl_1' })).status, 'in_progress');
});

test('crawl reads pages from the crawl endpoint', async () => {
  const calls = mockApi((url, init) => {
    if (url.pathname.endsWith('/crawls') && init.method === 'POST') return { id: 'crawl_1', status: 'in_progress' };
    if (url.pathname.endsWith('/crawls/crawl_1')) return { id: 'crawl_1', status: 'completed' };
    if (url.pathname.endsWith('/crawls/crawl_1/pages')) return { pages: items(1), cursor: null };
    return { markdown_content: 'page' };
  });
  const result = await run(olostepCrawl(opts()), { url: 'https://a.com' });
  assert.deepEqual(result.pages, [{ url: 'https://a.com/0', markdown: 'page' }]);
  assert.equal(calls.find(url => url.pathname.endsWith('/pages'))!.searchParams.has('status'), false);
});

test('a page that fails to load is reported without losing the others', async () => {
  mockApi(url => {
    if (url.pathname.endsWith('/batches/batch_1')) return { status: 'completed' };
    if (url.pathname.endsWith('/items')) return { items: items(2), cursor: null };
    if (url.searchParams.get('retrieve_id') === 'r0') return new ApiError(404, { detail: 'gone' });
    return { markdown_content: 'ok' };
  });
  const { pages } = await run(olostepResults(opts()), { id: 'batch_1' });
  assert.equal(pages[0].markdown, '');
  assert.ok(pages[0].error);
  assert.equal(pages[1].markdown, 'ok');
});

test('list errors do not expose the API key', async () => {
  mockApi(url => {
    if (url.pathname.endsWith('/items')) return new ApiError(401);
    return { status: 'completed' };
  });
  await assert.rejects(run(olostepResults(opts()), { id: 'batch_1' }), error => {
    assert.match(String(error), /HTTP 401/);
    assert.doesNotMatch(String(error), new RegExp(KEY));
    return true;
  });
});

test('the API key option is sent as a bearer token', async () => {
  delete process.env.OLOSTEP_API_KEY;
  let header: string | undefined;
  mockApi((url, init) => {
    if (url.pathname.endsWith('/items')) {
      header = init.headers.authorization as string;
      return { items: [], cursor: null };
    }
    return { status: 'completed' };
  });
  await run(olostepResults(opts({ apiKey: 'option-key' })), { id: 'batch_1' });
  assert.equal(header, 'Bearer option-key');
});

test('results rejects an unknown id', async () => {
  await assert.rejects(run(olostepResults(opts()), { id: 'job_1' }), /crawl or batch id/);
});

test('scrape truncates content to maxCharacters', async () => {
  mockApi(() => ({ id: 's', result: { markdown_content: 'x'.repeat(50) }, markdown_content: 'x'.repeat(50) }));
  const { markdown } = await run(olostepScrape(opts({ maxCharacters: 10 })), { url: 'https://a.com' });
  assert.equal(markdown, `${'x'.repeat(10)}\n\n[truncated]`);
});

test('answer unwraps the JSON result', async () => {
  const answer = JSON.stringify({ result: 'Tokyo' });
  mockApi(() => ({ id: 'a', answer, json_content: answer, result: { json_content: answer, sources: ['https://a.com'] }, sources: ['https://a.com'] }));
  const result = await run(olostepAnswer(opts()), { task: 'Capital of Japan?' });
  assert.equal(result.answer, 'Tokyo');
});

test('olostepTools exposes every tool', () => {
  assert.deepEqual(Object.keys(olostepTools()).sort(), ['answer', 'batch', 'crawl', 'map', 'results', 'scrape', 'search']);
});
