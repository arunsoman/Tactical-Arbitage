'use client';

// Deterministic product-image placeholder: category-keyed gradient + brand initials.
// (The sandbox has no access to real product photography; production pulls retailer/Amazon CDNs.)

import { cn } from '@/lib/utils';

const CATEGORY_STYLES: Record<string, string> = {
  'Health & Household': 'from-emerald-500/70 to-teal-600/70',
  Beauty: 'from-rose-400/70 to-pink-600/70',
  'Grocery & Gourmet': 'from-amber-400/70 to-orange-600/70',
  'Toys & Games': 'from-fuchsia-400/70 to-purple-600/70',
  'Home & Kitchen': 'from-stone-400/70 to-amber-700/70',
  'Pet Supplies': 'from-lime-500/70 to-green-700/70',
  Electronics: 'from-slate-500/70 to-zinc-700/70',
  'Sports & Outdoors': 'from-teal-500/70 to-emerald-700/70',
  'Office Products': 'from-neutral-400/70 to-slate-600/70',
};

function initialsFor(title: string): string {
  const words = title.replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => w.length > 2).slice(0, 2);
  const src = meaningful.length > 0 ? meaningful : words.slice(0, 2);
  return src.map((w) => w[0].toUpperCase()).join('') || '??';
}

export function ProductImage({ imageKey, title, category, className }: { imageKey: string; title: string; category: string; className?: string }) {
  const gradient = CATEGORY_STYLES[category] ?? 'from-slate-400/60 to-slate-600/60';
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-md bg-gradient-to-br font-semibold text-white',
        gradient,
        className ?? 'h-12 w-12 text-xs'
      )}
      title={title}
    >
      {initialsFor(title)}
    </div>
  );
}

export function RetailerGlyph({ name, className }: { name: string; className?: string }) {
  const colors = ['bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800', 'bg-teal-100 text-teal-800', 'bg-rose-100 text-rose-800', 'bg-lime-100 text-lime-800'];
  const idx = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length;
  return (
    <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold', colors[idx], className)}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
