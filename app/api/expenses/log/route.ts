import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { insertExpenseRowOrdered } from "@/lib/sheetsApi";

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
    expenseType: string;
    category: string;
    merchant: string;
    rate: number;
    qty: number;
    amount: number;
    date: string; // expected format: DD/MM/YYYY, matches sheet column G
    finalBill: number;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Basic validation — adjust required fields to match your actual form
  if (!body.amount || !body.date || !body.expenseType) {
    return NextResponse.json(
      { error: "Missing required fields: expenseType, amount, date" },
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

  try {
    const result = await insertExpenseRowOrdered(
      session.accessToken,
      session.sheetId,
      {
        expenseType: body.expenseType,
        category: body.category ?? "",
        merchant: body.merchant ?? "",
        rate: body.rate ?? 0,
        qty: body.qty ?? 1,
        amount: body.amount,
        date: body.date,
        finalBill: body.finalBill ?? body.amount,
        notes: body.notes ?? "",
        source: "Web",
      }
    );

    return NextResponse.json({
      success: true,
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
