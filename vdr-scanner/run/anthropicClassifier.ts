import type { Classifier, ClassifiableFile } from '../src/classifier.js';
import { parseClassification } from '../src/classifier.js';
import type { Classification, IrlItem } from '../src/types.js';

interface AnthropicOptions {
  apiKey: string;
  irl: IrlItem[];
  model?: string;
  maxContentChars?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Classifier backed by the Anthropic Messages API. This is the only place the
 * runnable CLI talks to an LLM; swap this file to target a different provider
 * without touching the scan engine.
 */
export class AnthropicClassifier implements Classifier {
  private readonly apiKey: string;
  private readonly irlCatalog: string;
  private readonly model: string;
  private readonly maxContentChars: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnthropicOptions) {
    this.apiKey = options.apiKey;
    this.irlCatalog = JSON.stringify(options.irl, null, 2);
    this.model = options.model ?? 'claude-sonnet-5';
    this.maxContentChars = options.maxContentChars ?? 24_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async classify(file: ClassifiableFile): Promise<Classification> {
    const content = file.content.slice(0, this.maxContentChars);
    const prompt = [
      'You are a due-diligence document analyst. Classify one data-room document.',
      '',
      `<irl_catalog>\n${this.irlCatalog}\n</irl_catalog>`,
      '',
      `<document name="${file.name}" path="${file.path}">\n${content}\n</document>`,
      '',
      'Return ONLY a JSON object with fields: docType (string), irlItems (array of matching IRL ids, empty if none), topics (array of strings), parties (array of strings), documentDate (ISO string, optional), governingLaw (string, optional), confidence (number 0-1 that the irlItems mapping is right; below 0.6 if guessing), summary (1-3 sentences). Map an IRL item only when the document genuinely provides evidence for it, not on a mere mention. Never invent parties, dates, or laws not in the text.',
    ].join('\n');

    const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === 'text')?.text ?? '';
    return parseClassification(extractJson(text));
  }
}

/** Models sometimes wrap JSON in prose or fences; pull out the object. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in model output: ${text.slice(0, 200)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
