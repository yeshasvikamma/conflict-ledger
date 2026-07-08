// =============================================================================
// api/server.ts — the read API (thin, JSON, read-only)
// =============================================================================
// Wires all routes. Tier A routes are live targets; Tier B routes are mounted
// but return 501 until implemented. Ownership per route is noted in each file.
//
// Run:  pnpm run api   (defaults to http://localhost:8787)
// =============================================================================

import 'dotenv/config';
import express from 'express';
import { getCounters, getCounterBreakdown } from './counters.ts';
import { getSources } from './sources.ts';
import { getTimeline } from './timeline.ts';
import { getMap } from './map.ts';
import { getEvent } from './event.ts';
import { getEntity } from './entity.ts';

const app = express();

// Permissive CORS for the local frontend during the hackathon.
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Tier A ──
app.get('/counters', getCounters);
app.get('/counters/:key/breakdown', getCounterBreakdown);
app.get('/sources', getSources);

// ── Tier B (mounted now, implemented later) ──
app.get('/timeline', getTimeline);
app.get('/map', getMap);
app.get('/event/:id', getEvent);
app.get('/entity/:id', getEntity);

const PORT = Number(process.env.API_PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
