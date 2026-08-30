import { useEffect, useMemo, useState } from 'react';

import { formatMoney } from '../engine/format';
import { computeVehicleStatus } from '../engine/schedule';
import type { Fleet, VehicleStatus } from '../engine/types';
import { backendConfigured, fetchVehicles } from '../lib/api';
import { navigate } from '../lib/router';
import { Card, EmptyState, StatusBadge } from './ui';

export function OwnersView({ fleet, asOf }: { fleet: Fleet; asOf: string }) {
  const [query, setQuery] = useState('');

  // Owners + vehicle cards are derived from GET /vehicles when backend is live — no local compute.
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

  const owners = useMemo(() => {
    if (backendConfigured && backendStatuses) {
      // Group backend VehicleStatus[] by owner — grouping for display only, not computation.
      const map = new Map<string, { owner: (typeof fleet.owners)[number]; vehicles: VehicleStatus[] }>();
      for (const o of fleet.owners) map.set(o.id, { owner: o, vehicles: [] });
      for (const vs of backendStatuses) {
        const slot = map.get(vs.vehicle.ownerId);
        if (slot) slot.vehicles.push(vs);
      }
      return [...map.values()]
        .map(({ owner, vehicles }) => ({
          owner,
          vehicles,
          dueValue: vehicles.reduce((n, s) => n + s.dueValue, 0),
          overdue: vehicles.filter((s) => s.worst === 'overdue').length,
        }))
        .sort((a, b) => b.overdue - a.overdue || b.dueValue - a.dueValue);
    }

    return fleet.owners
      .map((owner) => {
        const vehicles = fleet.vehicles
          .filter((v) => v.ownerId === owner.id)
          .map((v) => computeVehicleStatus(v, owner, asOf));
        return {
          owner,
          vehicles,
          dueValue: vehicles.reduce((n, s) => n + s.dueValue, 0),
          overdue: vehicles.filter((s) => s.worst === 'overdue').length,
        };
      })
      .sort((a, b) => b.overdue - a.overdue || b.dueValue - a.dueValue);
  }, [fleet, asOf, backendStatuses]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return owners;
    return owners.filter(
      (o) =>
        o.owner.name.toLowerCase().includes(needle)
        || o.owner.phone.includes(needle)
        || o.owner.area.toLowerCase().includes(needle),
    );
  }, [owners, query]);

  return (
    <>
      <div className="page-head">
        <h1>
          Owner <em>directory</em>
        </h1>
        <p>
          {fleet.owners.length} owners, sorted so the ones with overdue vehicles come first.
        </p>
      </div>

      <Card
        title={`${rows.length} owners`}
        actions={
          <label className="field">
            <span className="field__icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              placeholder="Name, phone or area"
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search owners"
            />
          </label>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="No owner matches that search" />
        ) : (
          <div className="grid grid--cars">
            {rows.map(({ owner, vehicles, dueValue }) => (
              <div className="owner-card" key={owner.id}>
                <div className="owner-card__top">
                  <div>
                    <div className="owner-card__name">{owner.name}</div>
                    <div className="owner-card__meta">
                      {owner.area} · {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <a className="call__phone" href={`tel:${owner.phone}`}>
                    {owner.phone}
                  </a>
                </div>

                <div className="owner-card__vehicles">
                  {vehicles.map((s) => (
                    <button
                      type="button"
                      className="owner-vehicle"
                      key={s.vehicle.id}
                      onClick={() => navigate({ name: 'vehicle', id: s.vehicle.id })}
                    >
                      <span className="swatch" style={{ background: s.vehicle.colour }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>
                          {s.vehicle.make} {s.vehicle.model}
                        </span>
                        <span className="dim" style={{ fontSize: 12 }}>
                          {s.vehicle.plate}
                        </span>
                      </span>
                      <StatusBadge status={s.worst}>
                        {s.worst === 'overdue'
                          ? `${s.overdue.length} late`
                          : s.worst === 'dueSoon'
                            ? `${s.dueSoon.length} soon`
                            : 'OK'}
                      </StatusBadge>
                    </button>
                  ))}
                </div>

                {dueValue > 0 ? (
                  <div className="fleet-card__row">
                    <span>Work outstanding</span>
                    <span className="num">{formatMoney(dueValue)}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
