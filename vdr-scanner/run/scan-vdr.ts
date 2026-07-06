/**
 * One-command VDR scan. No Copilot, no agent platform — just a script.
 *
 *   export GRAPH_TOKEN=...       # a Microsoft Graph access token (see run/README.md)
 *   export ANTHROPIC_API_KEY=... # for classification
 *   node scan-vdr.js "<SharePoint library URL>"
 *
 * Writes gap-report.md and classifications.json next to where you run it.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { GraphClient } from '../src/graphClient.js';
import { resolveDriveFromUrl } from '../src/resolveDrive.js';
import { Inventory } from '../src/inventory.js';
import { runScan } from '../src/scanner.js';
import { analyzeGaps, renderGapReportMarkdown } from '../src/gap.js';
import type { FileRecord, IrlItem } from '../src/types.js';
import { AnthropicClassifier } from './anthropicClassifier.js';

interface Env {
  graphToken: string;
  anthropicKey: string;
  irlPath: string;
  url: string;
}

function readEnv(argv: string[]): Env {
  const url = argv[2];
  const graphToken = process.env.GRAPH_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const irlPath = process.env.IRL_PATH ?? new URL('../irl/sample-irl.json', import.meta.url).pathname;

  const problems: string[] = [];
  if (!url) problems.push('Missing argument: the SharePoint library URL.');
  if (!graphToken) problems.push('Missing env GRAPH_TOKEN (a Microsoft Graph access token).');
  if (!anthropicKey) problems.push('Missing env ANTHROPIC_API_KEY.');
  if (problems.length > 0) {
    throw new Error(
      `${problems.join('\n')}\n\nUsage: node scan-vdr.js "<SharePoint library URL>"`,
    );
  }
  return { graphToken: graphToken!, anthropicKey: anthropicKey!, irlPath, url: url! };
}

async function loadIrl(path: string): Promise<IrlItem[]> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as { items?: IrlItem[] };
  if (!Array.isArray(raw.items)) throw new Error(`IRL file ${path} has no "items" array`);
  return raw.items;
}

async function main(): Promise<void> {
  const env = readEnv(process.argv);
  const irl = await loadIrl(env.irlPath);

  const client = new GraphClient({ getToken: () => env.graphToken });

  process.stdout.write(`Resolving ${env.url} ...\n`);
  const drive = await resolveDriveFromUrl(client, env.url);
  process.stdout.write(`  library: ${drive.name} (drive ${drive.driveId})\n`);

  const inventory = new Inventory();
  const classifier = new AnthropicClassifier({ apiKey: env.anthropicKey, irl });

  const fetchContent = async (record: FileRecord): Promise<string> => {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${drive.driveId}/items/${record.id}/content`,
      { headers: { Authorization: `Bearer ${env.graphToken}` } },
    );
    if (!res.ok) throw new Error(`content fetch ${res.status} for ${record.path}`);
    // Real deployments extract text from PDF/DOCX here; for text-native files
    // the raw body is already usable.
    return res.text();
  };

  process.stdout.write('Scanning ...\n');
  const report = await runScan({
    client,
    driveId: drive.driveId,
    inventory,
    classifier,
    fetchContent,
    onProgress: (r) =>
      process.stdout.write(`  ${r.done + r.error}/${r.enumerated} processed\r`),
  });

  const gaps = analyzeGaps(irl, inventory);
  await writeFile('gap-report.md', renderGapReportMarkdown(gaps), 'utf8');
  await writeFile('classifications.json', JSON.stringify(inventory.toJSON(), null, 2), 'utf8');

  process.stdout.write(
    `\nDone. ${report.reconciliation.done} classified, ${report.reconciliation.error} errors, ` +
      `${gaps.gaps.length} required gaps.\n` +
      `Wrote gap-report.md and classifications.json.\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
