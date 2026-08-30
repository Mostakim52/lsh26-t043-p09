import { useEffect, useMemo, useRef, useState } from 'react';

import type { CompletionInput } from '../engine/complete';
import { formatDate, today as todayIso } from '../engine/dates';
import { formatKm, formatMoney } from '../engine/format';
import type { ItemSchedule, Vehicle } from '../engine/types';

export function RecordServiceDialog({
  schedule,
  vehicle,
  projectedKm,
  technicians,
  onCancel,
  onSubmit,
}: {
  schedule: ItemSchedule;
  vehicle: Vehicle;
  projectedKm: number;
  technicians: string[];
  onCancel: () => void;
  onSubmit: (input: CompletionInput) => Promise<void> | void;
}) {
  const { item } = schedule;
  const today = todayIso();

  const [date, setDate] = useState(today);
  const [odometer, setOdometer] = useState(String(projectedKm));
  const [cost, setCost] = useState(String(item.cost));
  const [technician, setTechnician] = useState(technicians[0] ?? 'Workshop');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onCancel]);

  const odometerNumber = Number(odometer);
  const costNumber = Number(cost);

  const error = useMemo(() => {
    if (!date) return 'Pick the date the work was done.';
    if (date > today) return 'A service cannot be recorded in the future.';
    if (!Number.isFinite(odometerNumber) || odometerNumber < 0) return 'Enter the odometer reading.';
    if (!Number.isFinite(costNumber) || costNumber < 0) return 'Enter what was charged.';
    if (!technician.trim()) return 'Name the technician who did the work.';
    return null;
  }, [date, today, odometerNumber, costNumber, technician]);

  const warning = useMemo(() => {
    if (error) return null;
    if (odometerNumber < vehicle.odometer.km) {
      return `That is below the last reading on file (${formatKm(vehicle.odometer.km)} on ${formatDate(vehicle.odometer.readAt)}). The odometer on file will not be moved back.`;
    }
    return null;
  }, [error, odometerNumber, vehicle.odometer]);

  const resetPreview = useMemo(() => {
    switch (item.rule.kind) {
      case 'fixedDate':
        return `The document is reissued, so the next date moves ${item.rule.renewalMonths} months on from the day you record.`;
      case 'interval':
        return `The ${item.rule.months}-month clock restarts from the date you record.`;
      case 'distance':
        return `The counter restarts from this odometer reading, so the next one falls due at ${formatKm(odometerNumber + item.rule.intervalKm)}.`;
    }
  }, [item.rule, odometerNumber]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (error || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        vehicleId: vehicle.id,
        itemId: item.id,
        date,
        odometer: Math.round(odometerNumber),
        cost: Math.round(costNumber),
        technician: technician.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (!dialogRef.current?.contains(e.target as Node)) onCancel();
      }}
    >
      <div
        className="dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-title"
      >
        <form onSubmit={handleSubmit}>
          <header className="dialog__head">
            <div>
              <h2 id="record-title">Record {item.label}</h2>
              <p>
                {vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.plate}
              </p>
            </div>
            <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close">
              ✕
            </button>
          </header>

          <div className="dialog__body">
            <div className="form-grid">
              <div className="form-row">
                <label htmlFor="svc-date">Date of work</label>
                <span className="field">
                  <input
                    id="svc-date"
                    ref={firstFieldRef}
                    type="date"
                    value={date}
                    max={today}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </span>
              </div>

              <div className="form-row">
                <label htmlFor="svc-odo">Odometer (km)</label>
                <span className="field">
                  <input
                    id="svc-odo"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                  />
                </span>
              </div>

              <div className="form-row">
                <label htmlFor="svc-cost">Charged (৳)</label>
                <span className="field">
                  <input
                    id="svc-cost"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                </span>
              </div>

              <div className="form-row">
                <label htmlFor="svc-tech">Technician</label>
                <span className="field">
                  <input
                    id="svc-tech"
                    list="technician-list"
                    value={technician}
                    onChange={(e) => setTechnician(e.target.value)}
                  />
                </span>
                <datalist id="technician-list">
                  {technicians.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="svc-notes">Notes (optional)</label>
              <span className="field">
                <textarea
                  id="svc-notes"
                  rows={2}
                  value={notes}
                  placeholder="Parts used, what the customer reported, anything to check next time"
                  onChange={(e) => setNotes(e.target.value)}
                />
              </span>
            </div>

            <div className="banner banner--info">
              <span className="banner__mark" aria-hidden="true">↻</span>
              <div>
                <strong>What this changes</strong>
                <span>
                  {resetPreview} The job goes into the service history at{' '}
                  {formatMoney(Number.isFinite(costNumber) ? costNumber : 0)}, and this item
                  drops off the call list.
                </span>
              </div>
            </div>

            {warning ? <p className="form-hint">{warning}</p> : null}
            {error ? <p className="form-error">{error}</p> : null}
          </div>

          <footer className="dialog__foot">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={Boolean(error) || saving}>
              {saving ? 'Saving…' : 'Record service'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
