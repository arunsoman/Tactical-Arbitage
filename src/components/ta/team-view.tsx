'use client';

// VA / Team (§5): Owner / Manager / VA roles, approval workflow, suppression
// management, and the immutable audit trail — all core actions mobile-first.

import { useCallback, useEffect, useState } from 'react';
import { api, type AuditEventDTO, type TeamMemberDTO, type ApprovalDTO } from '@/lib/ta/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Check, ScrollText, ShieldCheck, UserPlus, X } from 'lucide-react';

const ROLE_STYLE: Record<string, string> = {
  OWNER: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  MANAGER: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  VA: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
};

export function TeamView() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'team' | 'audit'>('team');
  const [members, setMembers] = useState<TeamMemberDTO[] | null>(null);
  const [approvals, setApprovals] = useState<ApprovalDTO[]>([]);
  const [events, setEvents] = useState<AuditEventDTO[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('VA');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([api.team(), api.audit('ALL')]);
      setMembers(t.members);
      setApprovals(t.approvals);
      setEvents(a.events);
    } catch {
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addMember = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.addTeamMember({ name: name.trim(), role, email: email || undefined });
      toast({ title: `${name.trim()} added as ${role}` });
      setName('');
      setEmail('');
      void load();
    } catch (e) {
      toast({ title: 'Could not add member', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const decide = async (approval: ApprovalDTO, decision: 'APPROVED' | 'REJECTED') => {
    await api.decideApproval({ id: approval.id, decision, decidedBy: 'Sofia', decidedByRole: 'OWNER' });
    toast({ title: decision === 'APPROVED' ? 'Approved — action executed' : 'Rejected', description: `Request by ${approval.requestedBy} · audit event recorded` });
    void load();
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 px-3 pb-24 pt-3 md:px-4">
      <header>
        <h1 className="text-lg font-bold leading-tight">Team & governance</h1>
        <p className="text-xs text-muted-foreground">Roles, approvals, suppressions and the immutable audit trail</p>
      </header>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(['team', 'audit'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn('flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors', tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground')}
          >
            {t === 'team' ? <ShieldCheck className="h-4 w-4" /> : <ScrollText className="h-4 w-4" />}
            {t === 'team' ? 'Team & approvals' : 'Audit trail'}
          </button>
        ))}
      </div>

      {tab === 'team' ? (
        <>
          {/* pending approvals */}
          {approvals.filter((a) => a.status === 'PENDING').length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Pending approvals</h2>
              {approvals.filter((a) => a.status === 'PENDING').map((a) => (
                <div key={a.id} className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="text-sm font-semibold">
                    {a.kind === 'BUY' ? 'Purchase request' : 'Suppression request'} · by {a.requestedBy}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.payloadJson ? JSON.parse(a.payloadJson).reason || JSON.parse(a.payloadJson).value || '' : a.leadId ? `lead ${a.leadId.slice(-8)}` : ''}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-500" onClick={() => decide(a, 'APPROVED')}>
                      <Check className="mr-1 h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-11 flex-1" onClick={() => decide(a, 'REJECTED')}>
                      <X className="mr-1 h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* members */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Members</h2>
            {members === null ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-bold">{m.name.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email ?? '—'}</p>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', ROLE_STYLE[m.role])}>{m.role}</span>
                </div>
              ))
            )}
          </section>

          {/* add member */}
          <section className="space-y-2 rounded-xl border border-border bg-card p-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <UserPlus className="h-4 w-4 text-emerald-500" /> Add member
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Name" className="h-11 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Email (optional)" className="h-11 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Role">
              {['OWNER', 'MANAGER', 'VA'].map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => setRole(r)}
                  className={cn('h-11 rounded-lg border text-[13px] font-semibold', role === r ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-border text-muted-foreground')}
                >
                  {r}
                </button>
              ))}
            </div>
            <Button className="h-11 w-full bg-emerald-600 hover:bg-emerald-500" disabled={busy || !name.trim()} onClick={addMember}>
              Add to team
            </Button>
          </section>
        </>
      ) : (
        <section className="space-y-2">
          <p className="text-xs text-muted-foreground">Append-only — every override, dispute, suppression, outcome and approval, forever.</p>
          {events.map((e) => (
            <div key={e.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold">{e.action}</span>
                <p className="text-xs text-muted-foreground">
                  {e.actor} ({e.actorRole}) · {e.targetType} · {new Date(e.createdAt).toLocaleString()}
                </p>
              </div>
              {e.detailJson && <p className="mt-1 line-clamp-2 break-all text-[11px] text-muted-foreground">{e.detailJson}</p>}
            </div>
          ))}
          {events.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No audit events yet.</p>}
        </section>
      )}
    </div>
  );
}
