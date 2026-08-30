import { useEffect, useMemo, useState } from 'react';

import { formatDate } from '../engine/dates';
import { formatMoney } from '../engine/format';
import { computeVehicleStatus } from '../engine/schedule';
import type { DueStatus, Fleet, VehicleStatus } from '../engine/types';
import { backendConfigured, fetchVehicles } from '../lib/api';
import { navigate } from '../lib/router';
import { Card, EmptyState, StatusBadge, StatusBar } from './ui';

type SortKey = 'priority' | 'plate' | 'odometer' | 'value';

export function FleetView({ fleet, asOf }: { fleet: Fleet; asOf: string }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<DueStatus | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('priority');

  // Backend is the calculator — when configured, render VehicleStatus[] straight from GET /vehicles.
  // No frontend computeVehicleStatus when backend is live.
  const [backendStatuses, setBackendStatuses] = useState<VehicleStatus[] | null>(null);

  useEffect(() => {
    if (!backendConfigured) return;
    let cancelled = false;
    fetchVehicles(asOf)
      .then((vs) => {
        if (!cancelled) setBackendStatuses(vs);
      })
      .catch(() => {
        if (!cancelled) setBackendStatuses(null);
      });
    return () => {
      cancelled = true;
    };
  }, [asOf]);

  const fallbackStatuses = useMemo(() => {
    const owners = new Map(fleet.owners.map((o) => [o.id, o]));
    return fleet.vehicles
      .map((v) => {
        const owner = owners.get(v.ownerId);
        return owner ? computeVehicleStatus(v, owner, asOf) : null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [fleet, asOf]);

  const statuses = backendConfigured && backendStatuses ? backendStatuses : fallbackStatuses;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = statuses.filter((s) => {
      if (status !== 'all' && s.worst !== status) return false;
      if (!needle) return true;
      return (
        s.vehicle.plate.toLowerCase().includes(needle)
        || `${s.vehicle.make} ${s.vehicle.model}`.toLowerCase().includes(needle)
        || s.owner.name.toLowerCase().includes(needle)
      );
    });

    const order = { overdue: 0, dueSoon: 1, fine: 2 } as const;
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'plate':
          return a.vehicle.plate.localeCompare(b.vehicle.plate);
        case 'odometer':
          return b.projectedKm - a.projectedKm;
        case 'value':
          return b.dueValue - a.dueValue;
        default:
          return (
            order[a.worst] - order[b.worst]
            || b.worstDaysOverdue - a.worstDaysOverdue
            || b.dueValue - a.dueValue
          );
      }
    });
  }, [statuses, query, status, sort]);

  return (
    <>
      <div className="page-head">
        <h1>
          The <em>fleet</em>
        </h1>
        <p>
          {fleet.vehicles.length} vehicles across {fleet.owners.length} owners. Each card shows
          the split of items that are overdue, due soon and in date.
        </p>
      </div>

      <Card
        title={`${rows.length} of ${statuses.length} vehicles`}
        actions={
          <>
            <label className="field">
              <span className="field__icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                placeholder="Plate, model or owner"
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search the fleet"
              />
            </label>
            <div className="segmented" role="group" aria-label="Status">
              {(['all', 'overdue', 'dueSoon', 'fine'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                >
                  {value === 'all' ? 'All' : value === 'dueSoon' ? 'Due soon' : value === 'overdue' ? 'Overdue' : 'In date'}
                </button>
              ))}
            </div>
            <label className="field">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort by"
              >
                <option value="priority">Sort: most urgent</option>
                <option value="value">Sort: work value</option>
                <option value="odometer">Sort: highest km</option>
                <option value="plate">Sort: plate</option>
              </select>
            </label>
          </>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="No vehicle matches those filters" />
        ) : (
          <div className="grid grid--cars">
            {rows.map((s) => (
              <button
                type="button"
                className="fleet-card"
                key={s.vehicle.id}
                onClick={() => navigate({ name: 'vehicle', id: s.vehicle.id })}
              >
                <div className="fleet-card__top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="swatch" style={{ background: s.vehicle.colour }} />
                    <span className="fleet-card__name">
                      {s.vehicle.make} {s.vehicle.model}
                    </span>
                  </div>
                  <span className="fleet-card__owner">
                    {s.vehicle.year} · {s.vehicle.plate}
                  </span>
                  <span className="fleet-card__owner">{s.owner.name}</span>
                </div>

                <div className="fleet-card__body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <StatusBadge status={s.worst}>
                      {s.worst === 'overdue'
                        ? `${s.worstDaysOverdue} days late`
                        : s.worst === 'dueSoon'
                          ? `${s.dueSoon.length} due soon`
                          : 'All in date'}
                    </StatusBadge>
                    <span className="num" style={{ fontSize: 13 }}>
                      {s.dueValue > 0 ? formatMoney(s.dueValue) : '—'}
                    </span>
                  </div>

                  <StatusBar
                    overdue={s.overdue.length}
                    dueSoon={s.dueSoon.length}
                    fine={s.fine.length}
                  />

                  <div className="fleet-card__row">
                    <span>Odometer</span>
                    <span className="num">{s.projectedKm.toLocaleString('en-US')} km</span>
                  </div>
                  <div className="fleet-card__row">
                    <span>Next due</span>
                    <span className="num">
                      {s.schedules[0] ? formatDate(s.schedules[0].nextDueDate) : '—'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
