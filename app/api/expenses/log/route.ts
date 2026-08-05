import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { insertExpenseRowOrdered } from "@/lib/sheetsApi";
import { classify } from "@/lib/categories";

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!session.sheetId) {
    return NextResponse.json(
      { error: "No sheet linked to this account" },
      { status: 400 }
    );
  }

  let body: {
    category: string;
    amount: number;
    date: string; // expected format: DD/MM/YYYY, matches sheet column G
    merchant?: string;
    rate?: number;
    qty?: number;
    finalBill?: number;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only category, amount, and date come from the form now.
  // expenseType is derived server-side via classify(), not sent by the client.
  if (!body.category || !body.amount || !body.date) {
    return NextResponse.json(
      { error: "Missing required fields: category, amount, date" },
      { status: 400 }
    );
  }

  // Validate date format strictly (DD/MM/YYYY)
  const dateFormatOk = /^\d{2}\/\d{2}\/\d{4}$/.test(body.date);
  if (!dateFormatOk) {
    return NextResponse.json(
      { error: "date must be in DD/MM/YYYY format" },
      { status: 400 }
    );
  }

  const amt = Number(body.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 }
    );
  }

  // Derive category + expenseType from the raw text the user typed,
  // same classification logic the bot uses.
  const { category: resolvedCategory, expenseType } = classify(body.category);

  try {
    const result = await insertExpenseRowOrdered(
      session.accessToken,
      session.sheetId,
      {
        expenseType,
        category: resolvedCategory,
        merchant: body.merchant ?? "",
        rate: body.rate ?? 0,
        qty: body.qty ?? 1,
        amount: amt,
        date: body.date,
        finalBill: body.finalBill ?? amt,
        notes: body.notes ?? "",
        source: "Web",
      }
    );

    return NextResponse.json({
      success: true,
      category: resolvedCategory,
      expenseType,
      amount: amt,
      tabName: result.tabName,
      rowNumber: result.rowNumber,
    });
  } catch (err) {
    console.error("Failed to log expense:", err);
    return NextResponse.json(
      { error: "Failed to write to sheet" },
      { status: 500 }
    );
  }
}
