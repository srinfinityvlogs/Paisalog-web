import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { appendExpense } from '@/lib/sheetsApi';
import { classify } from '@/lib/categories';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (!session.sheetId) {
    return NextResponse.json({ error: 'No sheet yet — call /api/sheets/create first' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const rawCategory = body?.category?.trim();
  const amount = Number(body?.amount);

  if (!rawCategory || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Expected { category: string, amount: number > 0 }' }, { status: 400 });
  }

  const { category, expenseType } = classify(rawCategory);

  try {
    await appendExpense(session.accessToken, session.sheetId, {
      expenseType,
      category,
      amount,
      source: 'Web-Text',
    });
    return NextResponse.json({ ok: true, category, expenseType, amount });
  } catch (err) {
    console.error('Failed to log expense:', err);
    return NextResponse.json({ error: 'Failed to write to your Sheet' }, { status: 500 });
  }
}
