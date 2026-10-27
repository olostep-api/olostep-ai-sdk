// An agent that uses Olostep tools through the Vercel AI Gateway.
// Run: OLOSTEP_API_KEY=... AI_GATEWAY_API_KEY=... npx tsx examples/agent.ts
import { generateText, isStepCount } from 'ai';
import { olostepTools } from '../src/index.js';

const { text, steps } = await generateText({
  model: 'openai/gpt-5-mini',
  tools: olostepTools(),
  stopWhen: isStepCount(5),
  prompt: 'Find the Olostep docs page about crawling and summarize how to crawl a website, with the source URL.',
});

console.log('Tools called:', steps.flatMap(s => s.toolCalls.map(c => c.toolName)));
console.log(text);
