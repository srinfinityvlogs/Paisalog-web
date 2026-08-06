// Column order matches the bot's original Code.gs convention exactly:
// Expense Type | Category | Amount | Merchant | Rate | Qty | Month | Final Bill | Notes | Source | Raw Input/Raw OCR Text | Timestamp
const SHEET_HEADERS = [
  "Expense Type", "Category", "Amount", "Merchant", "Rate", "Qty",
  "Month", "Final Bill", "Notes", "Source", "Raw Input/Raw OCR Text", "Timestamp"
];

// Returns "August 2026" style tab name for a given date (defaults to today).
export function monthTabName(date: Date = new Date()): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Parses "DD/MM/YYYY" (the format the Sheet's date column actually uses).
// Do NOT use `new Date(string)` on sheet dates anywhere in this file —
// JS's native parser assumes MM/DD/YYYY and will silently misread dates
// like 04/08/2026 (4th August) as an invalid or wrong date.
function parseSheetDate(value: string): Date {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day);
}

// Formats a Date back into "DD/MM/YYYY" for writing to the sheet
function formatSheetDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function sheetsRequest(
  accessToken: string,
  spreadsheetId: string,
  path: string,
  method: string,
  body?: unknown
) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API error (${res.status}): ${err}`);
  }
  return res.json();
}

// Returns the sheetId (numeric, internal to the spreadsheet) for a tab name,
// creating the tab with headers if it doesn't exist yet.
async function ensureMonthTab(
  accessToken: string,
  spreadsheetId: string,
  tabName: string
): Promise<number> {
  const meta = await sheetsRequest(accessToken, spreadsheetId, "", "GET");
  const existing = meta.sheets?.find(
    (s: any) => s.properties.title === tabName
  );
  if (existing) return existing.properties.sheetId;

  const created = await sheetsRequest(accessToken, spreadsheetId, ":batchUpdate", "POST", {
    requests: [
      { addSheet: { properties: { title: tabName } } },
    ],
  });
  const newSheetId = created.replies[0].addSheet.properties.sheetId;

  // Write header row
  await sheetsRequest(
    accessToken,
    spreadsheetId,
    `/values/${encodeURIComponent(tabName)}!A1:L1?valueInputOption=RAW`,
    "PUT",
    { values: [SHEET_HEADERS] }
  );

  return newSheetId;
}

// Finds the correct 0-indexed row to insert at, so the date column (G)
// stays in chronological order. Row 0 is the header — never inserts above it.
async function findInsertRowIndex(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  expenseDate: Date
): Promise<number> {
  const data = await sheetsRequest(
    accessToken,
    spreadsheetId,
    `/values/${encodeURIComponent(tabName)}!G2:G`,
    "GET"
  );
  const dates: string[] = (data.values || []).map((r: string[]) => r[0]);

  // Rows are already date-ordered; walk until we find a later date.
  for (let i = 0; i < dates.length; i++) {
    if (!dates[i]) continue; // blank spacer row
    const rowDate = parseSheetDate(dates[i]);
    if (rowDate > expenseDate) {
      return i + 1; // +1 to account for header row at index 0
    }
  }
  return dates.length + 1; // append at end
}

export async function insertExpenseRowOrdered(
  accessToken: string,
  spreadsheetId: string,
  expense: {
    expenseType: string;
    category: string;
    merchant: string;
    rate: number;
    qty: number;
    amount: number;
    date: string; // must be DD/MM/YYYY
    finalBill: number;
    notes: string;
    source: "Web" | "Telegram";
    rawOcrRef?: string;
  },
  addBlankRowAfter: boolean = true
) {
  const expenseDate = parseSheetDate(expense.date);
  const tabName = monthTabName(expenseDate);
  const sheetId = await ensureMonthTab(accessToken, spreadsheetId, tabName);
  const insertRowIndex = await findInsertRowIndex(
    accessToken,
    spreadsheetId,
    tabName,
    expenseDate
  );

  // Order matches the bot's real header layout:
  // Expense Type, Category, Amount, Merchant, Rate, Qty, Month(date), Final Bill, Notes, Source, Raw Input/Raw OCR Text, Timestamp
  const rowValues = [
    expense.expenseType,
    expense.category,
    expense.amount,
    expense.merchant,
    expense.rate,
    expense.qty,
    formatSheetDate(expenseDate),
    expense.finalBill,
    expense.notes,
    expense.source,
    expense.rawOcrRef || "",
    new Date().toISOString(),
  ];

  // Insert the entry row, plus a blank spacer row after it (unless this is
  // one item of a multi-item receipt that isn't the last one — in that
  // case the blank row only gets added after the final item, matching the
  // bot's "one blank row per logged entry, not per item" convention).
  const rowsToInsert = addBlankRowAfter ? 2 : 1;
  await sheetsRequest(accessToken, spreadsheetId, ":batchUpdate", "POST", {
    requests: [
      {
        insertDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: insertRowIndex,
            endIndex: insertRowIndex + rowsToInsert,
          },
          inheritFromBefore: false,
        },
      },
    ],
  });

  await sheetsRequest(
    accessToken,
    spreadsheetId,
    `/values/${encodeURIComponent(tabName)}!A${insertRowIndex + 1}:L${insertRowIndex + 1}?valueInputOption=USER_ENTERED`,
    "PUT",
    { values: [rowValues] }
  );

  // Sync Meta tab so /last, /undo, /setcategory on Telegram stay accurate
  await updateMeta(accessToken, spreadsheetId, tabName, insertRowIndex + 1);

  return { tabName, rowNumber: insertRowIndex + 1 };
}

async function updateMeta(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  rowNumber: number
) {
  await sheetsRequest(
    accessToken,
    spreadsheetId,
    `/values/Meta!A2:A3?valueInputOption=RAW`,
    "PUT",
    { values: [[tabName], [rowNumber]] }
  );
}

// Ensures the RawOCR tab exists (columns: ReceiptId | Timestamp | Raw OCR
// Text), matching the bot's existing tab of the same name and shape.
async function ensureRawOcrTab(accessToken: string, spreadsheetId: string): Promise<void> {
  const meta = await sheetsRequest(accessToken, spreadsheetId, "", "GET");
  const existing = meta.sheets?.find((s: any) => s.properties.title === "RawOCR");
  if (existing) return;

  await sheetsRequest(accessToken, spreadsheetId, ":batchUpdate", "POST", {
    requests: [{ addSheet: { properties: { title: "RawOCR" } } }],
  });
  await sheetsRequest(
    accessToken,
    spreadsheetId,
    `/values/RawOCR!A1:C1?valueInputOption=RAW`,
    "PUT",
    { values: [["ReceiptId", "Timestamp", "Raw OCR Text"]] }
  );
}

// Stores the full OCR text for one receipt, once, referenced by a short
// receiptId from the item rows' "Raw Input/Raw OCR Text" column — avoids
// duplicating the full text on every item row of a multi-item receipt.
export async function appendRawOcrText(
  accessToken: string,
  spreadsheetId: string,
  receiptId: string,
  rawText: string
): Promise<void> {
  await ensureRawOcrTab(accessToken, spreadsheetId);
  await sheetsRequest(
    accessToken,
    spreadsheetId,
    `/values/RawOCR!A:C:append?valueInputOption=USER_ENTERED`,
    "POST",
    { values: [[receiptId, new Date().toISOString(), rawText]] }
  );
}

// Returns the most recent `limit` logged rows (non-blank) from the given
// month tab, newest first. Row layout matches SHEET_HEADERS:
// [Expense Type, Category, Amount, Merchant, Rate, Qty, Month(date),
//  Final Bill, Notes, Source, Raw Input/Raw OCR Text, Timestamp]
export async function listRecentExpenses(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  limit: number = 20
): Promise<string[][]> {
  let data;
  try {
    data = await sheetsRequest(
      accessToken,
      spreadsheetId,
      `/values/${encodeURIComponent(tabName)}!A2:L`,
      "GET"
    );
  } catch {
    // Tab doesn't exist yet (e.g. no entries logged this month) — no error, just empty.
    return [];
  }

  const rows: string[][] = data.values || [];
  // Drop blank spacer rows (no date in column G, index 6)
  const nonBlank = rows.filter((r) => r[6]);
  // Sheet is in chronological (ascending) order — take the last `limit`
  // rows and reverse so the most recent entry comes first.
  return nonBlank.slice(-limit).reverse();
}
