'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

type Expense = {
  expenseType: string;
  category: string;
  amount: string;
  merchant: string;
  date: string;
  source: string;
};

// Returns today's date as "YYYY-MM-DD", the format <input type="date"> requires.
function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Converts "YYYY-MM-DD" (what the date input gives us) into "DD/MM/YYYY"
// (what the Sheet's column G and the rest of the backend expect).
function isoToSheetDate(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

export default function DashboardPage() {
  const { data: session, status, update } = useSession();
  const [settingUp, setSettingUp] = useState(false);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);

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

  async function loadExpenses() {
    const res = await fetch('/api/expenses/recent');
    const data = await res.json();
    setExpenses(data.expenses || []);
  }

  useEffect(() => {
    if (session?.sheetId) loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sheetId]);

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
      setStatusMsg({ text: `Logged ${data.category} — ${data.amount}` });
      setCategory('');
      setAmount('');
      setDate(todayIso());
      loadExpenses();
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
          </div>

          <div className="card">
            <p style={{ marginTop: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
              This month &middot;{' '}
              <a href={`https://docs.google.com/spreadsheets/d/${session.sheetId}/edit`} target="_blank" rel="noreferrer">
                Open full Sheet
              </a>
            </p>
            {expenses === null && <p>Loading entries…</p>}
            {expenses?.length === 0 && <div className="empty-state">Nothing logged yet this month.</div>}
            {expenses?.map((exp, i) => (
              <div className="entry-row" key={i}>
                <div>
                  <div className="entry-category">{exp.category}</div>
                  <div className="entry-meta">{exp.expenseType}{exp.merchant ? ` · ${exp.merchant}` : ''}</div>
                </div>
                <div className="entry-amount">{exp.amount}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
