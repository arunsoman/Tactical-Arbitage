'use client';

// Help & Support — customer face of the Care Portal (PRD §5, mobile-first).
// Raise categorized, entity-linked tickets from the phone; track, reply,
// reopen within the window, and rate the resolution.

import { useCallback, useEffect, useState } from 'react';
import { api, type Ticket360DTO } from '@/lib/ta/api';
import type { CareQueueDTO } from '@/lib/ta/api';
import { CATEGORIES, CATEGORY_LABELS, SLA_POLICY, type Category, type Priority } from '@/lib/ta/care';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ChevronRight, Clock, HelpCircle, MessageSquare, Paperclip, Plus, Star } from 'lucide-react';

const CATEGORY_HINTS: Record<Category, string> = {
  BILLING: 'Charges, refunds, plan changes',
  DATA_QUALITY: 'Wrong match, price or fees on a deal',
  CONNECTOR: 'A retailer is stale or missing',
  AI_QUALITY: 'Picks, reasons or rankings feel wrong',
  ACCOUNT: 'Login, onboarding, settings',
  SHOPPING: 'Shop search, cart or checkout',
  FEATURE: 'Ideas and requests',
  OTHER: 'Anything else',
};

export function SupportView() {
  const { toast } = useToast();
  const bootstrap = useTAStore((s) => s.bootstrap);
  const [mode, setMode] = useState<'list' | 'new' | 'detail'>('list');
  const [queue, setQueue] = useState<CareQueueDTO | null>(null);
  const [detail, setDetail] = useState<Ticket360DTO | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  // create form
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<Category>('DATA_QUALITY');
  const [description, setDescription] = useState('');
  const [leadAttach, setLeadAttach] = useState<string>('none');
  const [pipelineLeads, setPipelineLeads] = useState<{ leadId: string; label: string }[]>([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = await api.careTickets({});
      setQueue(q);
      return q;
    } catch (e) {
      toast({ title: 'Could not load your tickets', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      return null;
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // entity attachment options: the pipeline the customer is actively working
  useEffect(() => {
    if (mode !== 'new' || pipelineLeads.length) return;
    void api.pipeline().then((res) => {
      setPipelineLeads(
        res.items.slice(0, 20).map((i) => ({ leadId: i.lead.id, label: `${i.lead.asin} — ${i.lead.title.slice(0, 44)}` })),
      );
    }).catch(() => null);
  }, [mode, pipelineLeads.length]);

  const openDetail = async (id: string) => {
    try {
      setDetail(await api.ticket360(id));
      setSelectedId(id);
      setMode('detail');
    } catch (e) {
      toast({ title: 'Could not open ticket', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const submit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast({ title: 'Subject and description are required', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const res = await api.createTicket({
        subject, category, description,
        leadId: leadAttach !== 'none' ? leadAttach : undefined,
      });
      toast({ title: `Ticket ${res.ticket.ref} created`, description: res.triageNote });
      setMode('list');
      setSubject(''); setDescription(''); setLeadAttach('none');
      await load();
    } catch (e) {
      toast({ title: 'Could not raise the ticket', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!selectedId || !reply.trim()) return;
    try {
      await api.replyTicket(selectedId, { body: reply, role: 'CUSTOMER' });
      setReply('');
      await openDetail(selectedId);
      await load();
    } catch (e) {
      toast({ title: 'Could not send reply', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const rate = async (csat: number) => {
    if (!selectedId) return;
    try {
      await api.updateTicket(selectedId, { csat });
      toast({ title: `Thanks — rated ${csat}/5` });
      await openDetail(selectedId);
    } catch (e) {
      toast({ title: 'Could not save rating', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const reopen = async () => {
    if (!selectedId) return;
    try {
      await api.updateTicket(selectedId, { status: 'OPEN', actor: bootstrap ? 'Scaling Sofia' : 'Customer' });
      toast({ title: 'Ticket reopened — we are on it again' });
      await openDetail(selectedId);
      await load();
    } catch (e) {
      toast({ title: 'Could not reopen', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const visibleMessages = detail ? detail.messages.filter((m) => !m.internal) : [];

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 md:px-6 md:py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold md:text-xl">
            <HelpCircle className="h-5 w-5 text-emerald-500" /> Help &amp; Support
          </h1>
          <p className="text-xs text-muted-foreground">Raise an issue, track it, and rate the fix — right inside the product.</p>
        </div>
        {mode !== 'new' && (
          <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-500" onClick={() => setMode('new')}>
            <Plus className="h-3.5 w-3.5" /> New ticket
          </Button>
        )}
      </div>

      {mode === 'new' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">What went wrong?</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="tk-subject">Subject</Label>
              <Input id="tk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="One line that says what happened" />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      'rounded-lg border p-2.5 text-left transition-colors',
                      category === c ? 'border-emerald-500 bg-emerald-500/5' : 'hover:bg-accent',
                    )}
                  >
                    <p className="text-sm font-medium leading-tight">{CATEGORY_LABELS[c]}</p>
                    <p className="text-[11px] text-muted-foreground">{CATEGORY_HINTS[c]}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tk-desc">Describe it</Label>
              <Textarea id="tk-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What did you expect, and what happened instead? Include the ASIN or retailer if relevant." />
            </div>
            {pipelineLeads.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="tk-attach">Attach a deal (optional)</Label>
                <Select value={leadAttach} onValueChange={setLeadAttach}>
                  <SelectTrigger id="tk-attach" aria-label="Attach deal"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No deal attached</SelectItem>
                    {pipelineLeads.map((l) => <SelectItem key={l.leadId} value={l.leadId}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Attaching a deal shows our agents its full economics and price history instantly.</p>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Target first response: {SLA_POLICY[category as Category === 'BILLING' ? 'P2' : 'P2'].frtH}h (P2 default — agents may re-prioritize)</span>
              <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-500" onClick={submit} disabled={sending}>
                {sending ? 'Sending…' : 'Raise ticket'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === 'list' && (
        <div className="space-y-1.5">
          {(queue?.tickets ?? []).map((tk) => (
            <button
              key={tk.id}
              onClick={() => openDetail(tk.id)}
              className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground">{tk.ref}</span>
                  <Badge variant="outline" className={cn('px-1 text-[9px]', tk.status === 'RESOLVED' || tk.status === 'CLOSED' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'border-sky-500/30 text-sky-600 dark:text-sky-400')}>
                    {tk.status.replace('_', ' ')}
                  </Badge>
                  {tk.hasLead && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                  {tk.csat != null && <span className="flex items-center gap-0.5 text-[10px] text-amber-500"><Star className="h-3 w-3 fill-amber-500" /> {tk.csat}</span>}
                </div>
                <p className="mt-0.5 truncate text-sm font-medium">{tk.subject}</p>
                <p className="text-[11px] text-muted-foreground">updated {new Date(tk.updatedAt).toLocaleString()}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
          {queue && queue.tickets.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <MessageSquare className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No tickets yet</p>
              <p className="text-xs text-muted-foreground">When something looks wrong — a bad match, a weird fee, a charge question — raise it here.</p>
              <Button size="sm" className="mt-3 h-8 bg-emerald-600 hover:bg-emerald-500" onClick={() => setMode('new')}>Raise your first ticket</Button>
            </div>
          )}
        </div>
      )}

      {mode === 'detail' && detail && (
        <div className="space-y-3">
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setMode('list')}>← My tickets</Button>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">{detail.ticket.ref}</span>
                <Badge variant="outline" className="px-1.5 text-[10px]">{detail.ticket.status.replace('_', ' ')}</Badge>
                <Badge variant="outline" className="px-1.5 text-[10px] text-muted-foreground">{detail.ticket.priority}</Badge>
              </div>
              <CardTitle className="text-base">{detail.ticket.subject}</CardTitle>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> {detail.sla.kind === 'done' ? 'This ticket is closed out.' : `We aim to ${detail.ticket.firstResponseAt ? 'resolve' : 'reply'} within ${detail.ticket.firstResponseAt ? SLA_POLICY[detail.ticket.priority as Priority].resH : SLA_POLICY[detail.ticket.priority as Priority].frtH}h — ${detail.sla.label.toLowerCase()}`}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {visibleMessages.map((m) => (
                <div key={m.id} className={cn('max-w-[85%] rounded-lg border p-2.5 text-sm', m.authorRole === 'CUSTOMER' ? 'ml-auto bg-accent' : 'mr-auto')}>
                  <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{m.author}</span>
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  {m.body}
                </div>
              ))}
            </CardContent>
          </Card>

          {detail.ticket.status === 'RESOLVED' && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                <p className="text-sm font-medium">Did this fix your issue?</p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5" role="group" aria-label="Rate resolution">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => rate(n)} aria-label={`Rate ${n} of 5`} className="p-1">
                        <Star className={cn('h-5 w-5', (detail.ticket.csat ?? 0) >= n ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground')} />
                      </button>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={reopen}>This didn&apos;t fix it</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {detail.ticket.status !== 'RESOLVED' && detail.ticket.status !== 'CLOSED' && (
            <Card>
              <CardContent className="space-y-2 p-3">
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Add details or answer the agent…" aria-label="Reply to support" />
                <Button size="sm" className="ml-auto flex h-8 bg-emerald-600 text-xs hover:bg-emerald-500" onClick={sendReply} disabled={!reply.trim()}>Send reply</Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
