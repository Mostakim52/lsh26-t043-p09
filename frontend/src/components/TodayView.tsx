import { useEffect, useMemo, useState } from 'react';

import { buildCallList, summariseFleet } from '../engine/callList';
import { formatDate, relativeDays } from '../engine/dates';
import { formatMoney, formatMoneyShort } from '../engine/format';
import { DUE_SOON_DAYS, PRIORITY_WEIGHTS } from '../engine/rules';
import type { CallListEntry, Fleet } from '../engine/types';
import { backendConfigured, fetchCallList, fetchFleetSummary, type FleetSummary } from '../lib/api';
import { navigate } from '../lib/router';
import { CarStage } from '../three/CarStage';
import { Card, EmptyState, Stat, StatusBadge } from './ui';

export function TodayView({ fleet, asOf }: { fleet: Fleet; asOf: string }) {
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [query, setQuery] = useState('');

  // Backend is the source of truth — when configured, fetch ranked call list and
  // summary directly from the API. No frontend computation (no buildCallList etc).
  const [backendCallList, setBackendCallList] = useState<CallListEntry[] | null>(null);
  const [backendSummary, setBackendSummary] = useState<FleetSummary | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    if (!backendConfigured) return;
    let cancelled = false;
    setBackendError(null);
    Promise.all([fetchCallList(asOf), fetchFleetSummary(asOf)])
      .then(([cl, sm]) => {
        if (cancelled) return;
        setBackendCallList(cl);
        setBackendSummary(sm);
      })
      .catch((e: unknown) => {
        if (!cancelled) setBackendError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [asOf]);

  // Fallback to local engine only when no backend is configured, or fetch not yet complete / failed.
  const fallbackSummary = useMemo(() => summariseFleet(fleet, asOf), [fleet, asOf]);
  const fallbackCallList = useMemo(() => buildCallList(fleet, asOf), [fleet, asOf]);

  const summary: FleetSummary | ReturnType<typeof summariseFleet> =
    backendConfigured && backendSummary ? backendSummary : fallbackSummary;
  const callList: CallListEntry[] =
    backendConfigured && backendCallList ? backendCallList : fallbackCallList;

  // When backend is configured but fetch failed, fall back silently and surface the
  // error in the engine fallback notice (the FleetProvider banner already handles it).
  void backendError;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return callList.filter((entry) => {
      if (onlyOverdue && entry.vehicleStatus.overdue.length === 0) return false;
      if (!needle) return true;
      const { owner, vehicle } = entry.vehicleStatus;
      return (
        owner.name.toLowerCase().includes(needle)
        || owner.phone.includes(needle)
        || vehicle.plate.toLowerCase().includes(needle)
        || `${vehicle.make} ${vehicle.model}`.toLowerCase().includes(needle)
      );
    });
  }, [callList, onlyOverdue, query]);

  const headliner = callList[0]?.vehicleStatus.vehicle ?? fleet.vehicles[0];

  return (
    <>
      <section className="hero">
        <div className="hero__grid" aria-hidden="true" />
        <div className="hero__wordmark" aria-hidden="true">SERVICE DUE</div>

        <div className="hero__body">
          <div className="hero__copy">
            <span className="eyebrow">
              {fleet.meta.workshop} · {fleet.meta.city}
            </span>
            <h1>
              Today&rsquo;s <em>call list</em>
            </h1>
            <p className="hero__lede">
              Every vehicle in the book is checked against its own rules — fixed dates,
              time intervals and distance run — then ranked so the most overdue and the
              highest value work is at the top of the phone list.
            </p>
            <div className="hero__actions">
              <a className="btn btn--primary" href="#call-list">
                {callList.length} owners to call
              </a>
              <button type="button" className="btn" onClick={() => window.print()}>
                Print the sheet
              </button>
            </div>
          </div>

          <div className="hero__stage-slot">
            {headliner ? <CarStage vehicle={headliner} mode="hero" distance={7.6} /> : null}
          </div>
        </div>

        <dl className="hero__stats">
          <div className="hero__stat">
            <dt>Vehicles overdue</dt>
            <dd style={{ color: 'var(--overdue)' }}>
              {summary.vehiclesOverdue}
              <small> of {summary.vehicles}</small>
            </dd>
          </div>
          <div className="hero__stat">
            <dt>Due within {DUE_SOON_DAYS} days</dt>
            <dd style={{ color: 'var(--soon)' }}>{summary.vehiclesDueSoon}</dd>
          </div>
          <div className="hero__stat">
            <dt>Work on the table</dt>
            <dd>{formatMoneyShort(summary.pipelineValue)}</dd>
          </div>
          <div className="hero__stat">
            <dt>Items tracked</dt>
            <dd>{summary.itemsTracked}</dd>
          </div>
        </dl>
      </section>

      <div className="grid grid--stats">
        <Stat
          label="Overdue items"
          value={summary.overdueItems}
          hint={`${formatMoney(summary.overdueValue)} of late work`}
          tone="overdue"
        />
        <Stat label="Due soon" value={summary.dueSoonItems} hint={`Inside ${DUE_SOON_DAYS} days`} tone="soon" />
        <Stat label="Nothing owing" value={summary.fineItems} hint="Items in date" tone="fine" />
        <Stat label="Owners on the book" value={summary.owners} hint={`${summary.vehicles} vehicles`} />
        <Stat
          label="Calls to make"
          value={callList.length}
          hint="Ranked below"
          tone="accent"
        />
      </div>

      <Card
        id="call-list"
        title="Daily call list"
        description={
          <>
            Ranked by a score that blends how late the work already is, how close the next
            item sits, and what the job is worth: {PRIORITY_WEIGHTS.perOverdueDay} points per
            day overdue, {PRIORITY_WEIGHTS.perImminenceDay} per day inside the{' '}
            {DUE_SOON_DAYS}-day window, and {PRIORITY_WEIGHTS.perCurrencyUnit} per taka of due
            work. Every row shows its own breakdown.
          </>
        }
        actions={
          <>
            <label className="field">
              <span className="field__icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                placeholder="Owner, plate or phone"
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search the call list"
              />
            </label>
            <div className="segmented" role="group" aria-label="Filter">
              <button type="button" aria-pressed={!onlyOverdue} onClick={() => setOnlyOverdue(false)}>
                All ({callList.length})
              </button>
              <button type="button" aria-pressed={onlyOverdue} onClick={() => setOnlyOverdue(true)}>
                Overdue only
              </button>
            </div>
          </>
        }
        bodyless
      >
        {rows.length === 0 ? (
          <EmptyState title="Nothing to call about">
            No vehicle in this filter has work overdue or due soon.
          </EmptyState>
        ) : (
          rows.map((entry, index) => (
            <CallRow key={entry.vehicleStatus.vehicle.id} entry={entry} rank={index + 1} />
          ))
        )}
      </Card>
    </>
  );
}

function CallRow({ entry, rank }: { entry: CallListEntry; rank: number }) {
  const { vehicleStatus: vs, priority } = entry;
  const { owner, vehicle } = vs;
  const isOverdue = vs.overdue.length > 0;
  const due = [...vs.overdue, ...vs.dueSoon];
  const shown = due.slice(0, 4);

  const max = Math.max(1, priority.total);

  return (
    <article className={`call${isOverdue ? ' call--overdue' : ''}`}>
      <div className="call__rank">{rank}</div>

      <div>
        <div className="call__head">
          <span className="call__owner">{owner.name}</span>
          <a className="call__phone" href={`tel:${owner.phone}`}>{owner.phone}</a>
          <StatusBadge status={vs.worst}>
            {isOverdue ? `${vs.worstDaysOverdue} days late` : 'Due soon'}
          </StatusBadge>
        </div>

        <p className="call__vehicle">
          <strong>
            {vehicle.year} {vehicle.make} {vehicle.model}
          </strong>{' '}
          · {vehicle.plate} · {owner.area} · about {vs.projectedKm.toLocaleString('en-US')} km today
        </p>

        <ul className="call__points">
          {shown.map((s) => (
            <li className="call__point" key={s.item.id}>
              <StatusBadge status={s.status}>{relativeDays(s.daysUntil)}</StatusBadge>
              <span>
                <b>{s.item.label}</b> · {formatMoney(s.item.cost)} · due {formatDate(s.nextDueDate)}
                {s.estimated ? ' (estimated)' : ''}
                <span className="call__why">{s.why}</span>
              </span>
            </li>
          ))}
          {due.length > shown.length ? (
            <li className="call__point dim">
              <span />
              <span>+{due.length - shown.length} more item(s) on this vehicle</span>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="call__side">
        <div className="call__value">
          {formatMoney(vs.dueValue)}
          <small>{due.length} items due</small>
        </div>

        <div className="score" title={`Priority ${priority.total}`}>
          <div className="score__bar">
            <span className="score__seg score__seg--urgency" style={{ width: `${(priority.urgency / max) * 100}%` }} />
            <span className="score__seg score__seg--imminence" style={{ width: `${(priority.imminence / max) * 100}%` }} />
            <span className="score__seg score__seg--value" style={{ width: `${(priority.value / max) * 100}%` }} />
          </div>
          <div className="score__legend">
            <span>late {priority.urgency}</span>
            <span>near {priority.imminence}</span>
            <span>value {priority.value}</span>
          </div>
          <div className="score__legend">
            <span className="score__total">priority {priority.total}</span>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--sm no-print"
          onClick={() => navigate({ name: 'vehicle', id: vehicle.id })}
        >
          Open vehicle →
        </button>
      </div>
    </article>
  );
}
