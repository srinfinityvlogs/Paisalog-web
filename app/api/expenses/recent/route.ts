import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listRecentExpenses, monthTabName } from '@/lib/sheetsApi';

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (!session.sheetId) {
    return NextResponse.json({ expenses: [] });
  }

  try {
    const rows = await listRecentExpenses(session.accessToken, session.sheetId, monthTabName(), 20);
    // Columns (matches the actual sheet): Expense Type, Category, Merchant,
    // Rate, Qty, Amount, Date, Final Bill, Notes, Source, Raw OCR Ref, Timestamp
    const expenses = rows.map((r) => ({
      expenseType: r[0] || '',
      category: r[1] || '',
      merchant: r[2] || '',
      amount: r[5] || '',
      date: r[6] || '',
      source: r[9] || '',
    }));
    return NextResponse.json({ expenses });
  } catch (err) {
    console.error('Failed to list expenses:', err);
    return NextResponse.json({ expenses: [] });
  }
}
