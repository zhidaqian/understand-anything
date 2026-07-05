// Microsoft Graph driveItem subset returned by /delta with our $select.
export interface DriveItem {
  id: string;
  name?: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  deleted?: { state?: string };
  parentReference?: { path?: string; driveId?: string };
}

export interface DeltaPage {
  value: DriveItem[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

export type FileStatus = 'pending' | 'done' | 'error' | 'removed';

export interface Classification {
  docType: string;
  irlItems: string[];
  topics: string[];
  parties: string[];
  documentDate?: string;
  governingLaw?: string;
  confidence: number;
  summary: string;
}

export interface FileRecord {
  id: string;
  name: string;
  path: string;
  size: number;
  lastModified: string;
  status: FileStatus;
  attempts: number;
  classification?: Classification;
  lastError?: string;
}

export interface Reconciliation {
  enumerated: number;
  pending: number;
  done: number;
  error: number;
  removed: number;
  complete: boolean;
}

export interface IrlItem {
  id: string;
  category: string;
  title: string;
  description: string;
  required: boolean;
}

export interface EvidenceRef {
  fileId: string;
  path: string;
  confidence: number;
}

export interface GapReport {
  satisfied: { item: IrlItem; files: EvidenceRef[] }[];
  weak: { item: IrlItem; files: EvidenceRef[] }[];
  gaps: IrlItem[];
  optionalMissing: IrlItem[];
  unmappedFiles: { fileId: string; path: string }[];
  errorFiles: { fileId: string; path: string; lastError?: string }[];
  reconciliation: Reconciliation;
}
