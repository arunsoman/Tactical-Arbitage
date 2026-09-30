// Shared ranking context — loads every learning/trust input once per request so
// multiple routes (picks, NL search, status) share identical semantics.

import { db } from '@/lib/db';
import { parseJsonArray } from '../types';
import { computeAccountHealth, personalizationStrength } from './health';
import { buildAffinity, buildCalibration, buildSuppressionLists } from './ranking';
import type { Outcome } from '@prisma/client';
import type { AccountHealthDTO, PersonalizationStrength } from './types';
import type { CalibrationTable, CategoryAffinity, SuppressionLists } from './ranking';

export interface RankingContext {
  settings: NonNullable<Awaited<ReturnType<typeof db.settings.findUnique>>>;
  calibration: CalibrationTable;
  affinity: CategoryAffinity;
  suppressionLists: SuppressionLists;
  health: AccountHealthDTO;
  strength: PersonalizationStrength;
  purchaseOutcomeCount: number;
  outcomes: Outcome[];
}

export async function buildRankingContext(): Promise<RankingContext> {
  const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) throw new Error('Settings not initialized');

  const outcomes = await db.outcome.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  const winByLead = new Map<string, boolean>();
  for (const o of outcomes) {
    if (!winByLead.has(o.leadId)) winByLead.set(o.leadId, o.netProfit > 0 && o.roiPct >= settings.minRoi / 2);
  }
  const outcomeLeadIds = Array.from(winByLead.keys());
  const outcomeLeads = outcomeLeadIds.length
    ? await db.lead.findMany({ where: { id: { in: outcomeLeadIds } }, select: { id: true, score: true, category: true } })
    : [];
  const scoreByLead = new Map(outcomeLeads.map((l) => [l.id, l.score]));
  const categoryByLead = new Map(outcomeLeads.map((l) => [l.id, l.category]));

  const calibration = buildCalibration(outcomes, winByLead, scoreByLead);
  const purchaseOutcomeCount = outcomes.filter((o) =>
    ['BOUGHT', 'MULTI_UNIT', 'PARTIAL', 'RETURNED'].includes(o.type)
  ).length;
  const strength = personalizationStrength(purchaseOutcomeCount);
  const affinity = buildAffinity(outcomes, winByLead, categoryByLead, strength);
  const suppressionLists = buildSuppressionLists(await db.suppression.findMany());
  const health = await computeAccountHealth();

  // settings.excludedBrands/Asins also act as trust-level exclusions for NL queries.
  for (const b of parseJsonArray(settings.excludedBrands)) suppressionLists.brands.add(b.toLowerCase());
  for (const a of parseJsonArray(settings.excludedAsins)) suppressionLists.asins.add(a.toUpperCase());

  return { settings, calibration, affinity, suppressionLists, health, strength, purchaseOutcomeCount, outcomes };
}
