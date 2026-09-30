'use client';

// Alerts / notification center (§4 US-6): actionable notifications with the
// one-line reason + deep link straight into the deal detail with reasoning.

import { useCallback, useEffect, useState } from 'react';
import { api, type NotificationDTO } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { BellOff, CheckCheck, ShieldAlert, Sparkles, TrendingDown, UserCheck, Zap } from 'lucide-react';

const KIND_META: Record<string, { icon: typeof Zap; className: string }> = {
  NEW_PICK: { icon: Sparkles, className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  RISK_ALERT: { icon: ShieldAlert, className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  PRICE_DROP: { icon: TrendingDown, className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  DRIFT_ALERT: { icon: Zap, className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  APPROVAL: { icon: UserCheck, className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
};

export function AlertsView() {
  const { toast } = useToast();
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const setDeepLinkLeadId = useTAStore((s) => s.setDeepLinkLeadId);
  const openLead = useTAStore((s) => s.openLead);
  const setView = useTAStore((s) => s.setView);
  const bumpDealRefresh = useTAStore((s) => s.bumpDealRefresh);

  const load = useCallback(async () => {
    try {
      const res = await api.notifications();
      setItems(res.notifications);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const open = (n: NotificationDTO) => {
    void api.markNotifications({ id: n.id }).then(load);
    if (n.leadId) {
      // deep link → deal detail with reasoning visible (US-6 AC)
      setDeepLinkLeadId(n.leadId);
      openLead(n.leadId);
      setView('picks');
      bumpDealRefresh();
    } else if (n.deepLink?.includes('view=team')) {
      setView('team');
    }
  };

  const markAll = async () => {
    await api.markNotifications({ all: true });
    toast({ title: 'All notifications marked read' });
    void load();
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 px-3 pb-24 pt-3 md:px-4">
      <header className="flex items-center gap-2">
        <div>
          <h1 className="text-lg font-bold leading-tight">Alerts</h1>
          <p className="text-xs text-muted-foreground">Push & Telegram previews — tap to open the deal with reasoning</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-11 px-3" onClick={markAll}>
          <CheckCheck className="mr-1 h-4 w-4" /> Mark all
        </Button>
      </header>

      {items === null ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center">
          <BellOff className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No notifications yet — high-confidence picks land here first.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const meta = KIND_META[n.kind] ?? KIND_META.NEW_PICK;
            const Icon = meta.icon;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cn('flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors active:bg-accent/60', !n.read && 'border-l-4 border-l-emerald-500')}
                >
                  <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.className)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{n.title}</span>
                      {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label="unread" />}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{n.body}</span>
                    <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {n.channel} · {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
