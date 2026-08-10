'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import ReceiptCamera from '@/components/ReceiptCamera';

type ExtractedItem = {
  name: string;
  quantity: number;
  rate: number;
  amount: number;
};

type Extracted = {
  merchant: string;
  date: string; // DD/MM/YYYY, already normalized by the parse route
  total: number;
  tax: number | '';
  items: ExtractedItem[];
  handlingFee?: number | '';
  notes?: string;
};

type Step = 'capture' | 'parsing' | 'confirm' | 'saving' | 'error';

// Converts "YYYY-MM-DD" (date input) to "DD/MM/YYYY" (sheet format)
function isoToSheetDate(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

// Converts "DD/MM/YYYY" to "YYYY-MM-DD" (date input format). Falls back to
// today if the OCR date is empty or unparseable.
function sheetDateToIso(sheetDate: string): string {
  const m = sheetDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ScanReceiptPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const [step, setStep] = useState<Step>('capture');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [merchant, setMerchant] = useState('');
  const [dateIso, setDateIso] = useState('');
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [handlingFee, setHandlingFee] = useState<string>('');
  const [tax, setTax] = useState<string>('');

  async function handleCapture(blob: Blob, preview: string) {
    setPreviewUrl(preview);
    setStep('parsing');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('photo', blob, 'receipt.jpg');
      const res = await fetch('/api/receipts/parse', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read receipt');

      const extracted: Extracted = data.extracted;
      setRawText(data.rawText || '');
      setMerchant(extracted.merchant || '');
      setDateIso(sheetDateToIso(extracted.date || ''));
      setItems(
        (extracted.items || []).map((it) => ({
          name: it.name,
          quantity: it.quantity,
          rate: it.rate,
          amount: it.amount,
        }))
      );
      setHandlingFee(extracted.handlingFee !== undefined && extracted.handlingFee !== '' ? String(extracted.handlingFee) : '');
      setTax(extracted.tax !== undefined && extracted.tax !== '' ? String(extracted.tax) : '');
      setStep('confirm');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not read that receipt.');
      setStep('error');
    }
  }

  function updateItem(index: number, field: keyof ExtractedItem, value: string) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        if (field === 'name') return { ...it, name: value };
        return { ...it, [field]: Number(value) || 0 };
      })
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, { name: '', quantity: 1, rate: 0, amount: 0 }]);
  }

  const itemsTotal = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  async function handleSave() {
    if (!merchant.trim()) {
      setErrorMsg('Merchant is required.');
      return;
    }
    if (!dateIso) {
      setErrorMsg('Date is required.');
      return;
    }
    if (items.length > 0 && items.some((it) => !it.name.trim())) {
      setErrorMsg('Every item needs a name, or remove the empty row.');
      return;
    }
    if (itemsTotal <= 0) {
      setErrorMsg('Total amount must be greater than ₹0 — check the items for a bad OCR read before saving.');
      return;
    }

    setStep('saving');
    setErrorMsg('');

    try {
      const res = await fetch('/api/receipts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant,
          date: isoToSheetDate(dateIso),
          items,
          total: itemsTotal,
          handlingFee: handlingFee === '' ? '' : Number(handlingFee),
          tax: tax === '' ? '' : Number(tax),
          rawText,
        }),
      });

      const rawBody = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawBody);
      } catch {
        // Server returned something that isn't JSON at all (e.g. a raw
        // error page, an HTML 500 page, or a truncated response) — surface
        // the actual response so we can see what really happened, instead
        // of a confusing generic parse error.
        console.error('Non-JSON response from /api/receipts/save:', res.status, rawBody);
        throw new Error(`Server returned ${res.status}: ${rawBody.slice(0, 200)}`);
      }

      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      router.push('/dashboard');
    } catch (err) {
      console.error('Save receipt failed:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save receipt.');
      setStep('confirm');
    }
  }

  if (!session?.sheetId) {
    return (
      <main className="shell">
        <p>Setting up your ledger…</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="masthead">
        <h1>Scan receipt</h1>
        <button
          className="btn-secondary"
          style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
          onClick={() => router.push('/dashboard')}
        >
          Cancel
        </button>
      </div>

      {step === 'capture' && (
        <div className="card">
          <ReceiptCamera onCapture={handleCapture} />
        </div>
      )}

      {step === 'parsing' && (
        <div className="card">
          {previewUrl && <img src={previewUrl} alt="Captured receipt" className="receipt-preview" />}
          <p style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>Reading your receipt…</p>
        </div>
      )}

      {step === 'error' && (
        <div className="card">
          {previewUrl && <img src={previewUrl} alt="Captured receipt" className="receipt-preview" />}
          <p className="status-line error">{errorMsg}</p>
          <button className="btn" onClick={() => setStep('capture')}>
            Try again
          </button>
        </div>
      )}

      {(step === 'confirm' || step === 'saving') && (
        <div className="card">
          {previewUrl && <img src={previewUrl} alt="Captured receipt" className="receipt-preview" />}

          <div className="field">
            <label htmlFor="merchant">Merchant</label>
            <input id="merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="receipt-date">Date</label>
            <input
              id="receipt-date"
              type="date"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
            />
          </div>

          {items.length > 0 && (
            <div className="field">
              <label>Items</label>
              {items.map((item, i) => (
                <div className="item-row-edit" key={i}>
                  <div className="item-name-row">
                    <input
                      placeholder="Item name"
                      value={item.name}
                      onChange={(e) => updateItem(i, 'name', e.target.value)}
                    />
                    <button type="button" className="btn-remove-item" onClick={() => removeItem(i)} aria-label="Remove item">
                      ×
                    </button>
                  </div>
                  <div className="item-numbers-row">
                    <div className="item-field">
                      <label>Qty</label>
                      <input
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      />
                    </div>
                    <div className="item-field">
                      <label>Rate</label>
                      <input
                        inputMode="decimal"
                        value={item.rate}
                        onChange={(e) => updateItem(i, 'rate', e.target.value)}
                      />
                    </div>
                    <div className="item-field">
                      <label>Amount</label>
                      <input
                        inputMode="decimal"
                        value={item.amount}
                        onChange={(e) => updateItem(i, 'amount', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn-add-item" onClick={addItem}>
                + Add item
              </button>
            </div>
          )}

          {items.length === 0 && (
            <div className="field">
              <label htmlFor="items-total">Total (no items detected — logging as one entry)</label>
              <input
                id="items-total"
                inputMode="decimal"
                value={itemsTotal || ''}
                onChange={(e) =>
                  setItems([{ name: 'Receipt', quantity: 1, rate: 0, amount: Number(e.target.value) || 0 }])
                }
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="handling-fee">Handling fee (optional)</label>
            <input
              id="handling-fee"
              inputMode="decimal"
              placeholder="—"
              value={handlingFee}
              onChange={(e) => setHandlingFee(e.target.value)}
            />
          </div>

          <div className="ledger-balance">
            <span className="ledger-balance-label">Items total</span>
            <span className="ledger-balance-value">₹{itemsTotal.toLocaleString('en-IN')}</span>
          </div>

          {errorMsg && <p className="status-line error">{errorMsg}</p>}

          <button className="btn" onClick={handleSave} disabled={step === 'saving'}>
            {step === 'saving' ? 'Saving…' : 'Save to ledger'}
          </button>
        </div>
      )}
    </main>
  );
}
