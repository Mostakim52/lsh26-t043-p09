import { useEffect, useState } from 'react';

import { formatDate, relativeDays } from '../engine/dates';
import { formatMoney } from '../engine/format';
import type { PublicVehicleStatus } from '../lib/api';
import { fetchVehicleByPlate } from '../lib/api';
import { navigate } from '../lib/router';
import { Card, EmptyState, RuleChip, Stat, StatusBadge } from './ui';

/**
 * The vehicle-owner self-lookup view. No login, no Bearer token, no
 * fleet-wide data — just the one vehicle behind the plate the visitor typed
 * on the login screen, fetched from the anonymous /public/vehicles/by-plate
 * endpoint. Read-only: owners can look up their own due dates, not record
 * work — that stays an employee action.
 */
export function MyVehicleView({ plate }: { plate: string }) {
  const [status, setStatus] = useState<PublicVehicleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchVehicleByPlate(plate)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plate]);

  return (
    <div className="page my-vehicle">
      <header className="my-vehicle__topbar">
        <button type="button" className="logo" onClick={() => navigate({ name: 'login' })}>
          <span className="logo__mark" aria-hidden="true">SD</span>
          <span className="logo__word">
            Service<span>Desk</span>
          </span>
        </button>
        <button type="button" className="btn btn--sm" onClick={() => navigate({ name: 'login' })}>
          Look up another plate
        </button>
      </header>

      {loading ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : error || !status ? (
        <Card>
          <EmptyState title="No vehicle found">
            {error ?? `We couldn't find a vehicle registered under "${plate}".`}
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => navigate({ name: 'login' })}>
                Try another plate
              </button>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <>
          <section className="my-vehicle__hero">
            <span className="eyebrow">Hi {status.owner.name.split(' ')[0]} · here's your vehicle</span>
            <h1>
              {status.vehicle.make} {status.vehicle.model}
            </h1>
            <p className="plate">{status.vehicle.plate}</p>
          </section>

          <div className="grid grid--stats">
            <Stat label="Overdue" value={status.overdue.length} hint="Items past their date" tone="overdue" />
            <Stat label="Due soon" value={status.dueSoon.length} hint="Inside the window" tone="soon" />
            <Stat label="In date" value={status.fine.length} hint="Nothing to do" tone="fine" />
            <Stat label="Work outstanding" value={formatMoney(status.dueValue)} hint="Overdue plus due soon" tone="accent" />
          </div>

          <Card title="Your service schedule" description="Everything tracked on your vehicle and when it's next due.">
            <div className="table-wrap">
              <table className="responsive">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Rule</th>
                    <th>Next due</th>
                    <th>Status</th>
                    <th className="right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {status.schedules.map((s) => (
                    <tr key={s.item.id} data-status={s.status === 'fine' ? undefined : s.status}>
                      <td data-label="Item">
                        <div className="cell-title">{s.item.label}</div>
                        <div className="item-row__why">{s.why}</div>
                      </td>
                      <td data-label="Rule">
                        <RuleChip kind={s.item.rule.kind} />
                      </td>
                      <td data-label="Next due">
                        <div className="num">{formatDate(s.nextDueDate)}</div>
                        <div className="cell-sub">{relativeDays(s.daysUntil)}</div>
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={s.status} />
                      </td>
                      <td data-label="Cost" className="right num">
                        {formatMoney(s.item.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="my-vehicle__foot">
            Need work done? Contact the workshop directly — this page is read-only for vehicle owners.
          </p>
        </>
      )}
    </div>
  );
}
