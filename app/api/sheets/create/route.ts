import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createUserSheet } from '@/lib/sheetsApi';

export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  if (session.sheetId) {
    return NextResponse.json({ sheetId: session.sheetId, alreadyExisted: true });
  }

  try {
    const sheetId = await createUserSheet(session.accessToken);
    return NextResponse.json({ sheetId, alreadyExisted: false });
  } catch (err) {
    console.error('Failed to create sheet:', err);
    return NextResponse.json({ error: 'Failed to create sheet' }, { status: 500 });
  }
}
