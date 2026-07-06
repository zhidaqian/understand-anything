import { describe, expect, it } from 'vitest';
import { AnthropicClassifier, extractJson } from '../../vdr-scanner/run/anthropicClassifier.js';
import type { IrlItem } from '../../vdr-scanner/src/types.js';

const IRL: IrlItem[] = [
  { id: 'TAX-01', category: 'Tax', title: 'Tax returns', description: '3 years', required: true },
];

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    expect(extractJson('{"docType":"x","confidence":0.5}')).toEqual({ docType: 'x', confidence: 0.5 });
  });

  it('parses JSON wrapped in a ```json fence', () => {
    const text = 'Here you go:\n```json\n{"docType":"charter"}\n```\nHope that helps.';
    expect(extractJson(text)).toEqual({ docType: 'charter' });
  });

  it('parses JSON embedded in surrounding prose', () => {
    expect(extractJson('The answer is {"a":1} as shown.')).toEqual({ a: 1 });
  });

  it('throws when there is no JSON object', () => {
    expect(() => extractJson('no json here')).toThrow(/No JSON object/);
  });
});

describe('AnthropicClassifier', () => {
  it('sends the IRL catalog + document and parses the model response', async () => {
    const calls: { url: string; body: any }[] = [];
    const fakeFetch = (async (url: string, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: '```json\n{"docType":"tax return","irlItems":["TAX-01"],"topics":["tax"],"parties":[],"confidence":0.9,"summary":"2024 federal return."}\n```',
            },
          ],
        }),
        text: async () => '',
      };
    }) as unknown as typeof fetch;

    const classifier = new AnthropicClassifier({ apiKey: 'k', irl: IRL, fetchImpl: fakeFetch });
    const result = await classifier.classify({
      id: 'f1',
      name: 'return-2024.pdf',
      path: '/vdr/tax/return-2024.pdf',
      content: 'Form 1040 ...',
    });

    expect(result.irlItems).toEqual(['TAX-01']);
    expect(result.confidence).toBe(0.9);
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].body.messages[0].content).toContain('TAX-01');
    expect(calls[0].body.messages[0].content).toContain('return-2024.pdf');
  });

  it('surfaces API errors instead of returning junk', async () => {
    const fakeFetch = (async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => 'rate limited',
    })) as unknown as typeof fetch;

    const classifier = new AnthropicClassifier({ apiKey: 'k', irl: IRL, fetchImpl: fakeFetch });
    await expect(
      classifier.classify({ id: 'f1', name: 'x.pdf', path: '/x.pdf', content: 'y' }),
    ).rejects.toThrow(/Anthropic API 429/);
  });
});
