import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listRecentExpenses, monthTabName } from '@/lib/sheetsApi';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (!session.sheetId) {
    return NextResponse.json({ expenses: [] });
  }

  // Optional ?month=August%202026 — defaults to the current month if absent.
  const monthParam = req.nextUrl.searchParams.get('month');
  const tabName = monthParam || monthTabName();

  try {
    const rows = await listRecentExpenses(session.accessToken, session.sheetId, tabName, 200);
    // Columns (matches the bot's real sheet layout): Expense Type, Category,
    // Amount, Merchant, Rate, Qty, Month(date), Final Bill, Notes, Source,
    // Raw Input/Raw OCR Text, Timestamp
    const expenses = rows.map((r) => ({
      expenseType: r[0] || '',
      category: r[1] || '',
      amount: r[2] || '',
      merchant: r[3] || '',
      date: r[6] || '',
      source: r[9] || '',
    }));
    return NextResponse.json({ expenses, tabName });
  } catch (err) {
    console.error('Failed to list expenses:', err);
    return NextResponse.json({ expenses: [], tabName });
  }
}
