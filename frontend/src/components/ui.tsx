import type { ReactNode } from 'react';

import { RULE_LABELS } from '../engine/rules';
import type { DueStatus, RuleKind } from '../engine/types';

const STATUS_TEXT: Record<DueStatus, string> = {
  overdue: 'Overdue',
  dueSoon: 'Due soon',
  fine: 'Fine',
};

export function StatusBadge({ status, children }: { status: DueStatus; children?: ReactNode }) {
  return (
    <span className={`badge badge--${status}`}>
      {children ?? STATUS_TEXT[status]}
    </span>
  );
}

export function RuleChip({ kind }: { kind: RuleKind }) {
  return <span className="chip">{RULE_LABELS[kind]}</span>;
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'overdue' | 'soon' | 'fine' | 'accent';
}) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {hint ? <div className="stat__hint">{hint}</div> : null}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  bodyless,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyless?: boolean;
  id?: string;
}) {
  return (
    <section className="card" id={id}>
      {title ? (
        <header className="card__head">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="toolbar no-print">{actions}</div> : null}
        </header>
      ) : null}
      {bodyless ? children : <div className="card__body">{children}</div>}
    </section>
  );
}

export function Banner({
  tone = 'info',
  mark,
  title,
  children,
  actions,
}: {
  tone?: 'info' | 'warn' | 'danger';
  mark: string;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`banner banner--${tone}`}>
      <span className="banner__mark" aria-hidden="true">{mark}</span>
      <div>
        {title ? <strong>{title}</strong> : null}
        <span>{children}</span>
      </div>
      {actions ? <div className="banner__actions">{actions}</div> : null}
    </div>
  );
}

/** Proportional overdue / due soon / fine bar used on fleet cards. */
export function StatusBar({
  overdue,
  dueSoon,
  fine,
}: {
  overdue: number;
  dueSoon: number;
  fine: number;
}) {
  const total = Math.max(1, overdue + dueSoon + fine);
  const seg = (n: number, colour: string) =>
    n > 0 ? <span style={{ width: `${(n / total) * 100}%`, background: colour }} /> : null;

  return (
    <div className="fleet-card__bar" aria-hidden="true">
      {seg(overdue, 'var(--overdue)')}
      {seg(dueSoon, 'var(--soon)')}
      {seg(fine, 'var(--fine)')}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
