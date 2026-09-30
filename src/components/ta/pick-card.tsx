'use client';

// AI Pick card (§4 US-1): thumb-friendly vertical-scroll card. Always visible:
// image / title / key numbers / ONE-LINE evidence reason / CTA. Large tap
// targets (≥44pt). Tap anywhere → full mobile detail sheet.

import { memo } from 'react';
import type { PickDTO } from '@/lib/ta/ai/types';
import { AiScoreRing, ConfidenceBadge, FreshnessDot } from './ai-bits';
import { ProductImage } from './product-image';
import { fmtMoney } from '@/lib/ta/profit';
import { cn } from '@/lib/utils';
import { Bookmark, ChevronRight, Heart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { parseJsonArray } from '@/lib/ta/types';

interface PickCardProps {
  pick: PickDTO;
  onOpen: (pick: PickDTO) => void;
  onSave: (pick: PickDTO) => void;
  saved?: boolean;
}

export const PickCard = memo(function PickCard({ pick, onOpen, onSave, saved }: PickCardProps) {
  const { lead, confidence } = pick;
  const flags = parseJsonArray(lead.riskFlags).filter((f) => ['GATED', 'HAZMAT', 'IP_CLAIM'].includes(f));

  return (
    <article
      className="w-full overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-colors active:bg-accent/50"
      role="button"
      tabIndex={0}
      aria-label={`${lead.title} — ${fmtMoney(lead.netProfit)} profit, ${Math.round(lead.roiPct)}% ROI`}
      onClick={() => onOpen(pick)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(pick);
        }
      }}
    >
      <div className="flex gap-3 p-3">
        {/* image */}
        <div className="shrink-0">
          <ProductImage imageKey={lead.imageUrl} title={lead.title} category={lead.category} className="h-20 w-20 rounded-xl text-lg" />
        </div>

        {/* body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold leading-snug">{lead.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {lead.retailerName} <span aria-hidden>·</span> {lead.asin} <span aria-hidden>·</span> {lead.brand}
              </p>
            </div>
            <AiScoreRing score={pick.aiScore} className="shrink-0" />
          </div>

          {/* key numbers — the three numbers a buyer needs */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(lead.netProfit)}</span>
            <span className="text-sm font-semibold">{Math.round(lead.roiPct)}% ROI</span>
            <span className="text-xs text-muted-foreground">buy {fmtMoney(lead.retailerPrice)} → sell {fmtMoney(lead.buyBox)}</span>
          </div>

          {/* one-line evidence reason — always visible (US-1 AC) */}
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground">Why: </span>
            {pick.reason}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ConfidenceBadge confidence={confidence} />
            <FreshnessDot ageH={lead.priceAgeH} fresh={lead.fresh} />
            {flags.map((f) => (
              <Badge key={f} variant="outline" className="border-red-500/40 px-1.5 py-0 text-[10px] text-red-600 dark:text-red-400">
                {f.replace('_', ' ')}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* CTA row — one-thumb reach (US-1/US-4) */}
      <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2">
        <span className="text-[11px] text-muted-foreground">
          est. ~{pick.estMonthlySales} sales/mo · breakeven {fmtMoney(lead.breakeven)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label={pick.inPipeline || saved ? 'Saved to pipeline' : 'Save to pipeline'}
            className={cn('flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors', pick.inPipeline || saved ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-secondary text-secondary-foreground active:bg-accent')}
            onClick={(e) => {
              e.stopPropagation();
              onSave(pick);
            }}
          >
            {pick.inPipeline || saved ? <Bookmark className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
            {pick.inPipeline || saved ? 'Saved' : 'Save'}
          </button>
          <span className="flex h-11 min-w-[44px] items-center justify-center text-muted-foreground" aria-hidden>
            <ChevronRight className="h-5 w-5" />
          </span>
        </div>
      </div>
    </article>
  );
});
