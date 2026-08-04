import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Single-user override: use the existing bot sheet instead of creating a new one
  if (session.user.email === process.env.OWNER_EMAIL) {
    if (!process.env.PAISALOG_SHEET_ID) {
      return NextResponse.json(
        { error: "PAISALOG_SHEET_ID not configured" },
        { status: 500 }
      );
    }
    return NextResponse.json({ sheetId: process.env.PAISALOG_SHEET_ID });
  }

  // ... existing spreadsheets.create logic for any other user stays below, unchanged
}