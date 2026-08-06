import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
// @ts-ignore — ocr.js is a plain CommonJS module, ported unchanged from the bot
import * as ocr from "@/lib/ocr";

export const runtime = "nodejs"; // needs Buffer/FormData/fetch — not the edge runtime

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("photo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  // Optional — lets the confirm screen (or a future "I know this is
  // BigBasket" toggle) pin a specific format instead of relying on
  // auto-detection, same as the bot's caption-override merchant hint.
  const merchantHint = (formData.get("merchantHint") as string) || undefined;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { rawText, extracted } = await ocr.analyzeReceipt(buffer, merchantHint);
    // Per-format extractors return the raw regex-matched date (e.g. "2/8/26"),
    // not a clean DD/MM/YYYY string. Normalize it here, the same way the bot
    // does right before use, so the confirm screen always gets a usable date.
    extracted.date = ocr.formatReceiptDate(extracted.date);
    return NextResponse.json({ rawText, extracted });
  } catch (err) {
    console.error("OCR pipeline failed:", err);
    return NextResponse.json(
      { error: "Couldn't read that receipt. Try a clearer photo, or log it manually." },
      { status: 500 }
    );
  }
}
