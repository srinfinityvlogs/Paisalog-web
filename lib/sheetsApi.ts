import { google, sheets_v4 } from 'googleapis';

const TRANSACTION_HEADERS = [
  'Expense Type', 'Category', 'Amount', 'Merchant',
  'Rate', 'Qty', 'Date', 'Notes', 'Source', 'Timestamp',
];

function getSheetsClient(accessToken: string): sheets_v4.Sheets {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Creates a brand-new Google Sheet in the signed-in user's own Drive,
 * pre-populated with a "Meta" tab (parity with the bot's design — reserved
 * for future bookkeeping like last-touched-row tracking) and the current
 * month's transactions tab. Returns the new spreadsheet's ID.
 */
export async function createUserSheet(accessToken: string): Promise<string> {
  const sheets = getSheetsClient(accessToken);
  const monthTab = monthTabName();

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: 'PaisaLog Expenses' },
      sheets: [{ properties: { title: 'Meta' } }, { properties: { title: monthTab } }],
    },
  });

  const spreadsheetId = created.data.spreadsheetId!;
  const monthTabSheetId = created.data.sheets?.find((s) => s.properties?.title === monthTab)?.properties?.sheetId;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${monthTab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [TRANSACTION_HEADERS] },
  });

  if (monthTabSheetId !== undefined) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { updateSheetProperties: { properties: { sheetId: monthTabSheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        ],
      },
    });
  }

  return spreadsheetId;
}

/** "July 2026" for today, or for a given DD/MM/YYYY date string — same routing concept as the bot. */
export function monthTabName(ddmmyyyy?: string): string {
  let d: Date | null = null;
  if (ddmmyyyy) {
    const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  if (!d || isNaN(d.getTime())) d = new Date();
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

async function getOrCreateMonthSheet(sheets: sheets_v4.Sheets, spreadsheetId: string, tabName: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === tabName);
  if (existing) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [TRANSACTION_HEADERS] },
  });
}

export interface ExpenseInput {
  expenseType: string;
  category: string;
  amount: number;
  merchant?: string;
  rate?: number | '';
  qty?: number | '';
  date?: string; // DD/MM/YYYY; defaults to today
  notes?: string;
  source: 'Web-Text' | 'Web-OCR';
}

/** Appends one expense row, routing to (and creating, if needed) the correct month tab — same date-routing concept as the bot. */
export async function appendExpense(accessToken: string, spreadsheetId: string, expense: ExpenseInput) {
  const sheets = getSheetsClient(accessToken);
  const dateStr = expense.date || todayDdMmYyyy();
  const tabName = monthTabName(dateStr);

  await getOrCreateMonthSheet(sheets, spreadsheetId, tabName);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A:J`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        expense.expenseType,
        expense.category,
        expense.amount,
        expense.merchant || '',
        expense.rate ?? '',
        expense.qty ?? '',
        dateStr,
        expense.notes || '',
        expense.source,
        new Date().toISOString(),
      ]],
    },
  });
}

/** Reads the most recent rows from a given month tab, for the dashboard. */
export async function listRecentExpenses(accessToken: string, spreadsheetId: string, tabName: string, limit = 20) {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabName}!A2:J` });
  const rows = res.data.values || [];
  return rows.slice(-limit).reverse();
}

function todayDdMmYyyy(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
