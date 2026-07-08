// =============================================================================
// pipeline/run.ts — orchestrate the pipeline  [Person C]
// =============================================================================
// Tier A order: extract -> disagreement -> cluster -> snapshots.
// Tier B adds: geocode + zones (only after Tier A is green).
//
// Run:  pnpm run pipeline
// =============================================================================

import 'dotenv/config';
import { runExtraction } from './extract.ts';
import { runDisagreementDetection } from './disagreement.ts';
import { runClustering } from './cluster.ts';
import { computeSnapshots } from './snapshots.ts';

async function runPipeline(): Promise<void> {
  console.log('[pipeline] extract...');
  await runExtraction();

  console.log('[pipeline] disagreement...');
  await runDisagreementDetection();

  console.log('[pipeline] cluster...');
  await runClustering();

  console.log('[pipeline] snapshots...');
  await computeSnapshots();

  console.log('[pipeline] done.');
}

runPipeline()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[pipeline] FAILED:', err);
    process.exit(1);
  });
