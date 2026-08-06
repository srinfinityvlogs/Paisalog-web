'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

type Expense = {
  expenseType: string;
  category: string;
  amount: string;
  merchant: string;
  date: string; // DD/MM/YYYY
  source: string;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Returns today's date as "YYYY-MM-DD", the format <input type="date"> requires.
function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Converts "YYYY-MM-DD" (what the date input gives us) into "DD/MM/YYYY"
// (what the Sheet's column and the rest of the backend expect).
function isoToSheetDate(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

// Parses "DD/MM/YYYY" into a Date. Sheet dates are never ISO, so this
// must not be replaced with `new Date(string)`.
function parseSheetDate(value: string): Date | null {
  const parts = value.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy) return null;
  return new Date(yyyy, mm - 1, dd);
}

function tabNameForMonth(year: number, monthIndex0: number): string {
  return `${MONTH_NAMES[monthIndex0]} ${year}`;
}

function formatAmount(raw: string): string {
  const n = Number(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('en-IN');
}

function sumAmounts(items: Expense[]): number {
  return items.reduce((total, e) => total + (Number(String(e.amount).replace(/,/g, '')) || 0), 0);
}

// Groups already-newest-first expenses into day buckets, preserving order.
function groupByDay(items: Expense[]): { date: string; label: string; items: Expense[] }[] {
  const todayStr = isoToSheetDate(todayIso());
  const groups: { date: string; label: string; items: Expense[] }[] = [];

  for (const exp of items) {
    let group = groups.find((g) => g.date === exp.date);
    if (!group) {
      let label = exp.date;
      if (exp.date === todayStr) {
        label = 'Today';
      } else {
        const parsed = parseSheetDate(exp.date);
        if (parsed) {
          label = parsed.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
        }
      }
      group = { date: exp.date, label, items: [] };
      groups.push(group);
    }
    group.items.push(exp);
  }

  return groups;
}

function SkeletonList() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton-bar" style={{ width: '45%' }} />
          <div className="skeleton-bar" style={{ width: '20%' }} />
        </div>
      ))}
    </>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [settingUp, setSettingUp] = useState(false);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);

  // The month currently being viewed. Defaults to the current month;
  // "next" is disabled once this reaches the current month so you can't
  // navigate into the future.
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonthIndex, setViewMonthIndex] = useState(now.getMonth());

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonthIndex === now.getMonth();
  const viewTabName = tabNameForMonth(viewYear, viewMonthIndex);

  // First-ever visit: this session has no Sheet yet — create one and persist
  // its ID into the session token via update().
  useEffect(() => {
    if (status !== 'authenticated' || session?.sheetId || settingUp) return;
    setSettingUp(true);
    fetch('/api/sheets/create', { method: 'POST' })
      .then((r) => r.json())
      .then(async (data) => {
        if (data.sheetId) await update({ sheetId: data.sheetId });
      })
      .finally(() => setSettingUp(false));
  }, [status, session?.sheetId, settingUp, update]);

  async function loadExpenses(tabName: string) {
    setExpenses(null);
    const res = await fetch(`/api/expenses/recent?month=${encodeURIComponent(tabName)}`);
    const data = await res.json();
    setExpenses(data.expenses || []);
  }

  useEffect(() => {
    if (session?.sheetId) loadExpenses(viewTabName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sheetId, viewTabName]);

  function goToPreviousMonth() {
    if (viewMonthIndex === 0) {
      setViewYear((y) => y - 1);
      setViewMonthIndex(11);
    } else {
      setViewMonthIndex((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (isCurrentMonth) return;
    if (viewMonthIndex === 11) {
      setViewYear((y) => y + 1);
      setViewMonthIndex(0);
    } else {
      setViewMonthIndex((m) => m + 1);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!category.trim() || !Number.isFinite(amt) || amt <= 0) {
      setStatusMsg({ text: 'Enter a category and an amount greater than 0.', error: true });
      return;
    }
    if (!date) {
      setStatusMsg({ text: 'Pick a date.', error: true });
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/expenses/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          amount: amt,
          date: isoToSheetDate(date),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setStatusMsg({ text: `Logged ${data.category} — ₹${formatAmount(String(data.amount))}` });
      setCategory('');
      setAmount('');
      setDate(todayIso());
      // If the entry was logged into the month currently being viewed,
      // refresh it. Otherwise leave the current view alone.
      if (data.tabName === viewTabName) loadExpenses(viewTabName);
    } catch (err) {
      setStatusMsg({ text: err instanceof Error ? err.message : 'Failed to save', error: true });
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading') {
    return (
      <main className="shell">
        <p>Loading…</p>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <main className="shell">
        <p>You&rsquo;ve been signed out. <a href="/">Sign in again</a>.</p>
      </main>
    );
  }

  const monthTotal = expenses ? sumAmounts(expenses) : null;
  const dayGroups = expenses ? groupByDay(expenses) : [];

  return (
    <main className="shell">
      <div className="masthead">
        <h1>PaisaLog</h1>
        <button className="btn-secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }} onClick={() => signOut({ callbackUrl: '/' })}>
          Sign out
        </button>
      </div>

      {settingUp && (
        <div className="card">
          <p style={{ margin: 0 }}>Setting up your ledger for the first time…</p>
        </div>
      )}

      {session?.sheetId && (
        <>
          <div className="card">
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="category">Category and amount</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    id="category"
                    placeholder="Grocery"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                  <input
                    inputMode="decimal"
                    placeholder="250"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={{ maxWidth: 110 }}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="date">Date</label>
                <input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  max={todayIso()}
                />
              </div>
              <button className="btn" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Log expense'}
              </button>
              {statusMsg && <p className={`status-line ${statusMsg.error ? 'error' : ''}`}>{statusMsg.text}</p>}
            </form>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: 10 }}
              onClick={() => router.push('/dashboard/scan')}
            >
              📷 Scan a receipt
            </button>
          </div>

          <div className="card">
            <div className="month-nav">
              <button
                type="button"
                className="month-nav-arrow"
                onClick={goToPreviousMonth}
                aria-label="Previous month"
              >
                ‹
              </button>
              <span className="month-nav-label">{viewTabName}</span>
              <button
                type="button"
                className="month-nav-arrow"
                onClick={goToNextMonth}
                disabled={isCurrentMonth}
                aria-label="Next month"
              >
                ›
              </button>
            </div>

            <div className="sheet-link-line">
              <span>{isCurrentMonth ? 'This month' : viewTabName}</span>
              <a href={`https://docs.google.com/spreadsheets/d/${session.sheetId}/edit`} target="_blank" rel="noreferrer">
                Open full Sheet
              </a>
            </div>

            <div className="ledger-balance">
              <span className="ledger-balance-label">Total spent</span>
              <span className="ledger-balance-value">
                {monthTotal === null ? '—' : `₹${monthTotal.toLocaleString('en-IN')}`}
              </span>
            </div>

            {expenses === null && <SkeletonList />}

            {expenses?.length === 0 && (
              <div className="empty-state">
                The ledger is empty for {viewTabName}.
              </div>
            )}

            {dayGroups.map((group) => (
              <div className="day-group" key={group.date}>
                <div className="day-heading">
                  <span className="day-heading-label">{group.label}</span>
                  <span className="day-heading-subtotal">₹{sumAmounts(group.items).toLocaleString('en-IN')}</span>
                </div>
                {group.items.map((exp, i) => (
                  <div className="entry-row" key={i}>
                    <div>
                      <div className="entry-category">{exp.category}</div>
                      <div className="entry-meta">{exp.expenseType}{exp.merchant ? ` · ${exp.merchant}` : ''}</div>
                    </div>
                    <div className="entry-right">
                      <div className="entry-amount">₹{formatAmount(exp.amount)}</div>
                      {exp.source && <div className="entry-source">{exp.source}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
