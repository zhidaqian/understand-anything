import type { Inventory } from './inventory.js';
import type { EvidenceRef, GapReport, IrlItem } from './types.js';

export interface GapOptions {
  /** IRL mappings below this confidence count as weak evidence. */
  confidenceThreshold?: number;
}

/**
 * IRL gap analysis as a deterministic join between the checklist and the
 * classified inventory — no LLM step, so every "missing" verdict is auditable
 * back to concrete rows.
 */
export function analyzeGaps(
  irl: IrlItem[],
  inventory: Inventory,
  options: GapOptions = {},
): GapReport {
  const threshold = options.confidenceThreshold ?? 0.6;

  const evidenceByItem = new Map<string, EvidenceRef[]>();
  const unmappedFiles: GapReport['unmappedFiles'] = [];

  for (const record of inventory.byStatus('done')) {
    const classification = record.classification;
    if (!classification || classification.irlItems.length === 0) {
      unmappedFiles.push({ fileId: record.id, path: record.path });
      continue;
    }
    for (const itemId of classification.irlItems) {
      const refs = evidenceByItem.get(itemId) ?? [];
      refs.push({ fileId: record.id, path: record.path, confidence: classification.confidence });
      evidenceByItem.set(itemId, refs);
    }
  }

  const satisfied: GapReport['satisfied'] = [];
  const weak: GapReport['weak'] = [];
  const gaps: IrlItem[] = [];
  const optionalMissing: IrlItem[] = [];

  for (const item of irl) {
    const files = evidenceByItem.get(item.id) ?? [];
    if (files.length === 0) {
      (item.required ? gaps : optionalMissing).push(item);
    } else if (files.some((f) => f.confidence >= threshold)) {
      satisfied.push({ item, files });
    } else {
      weak.push({ item, files });
    }
  }

  const errorFiles = inventory
    .byStatus('error')
    .map((r) => ({ fileId: r.id, path: r.path, lastError: r.lastError }));

  return {
    satisfied,
    weak,
    gaps,
    optionalMissing,
    unmappedFiles,
    errorFiles,
    reconciliation: inventory.reconcile(),
  };
}

export function renderGapReportMarkdown(report: GapReport): string {
  const lines: string[] = [];
  const r = report.reconciliation;
  lines.push('# VDR / IRL Gap Report');
  lines.push('');
  lines.push(
    `Coverage: ${r.done} classified + ${r.error} failed = ${r.done + r.error} of ${r.enumerated} enumerated files (${r.complete ? 'COMPLETE' : 'INCOMPLETE'})`,
  );
  lines.push('');

  lines.push(`## Gaps — required IRL items with no evidence (${report.gaps.length})`);
  for (const item of report.gaps) {
    lines.push(`- **${item.id}** [${item.category}] ${item.title}`);
  }
  lines.push('');

  lines.push(`## Weak evidence — only low-confidence matches (${report.weak.length})`);
  for (const { item, files } of report.weak) {
    lines.push(`- **${item.id}** ${item.title} — ${files.map((f) => f.path).join(', ')}`);
  }
  lines.push('');

  lines.push(`## Satisfied (${report.satisfied.length})`);
  for (const { item, files } of report.satisfied) {
    lines.push(`- **${item.id}** ${item.title} — ${files.length} document(s)`);
  }
  lines.push('');

  lines.push(`## Unmapped files (${report.unmappedFiles.length})`);
  for (const file of report.unmappedFiles) {
    lines.push(`- ${file.path}`);
  }
  lines.push('');

  lines.push(`## Files that failed processing (${report.errorFiles.length})`);
  for (const file of report.errorFiles) {
    lines.push(`- ${file.path} — ${file.lastError ?? 'unknown error'}`);
  }
  lines.push('');

  return lines.join('\n');
}
