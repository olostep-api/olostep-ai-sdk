import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { generateText, isStepCount } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { olostepTools } from '../src/index.js';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

test('an agent can call a tool and use its result', async () => {
  const server = createServer((request, response) => {
    request.resume();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ result: { links: [{ title: 'Olostep', url: 'https://www.olostep.com', description: 'Web data' }] } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;

  const prompts: unknown[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async options => {
      prompts.push(options.prompt);
      const content =
        prompts.length === 1
          ? [{ type: 'tool-call' as const, toolCallId: 'c1', toolName: 'search', input: '{"query":"olostep"}' }]
          : [{ type: 'text' as const, text: 'Found it.' }];
      const unified = prompts.length === 1 ? ('tool-calls' as const) : ('stop' as const);
      return { content, finishReason: { unified, raw: undefined }, usage, warnings: [] };
    },
  });

  const { text, steps } = await generateText({
    model,
    tools: olostepTools({ apiKey: 'test-key', apiBaseUrl }),
    stopWhen: isStepCount(3),
    prompt: 'Find Olostep',
  });

  server.closeAllConnections();
  server.close();

  assert.equal(text, 'Found it.');
  assert.equal(steps.length, 2);
  assert.match(JSON.stringify(prompts[1]), /www\.olostep\.com/);
});
