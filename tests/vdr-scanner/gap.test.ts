import { describe, expect, it } from 'vitest';
import { Inventory } from '../../vdr-scanner/src/inventory.js';
import { analyzeGaps, renderGapReportMarkdown } from '../../vdr-scanner/src/gap.js';
import { parseClassification, CLASSIFICATION_JSON_SCHEMA } from '../../vdr-scanner/src/classifier.js';
import type { Classification, IrlItem } from '../../vdr-scanner/src/types.js';

const IRL: IrlItem[] = [
  { id: 'CORP-01', category: 'Corporate', title: 'Charter documents', description: 'Articles, bylaws', required: true },
  { id: 'FIN-01', category: 'Financial', title: 'Audited financial statements', description: 'Last 3 fiscal years', required: true },
  { id: 'TAX-01', category: 'Tax', title: 'Tax returns', description: 'Federal and state, 3 years', required: true },
  { id: 'HR-05', category: 'HR', title: 'Employee handbook', description: 'Current version', required: false },
];

function cls(irlItems: string[], confidence: number): Classification {
  return { docType: 'doc', irlItems, topics: [], parties: [], confidence, summary: 's' };
}

function seedInventory(): Inventory {
  const inventory = new Inventory();
  const add = (id: string, name: string) => {
    inventory.applyDeltaItem({
      id,
      name,
      size: 10,
      lastModifiedDateTime: 'v1',
      file: {},
      parentReference: { path: '/vdr' },
    });
  };
  add('a', 'charter.pdf');
  add('b', 'financials-2025.pdf');
  add('c', 'financials-maybe.pdf');
  add('d', 'random-photo.jpg');
  add('e', 'corrupt.pdf');

  inventory.markDone('a', cls(['CORP-01'], 0.95));
  inventory.markDone('b', cls(['FIN-01'], 0.4));
  inventory.markDone('c', cls(['FIN-01'], 0.5));
  inventory.markDone('d', cls([], 0.2));
  inventory.markError('e', 'unreadable', 1);
  return inventory;
}

describe('analyzeGaps', () => {
  it('separates satisfied, weak, gap, and optional-missing IRL items', () => {
    const report = analyzeGaps(IRL, seedInventory());

    expect(report.satisfied.map((s) => s.item.id)).toEqual(['CORP-01']);
    // FIN-01 has evidence but only below the confidence threshold.
    expect(report.weak.map((w) => w.item.id)).toEqual(['FIN-01']);
    expect(report.weak[0].files).toHaveLength(2);
    // TAX-01 is required with zero evidence: a hard gap.
    expect(report.gaps.map((g) => g.id)).toEqual(['TAX-01']);
    expect(report.optionalMissing.map((o) => o.id)).toEqual(['HR-05']);
    expect(report.unmappedFiles.map((u) => u.fileId)).toEqual(['d']);
    expect(report.errorFiles.map((e) => e.fileId)).toEqual(['e']);
  });

  it('renders a markdown report carrying the coverage equation', () => {
    const markdown = renderGapReportMarkdown(analyzeGaps(IRL, seedInventory()));
    expect(markdown).toContain('4 classified + 1 failed = 5 of 5 enumerated files (COMPLETE)');
    expect(markdown).toContain('TAX-01');
    expect(markdown).toContain('random-photo.jpg');
  });
});

describe('parseClassification', () => {
  it('accepts output matching the prompt schema', () => {
    const parsed = parseClassification({
      docType: 'customer contract',
      irlItems: ['COM-01'],
      topics: ['change of control'],
      parties: ['Acme Corp', 'Target Ltd'],
      documentDate: '2024-03-01',
      governingLaw: 'Delaware',
      confidence: 0.87,
      summary: 'MSA between Acme and Target.',
    });
    expect(parsed.irlItems).toEqual(['COM-01']);
    expect(parsed.governingLaw).toBe('Delaware');
  });

  it('rejects malformed model output with actionable messages', () => {
    expect(() => parseClassification(null)).toThrow(/JSON object/);
    expect(() => parseClassification({ docType: '', irlItems: [] })).toThrow(/docType/);
    expect(() =>
      parseClassification({ docType: 'x', irlItems: 'CORP-01', topics: [], parties: [], confidence: 0.5, summary: '' }),
    ).toThrow(/irlItems/);
    expect(() =>
      parseClassification({ docType: 'x', irlItems: [], topics: [], parties: [], confidence: 1.5, summary: '' }),
    ).toThrow(/confidence/);
  });

  it('schema required list matches the validator', () => {
    expect(CLASSIFICATION_JSON_SCHEMA.required).toEqual([
      'docType',
      'irlItems',
      'topics',
      'parties',
      'confidence',
      'summary',
    ]);
  });
});
