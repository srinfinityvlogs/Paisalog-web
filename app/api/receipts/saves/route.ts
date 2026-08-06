import crypto from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { insertExpenseRowOrdered, appendRawOcrText } from "@/lib/sheetsApi";
import { classify } from "@/lib/categories";

type ReceiptItem = {
  name: string;
  quantity: number;
  rate: number;
  amount: number;
};

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.sheetId) {
    return NextResponse.json({ error: "No sheet linked to this account" }, { status: 400 });
  }

  let body: {
    merchant: string;
    date: string; // DD/MM/YYYY
    items: ReceiptItem[];
    total?: number;
    handlingFee?: number | "";
    tax?: number | "";
    rawText?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.merchant || !body.date) {
    return NextResponse.json({ error: "Missing merchant or date" }, { status: 400 });
  }
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(body.date)) {
    return NextResponse.json({ error: "date must be in DD/MM/YYYY format" }, { status: 400 });
  }

  // Same short-reference-id scheme the bot uses for its Pending/RawOCR flow.
  const receiptId = crypto.randomBytes(6).toString("hex");

  const hasHandlingFee = body.handlingFee !== undefined && body.handlingFee !== "";
  const finalBillTotal = hasHandlingFee
    ? Math.round((Number(body.total || 0) + Number(body.handlingFee)) * 100) / 100
    : body.total || 0;

  try {
    if (body.rawText) {
      await appendRawOcrText(session.accessToken, session.sheetId, receiptId, body.rawText);
    }

    let lastResult: { tabName: string; rowNumber: number } | null = null;

    if (body.items && body.items.length > 0) {
      for (let index = 0; index < body.items.length; index++) {
        const item = body.items[index];
        const { category, expenseType } = classify(item.name);
        const isLast = index === body.items.length - 1;

        lastResult = await insertExpenseRowOrdered(
          session.accessToken,
          session.sheetId,
          {
            expenseType,
            category,
            merchant: body.merchant,
            rate: item.rate,
            qty: item.quantity,
            amount: item.amount,
            date: body.date,
            finalBill: index === 0 ? finalBillTotal : 0, // only the first row carries the overall total, matching the bot
            notes: index === 0 && hasHandlingFee ? `Handling Fee: ${body.handlingFee}` : "",
            source: "Web",
            rawOcrRef: receiptId,
          },
          isLast // only the last item gets the trailing blank spacer row
        );
      }
    } else {
      // No items extracted — log a single summary row, matching the bot's
      // fallback behavior for receipts OCR couldn't break into line items.
      lastResult = await insertExpenseRowOrdered(
        session.accessToken,
        session.sheetId,
        {
          expenseType: "Uncategorized (OCR)",
          category: "Receipt",
          merchant: body.merchant,
          rate: 0,
          qty: 1,
          amount: body.total || 0,
          date: body.date,
          finalBill: finalBillTotal,
          notes: hasHandlingFee
            ? `Handling Fee: ${body.handlingFee}`
            : `Tax: ${body.tax || ""}`,
          source: "Web",
          rawOcrRef: receiptId,
        },
        true
      );
    }

    return NextResponse.json({
      success: true,
      itemCount: body.items?.length || 1,
      tabName: lastResult?.tabName,
    });
  } catch (err) {
    console.error("Failed to save receipt:", err);
    return NextResponse.json({ error: "Failed to write receipt to sheet" }, { status: 500 });
  }
}
