export type {
  DriveItem,
  DeltaPage,
  FileStatus,
  FileRecord,
  Classification,
  Reconciliation,
  IrlItem,
  EvidenceRef,
  GapReport,
} from './types.js';
export { GraphClient, GraphError } from './graphClient.js';
export type { HttpFetch, HttpResponse, GraphResult, GraphClientOptions } from './graphClient.js';
export { walkDelta } from './deltaWalker.js';
export type { WalkOptions, WalkResult } from './deltaWalker.js';
export { Inventory } from './inventory.js';
export type { ApplyOutcome } from './inventory.js';
export { CLASSIFICATION_JSON_SCHEMA, parseClassification } from './classifier.js';
export type { Classifier, ClassifiableFile } from './classifier.js';
export { runScan } from './scanner.js';
export type { ScanOptions, ScanReport } from './scanner.js';
export { analyzeGaps, renderGapReportMarkdown } from './gap.js';
export type { GapOptions } from './gap.js';
