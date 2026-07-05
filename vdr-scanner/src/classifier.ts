import type { Classification } from './types.js';

export interface ClassifiableFile {
  id: string;
  name: string;
  path: string;
  content: string;
}

export interface Classifier {
  classify(file: ClassifiableFile): Promise<Classification>;
}

/**
 * JSON Schema for the classify_document prompt tool's structured output.
 * Wiring this as the output schema in Copilot Studio's prompt builder (or any
 * LLM API's structured-output mode) makes the model retry on shape mismatch,
 * so parseClassification failures become rare instead of routine.
 */
export const CLASSIFICATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['docType', 'irlItems', 'topics', 'parties', 'confidence', 'summary'],
  properties: {
    docType: {
      type: 'string',
      description: 'Document type, e.g. "articles of incorporation", "customer contract", "audited financial statements"',
    },
    irlItems: {
      type: 'array',
      items: { type: 'string' },
      description: 'IDs of the IRL checklist items this document evidences; empty if none',
    },
    topics: {
      type: 'array',
      items: { type: 'string' },
      description: 'Key topics present, e.g. "change of control", "exclusivity", "pension liabilities"',
    },
    parties: {
      type: 'array',
      items: { type: 'string' },
      description: 'Legal entities or persons that are parties to the document',
    },
    documentDate: {
      type: 'string',
      description: 'Effective or signature date in ISO 8601, if determinable',
    },
    governingLaw: {
      type: 'string',
      description: 'Governing law / jurisdiction, if stated',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence that the IRL mapping is correct',
    },
    summary: {
      type: 'string',
      description: 'One to three sentence summary of what this document is',
    },
  },
} as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

export function parseClassification(raw: unknown): Classification {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Classification must be a JSON object');
  }
  const record = raw as Record<string, unknown>;

  if (typeof record.docType !== 'string' || record.docType.length === 0) {
    throw new Error('Classification.docType must be a non-empty string');
  }
  if (!isStringArray(record.irlItems)) {
    throw new Error('Classification.irlItems must be an array of IRL item ids');
  }
  if (!isStringArray(record.topics)) {
    throw new Error('Classification.topics must be an array of strings');
  }
  if (!isStringArray(record.parties)) {
    throw new Error('Classification.parties must be an array of strings');
  }
  if (typeof record.confidence !== 'number' || record.confidence < 0 || record.confidence > 1) {
    throw new Error('Classification.confidence must be a number between 0 and 1');
  }
  if (typeof record.summary !== 'string') {
    throw new Error('Classification.summary must be a string');
  }
  if (record.documentDate !== undefined && typeof record.documentDate !== 'string') {
    throw new Error('Classification.documentDate must be a string when present');
  }
  if (record.governingLaw !== undefined && typeof record.governingLaw !== 'string') {
    throw new Error('Classification.governingLaw must be a string when present');
  }

  return {
    docType: record.docType,
    irlItems: record.irlItems,
    topics: record.topics,
    parties: record.parties,
    documentDate: record.documentDate as string | undefined,
    governingLaw: record.governingLaw as string | undefined,
    confidence: record.confidence,
    summary: record.summary,
  };
}
