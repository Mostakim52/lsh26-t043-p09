import { useEffect, useState } from 'react';

import { DUE_SOON_DAYS, PRIORITY_WEIGHTS, RULE_DOCS, STATUS_DOCS } from '../engine/rules';
import type { RuleKind } from '../engine/types';
import { backendConfigured, fetchRules } from '../lib/api';
import { Card } from './ui';

const ORDER: RuleKind[] = ['fixedDate', 'interval', 'distance'];

export function RulesView() {
  const [backendRules, setBackendRules] = useState<{
    dueSoonDays: number;
    priorityWeights: typeof PRIORITY_WEIGHTS;
    ruleDocs: typeof RULE_DOCS;
    statusDocs: typeof STATUS_DOCS;
  } | null>(null);

  useEffect(() => {
    if (!backendConfigured) return;
    let cancelled = false;
    fetchRules()
      .then((r) => {
        if (!cancelled) setBackendRules(r as never);
      })
      .catch(() => {
        if (!cancelled) setBackendRules(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const docs = backendRules?.ruleDocs ?? RULE_DOCS;
  const statuses = backendRules?.statusDocs ?? STATUS_DOCS;
  const dueSoonDays = backendRules?.dueSoonDays ?? DUE_SOON_DAYS;
  const weights = backendRules?.priorityWeights ?? PRIORITY_WEIGHTS;

  return (
    <>
      <div className="page-head">
        <h1>
          How a due date is <em>worked out</em>
        </h1>
        <p>
          Each item carries one rule and is projected forward on its own terms. This page
          renders from the same constants the scheduler uses, so it cannot drift from the
          calculation.
        </p>
      </div>

      <div className="grid grid--two">
        {ORDER.map((kind) => (
          <Card key={kind} title={docs[kind].title}>
            <p className="muted" style={{ marginBottom: 12 }}>{docs[kind].text}</p>
            <div className="fleet-card__row">
              <span>Used for</span>
              <span style={{ textAlign: 'right' }}>{docs[kind].examples}</span>
            </div>
          </Card>
        ))}

        <Card title="Status thresholds">
          <div className="timeline">
            {(['overdue', 'dueSoon', 'fine'] as const).map((status) => (
              <div className="timeline__row" key={status} style={{ gridTemplateColumns: '110px 1fr' }}>
                <div>
                  <span className={`badge badge--${status}`}>
                    {status === 'dueSoon' ? 'Due soon' : status === 'overdue' ? 'Overdue' : 'Fine'}
                  </span>
                </div>
                <div className="muted">{statuses[status]}</div>
              </div>
            ))}
          </div>
          <p className="form-hint" style={{ marginTop: 12 }}>
            The due-soon window is {dueSoonDays} days. It is read from{' '}
            <code>VITE_DUE_SOON_DAYS</code> so the workshop can widen it without a rebuild
            of the logic.
            {backendConfigured && backendRules ? ' · live from the backend' : ''}
          </p>
        </Card>
      </div>

      <Card
        title="How the call list is ordered"
        description="The brief asks for the most overdue and the highest value work first, so the score blends both rather than sorting on one and hoping."
      >
        <div className="timeline">
          <div className="timeline__row" style={{ gridTemplateColumns: '150px 1fr auto' }}>
            <div className="timeline__what" style={{ color: 'var(--overdue)' }}>Urgency</div>
            <div className="muted">Days already past due on the worst item.</div>
            <div className="num">× {weights.perOverdueDay}</div>
          </div>
          <div className="timeline__row" style={{ gridTemplateColumns: '150px 1fr auto' }}>
            <div className="timeline__what" style={{ color: 'var(--soon)' }}>Imminence</div>
            <div className="muted">
              How far inside the {dueSoonDays}-day window the nearest item sits. An overdue
              vehicle scores the full window, so the total only ever rises as work slips.
            </div>
            <div className="num">× {weights.perImminenceDay}</div>
          </div>
          <div className="timeline__row" style={{ gridTemplateColumns: '150px 1fr auto' }}>
            <div className="timeline__what" style={{ color: 'var(--accent-2)' }}>Value</div>
            <div className="muted">
              Taka of work overdue or due soon, so a tyre set is not buried under a queue of
              oil changes.
            </div>
            <div className="num">× {weights.perCurrencyUnit}</div>
          </div>
        </div>
        <p className="form-hint" style={{ marginTop: 14 }}>
          Every row on the call list shows its own three-part breakdown, so the ranking can
          be checked by eye rather than taken on trust.
        </p>
      </Card>

      <Card
        title="Recording a completed service"
        description="What changes when the workshop marks a job done."
      >
        <div className="timeline">
          <div className="timeline__row" style={{ gridTemplateColumns: '150px 1fr' }}>
            <div className="timeline__what">Fixed date</div>
            <div className="muted">
              The document is reissued, so the date moves on by its renewal term from the day
              the work was recorded.
            </div>
          </div>
          <div className="timeline__row" style={{ gridTemplateColumns: '150px 1fr' }}>
            <div className="timeline__what">Time interval</div>
            <div className="muted">The clock restarts from the date recorded.</div>
          </div>
          <div className="timeline__row" style={{ gridTemplateColumns: '150px 1fr' }}>
            <div className="timeline__what">Distance</div>
            <div className="muted">
              The counter restarts from the odometer reading taken at the time of the work.
            </div>
          </div>
          <div className="timeline__row" style={{ gridTemplateColumns: '150px 1fr' }}>
            <div className="timeline__what">Always</div>
            <div className="muted">
              A record joins the vehicle&rsquo;s service history, and the odometer on file moves
              up if the workshop read a higher figure than the one on record.
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
