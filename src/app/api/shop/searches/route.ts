// GET /api/shop/searches — recent analyses (FR-5 history cards).
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const email = params.get('email');
  const limit = Math.min(parseInt(params.get('limit') ?? '20', 10) || 20, 50);
  const rows = await db.consumerSearch.findMany({
    where: email ? { customerEmail: email } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { _count: { select: { quotes: true } } },
  });
  return NextResponse.json({
    searches: rows.map((s) => ({
      id: s.id, query: s.query, productName: s.productName, brand: s.brand, category: s.category,
      imageUrl: s.imageUrl, verdict: s.verdict, confidence: s.confidence, bestVendor: s.bestVendor,
      bestTotal: s.bestTotal, quoteCount: s._count.quotes, customerEmail: s.customerEmail,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}
