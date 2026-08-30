import { useEffect, useMemo, useState } from 'react';

import type { CompletionInput } from '../engine/complete';
import { historyForVehicle } from '../engine/complete';
import { formatDate, relativeDays } from '../engine/dates';
import { formatKm, formatMoney } from '../engine/format';
import { computeVehicleStatus } from '../engine/schedule';
import type { DueStatus, Fleet, ItemSchedule, VehicleStatus } from '../engine/types';
import { backendConfigured, fetchVehicle } from '../lib/api';
import { navigate } from '../lib/router';
import { useFleet } from '../lib/store';
import { CarStage, type Hotspot } from '../three/CarStage';
import { RecordServiceDialog } from './RecordServiceDialog';
import { Card, EmptyState, RuleChip, Stat, StatusBadge } from './ui';

const ZONE_LABEL: Record<string, string> = {
  engine: 'Engine bay',
  frontAxle: 'Front axle',
  rearAxle: 'Rear axle',
  cabin: 'Cabin',
  body: 'Body & papers',
  underbody: 'Underbody',
};

const WORST: Record<DueStatus, number> = { overdue: 2, dueSoon: 1, fine: 0 };

export function VehicleView({ fleet, vehicleId, asOf }: { fleet: Fleet; vehicleId: string; asOf: string }) {
  const { recordService, reload } = useFleet();
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [recording, setRecording] = useState<ItemSchedule | null>(null);

  // Backend is source of truth — when configured, fetch VehicleStatus + history from
  // GET /vehicles/:id?asOf=... . No computeVehicleStatus/historyForVehicle on the client.
  const [backendStatus, setBackendStatus] = useState<VehicleStatus | null>(null);
  const [backendHistory, setBackendHistory] = useState<ReturnType<typeof historyForVehicle> | null>(null);
  const [backendMissing, setBackendMissing] = useState(false);

  useEffect(() => {
    if (!backendConfigured) return;
    let cancelled = false;
    setBackendMissing(false);
    fetchVehicle(vehicleId, asOf)
      .then(({ status, history }) => {
        if (cancelled) return;
        setBackendStatus(status);
        setBackendHistory(history);
      })
      .catch(() => {
        if (!cancelled) setBackendMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, asOf]);

  // Fallback / offline: compute locally from the raw fleet that FleetProvider holds.
  const fallbackVehicle = fleet.vehicles.find((v) => v.id === vehicleId);
  const fallbackOwner = fallbackVehicle ? fleet.owners.find((o) => o.id === fallbackVehicle.ownerId) : undefined;

  const fallbackStatus = useMemo(
    () => (fallbackVehicle && fallbackOwner ? computeVehicleStatus(fallbackVehicle, fallbackOwner, asOf) : null),
    [fallbackVehicle, fallbackOwner, asOf],
  );

  const fallbackHistory = useMemo(
    () => (fallbackVehicle ? historyForVehicle(fleet, fallbackVehicle.id) : []),
    [fleet, fallbackVehicle],
  );

  const status = backendConfigured && backendStatus ? backendStatus : fallbackStatus;
  const history = backendConfigured && backendHistory ? backendHistory : fallbackHistory;
  const vehicle = status?.vehicle ?? fallbackVehicle ?? null;
  const owner = status?.owner ?? fallbackOwner ?? null;

  const technicians = useMemo(
    () => [...new Set((backendHistory ?? fleet.history).map((r) => r.technician))].sort(),
    [fleet.history, backendHistory],
  );

  // If backend was asked for a vehicle that does not exist, show the same not-found card.
  if (backendConfigured && backendMissing) {
    return (
      <Card>
        <EmptyState title="No such vehicle">
          <button type="button" className="btn" onClick={() => navigate({ name: 'fleet' })}>
            Back to the fleet
          </button>
        </EmptyState>
      </Card>
    );
  }

  const hotspots = useMemo<Hotspot[]>(() => {
    if (!status) return [];
    const byZone = new Map<string, ItemSchedule[]>();
    for (const s of status.schedules) {
      byZone.set(s.item.zone, [...(byZone.get(s.item.zone) ?? []), s]);
    }
    return [...byZone.entries()].map(([zone, items]) => {
      const worst = items.reduce<DueStatus>(
        (acc, s) => (WORST[s.status] > WORST[acc] ? s.status : acc),
        'fine',
      );
      const relevant = items.filter((s) => s.status !== 'fine');
      return {
        zone,
        label: ZONE_LABEL[zone] ?? zone,
        status: worst,
        count: relevant.length || items.length,
      };
    });
  }, [status]);

  if (!vehicle || !owner || !status) {
    return (
      <Card>
        <EmptyState title="No such vehicle">
          <button type="button" className="btn" onClick={() => navigate({ name: 'fleet' })}>
            Back to the fleet
          </button>
        </EmptyState>
      </Card>
    );
  }

  const visible = zoneFilter
    ? status.schedules.filter((s) => s.item.zone === zoneFilter)
    : status.schedules;

  const nextDue = status.schedules[0];

  async function handleRecord(input: CompletionInput) {
    await recordService(input);
    setRecording(null);
    // In backend mode the store already refetched the fleet; also refresh the
    // single-vehicle detail so its schedules/history update immediately.
    if (backendConfigured) {
      try {
        const fetched = await fetchVehicle(vehicleId, asOf);
        setBackendStatus(fetched.status);
        setBackendHistory(fetched.history);
        await reload();
      } catch {
        // fetch will be retried on next mount; not fatal for the dialog.
      }
    }
  }

  return (
    <>
      <button type="button" className="btn btn--ghost btn--sm no-print" onClick={() => navigate({ name: 'fleet' })}>
        ← All vehicles
      </button>

      <section className="vehicle-hero">
        <div className="vehicle-hero__stage">
          <CarStage
            vehicle={vehicle}
            mode="inspect"
            hotspots={hotspots}
            onSelectZone={(zone) => {
              setZoneFilter((prev) => (prev === zone ? null : zone));
              document.getElementById('items')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="stage--tall"
            distance={7.2}
          />
        </div>

        <div className="vehicle-hero__meta">
          <div>
            <span className="eyebrow">{owner.name} · {owner.area}</span>
            <h1>
              {vehicle.make} {vehicle.model}
            </h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {vehicle.year} · {vehicle.bodyType} ·{' '}
              <span
                className="swatch"
                style={{ background: vehicle.colour, display: 'inline-block', verticalAlign: 'middle' }}
              />{' '}
              <span className="dim">{vehicle.colour}</span>
            </p>
          </div>

          <div>
            <span className="plate">{vehicle.plate}</span>
          </div>

          <dl className="spec-grid">
            <div className="spec">
              <dt>Odometer today</dt>
              <dd>
                {status.projectedKm.toLocaleString('en-US')}
                <small>
                  read {formatKm(vehicle.odometer.km)} on {formatDate(vehicle.odometer.readAt)}
                </small>
              </dd>
            </div>
            <div className="spec">
              <dt>Daily running</dt>
              <dd>
                {vehicle.avgKmPerDay}
                <small>km per day</small>
              </dd>
            </div>
            <div className="spec">
              <dt>Next due</dt>
              <dd style={{ fontSize: 14 }}>
                {nextDue ? formatDate(nextDue.nextDueDate) : '—'}
                <small>{nextDue ? nextDue.item.label : 'nothing scheduled'}</small>
              </dd>
            </div>
            <div className="spec">
              <dt>Owner</dt>
              <dd style={{ fontSize: 14 }}>
                <a href={`tel:${owner.phone}`}>{owner.phone}</a>
                <small>{owner.name}</small>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="grid grid--stats">
        <Stat label="Overdue" value={status.overdue.length} hint="Items past their date" tone="overdue" />
        <Stat label="Due soon" value={status.dueSoon.length} hint="Inside the window" tone="soon" />
        <Stat label="In date" value={status.fine.length} hint="Nothing to do" tone="fine" />
        <Stat label="Work outstanding" value={formatMoney(status.dueValue)} hint="Overdue plus due soon" tone="accent" />
        <Stat label="Spent to date" value={formatMoney(history.reduce((n, r) => n + r.cost, 0))} hint={`${history.length} past services`} />
      </div>

      <Card
        id="items"
        title="Service schedule"
        description={
          zoneFilter
            ? `Showing ${ZONE_LABEL[zoneFilter] ?? zoneFilter} only — tap the marker again, or clear the filter, to see everything.`
            : 'Every item on this vehicle, the rule behind it, when it next falls due and what it costs. Tap a marker on the car to filter by area.'
        }
        actions={
          zoneFilter ? (
            <button type="button" className="btn btn--sm" onClick={() => setZoneFilter(null)}>
              Clear filter
            </button>
          ) : null
        }
        bodyless
      >
        <div className="table-wrap">
          <table className="responsive">
            <thead>
              <tr>
                <th>Item</th>
                <th>Rule</th>
                <th>Next due</th>
                <th>Status</th>
                <th className="right">Cost</th>
                <th className="right no-print">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.item.id} data-status={s.status === 'fine' ? undefined : s.status}>
                  <td data-label="Item">
                    <div className="cell-title">{s.item.label}</div>
                    <div className="cell-sub">
                      {ZONE_LABEL[s.item.zone] ?? s.item.zone} · {s.item.category}
                    </div>
                    <div className="item-row__why">{s.why}</div>
                  </td>
                  <td data-label="Rule">
                    <RuleChip kind={s.item.rule.kind} />
                  </td>
                  <td data-label="Next due">
                    <div className="num">{formatDate(s.nextDueDate)}</div>
                    <div className="cell-sub">
                      {relativeDays(s.daysUntil)}
                      {s.estimated ? ' · estimated' : ''}
                    </div>
                  </td>
                  <td data-label="Status">
                    <StatusBadge status={s.status} />
                  </td>
                  <td data-label="Cost" className="right num">
                    {formatMoney(s.item.cost)}
                  </td>
                  <td data-label="Action" className="right no-print">
                    <button type="button" className="btn btn--sm" onClick={() => setRecording(s)}>
                      Record service
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 ? <EmptyState title="No items in this area" /> : null}
        </div>
      </Card>

      <Card
        title="Service history"
        description={`${history.length} recorded jobs, newest first. Recording a service above adds to this list.`}
      >
        {history.length === 0 ? (
          <EmptyState title="Nothing recorded yet" />
        ) : (
          <div className="timeline">
            {history.map((record) => (
              <div className="timeline__row" key={record.id}>
                <div className="timeline__date">{formatDate(record.date)}</div>
                <div>
                  <div className="timeline__what">{record.label}</div>
                  <div className="timeline__meta">
                    {formatKm(record.odometer)} · {record.technician}
                    {record.notes ? ` · ${record.notes}` : ''}
                  </div>
                </div>
                <div className="timeline__cost">{formatMoney(record.cost)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {recording ? (
        <RecordServiceDialog
          schedule={recording}
          vehicle={vehicle}
          projectedKm={status.projectedKm}
          technicians={technicians}
          onCancel={() => setRecording(null)}
          onSubmit={handleRecord}
        />
      ) : null}
    </>
  );
}
