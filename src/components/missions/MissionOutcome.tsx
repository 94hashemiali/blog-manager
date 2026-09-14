import type {
  MissionOutcomeReport,
  MetricValue,
  OutcomeClassification
} from '../../api/missions';

interface Props {
  report: MissionOutcomeReport | null;
}

const CLASS_STYLE: Record<OutcomeClassification, string> = {
  SUCCESS: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  PARTIAL_SUCCESS: 'border-amber-300 bg-amber-50 text-amber-950',
  NO_MEASURABLE_CHANGE: 'border-stone-300 bg-stone-50 text-stone-800',
  REGRESSION: 'border-rose-300 bg-rose-50 text-rose-950',
  INCONCLUSIVE: 'border-orange-300 bg-orange-50 text-orange-950',
  FAILED_EXECUTION: 'border-rose-400 bg-rose-100 text-rose-950',
  INSUFFICIENT_DATA: 'border-sky-300 bg-sky-50 text-sky-950'
};

function fmtMetric(m?: MetricValue | null) {
  if (!m) return 'Evidence unavailable';
  if (m.state === 'AVAILABLE') return String(m.value);
  if (m.state === 'DEMO_DATA') return 'Demo data (not live)';
  if (m.state === 'UNAVAILABLE') return m.detail || 'Not available';
  return m.detail || 'Unknown';
}

export default function MissionOutcome({ report }: Props) {
  if (!report) {
    return (
      <section className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-4 text-sm text-stone-400">
        هنوز outcome گزارش نشده — بعد از Start/Complete ظاهر می‌شود.
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Mission Outcome
          </p>
          <p className="text-sm text-stone-600">هدف: {report.goal}</p>
        </div>
        <span
          className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase ${CLASS_STYLE[report.classification]}`}
        >
          {report.classification}
        </span>
      </div>

      <p className="text-[11px] text-stone-500">
        Mission status: <strong>{report.missionStatus}</strong> · execution confidence:{' '}
        {report.executionConfidence} · matched expectations: {report.matchedExpectations}
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-[11px]">
          <p className="font-black text-stone-500">Execution</p>
          <p className="mt-1 text-stone-800">
            {report.execution.completedTasks} completed · {report.execution.failedTasks} failed ·{' '}
            {report.execution.skippedTasks} skipped
          </p>
          <p className="text-stone-600">
            {report.execution.reviewTasks} review · {report.execution.jobsExecuted} jobs ·{' '}
            {report.execution.decisionsEvaluated} decisions
          </p>
        </div>
        <div className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-[11px]">
          <p className="font-black text-stone-500">Window</p>
          <p className="mt-1 text-stone-800">
            Baseline: {report.window.baselineCapturedAt || '—'}
          </p>
          <p className="text-stone-800">Outcome: {report.window.outcomeCapturedAt || '—'}</p>
        </div>
        <div className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-[11px]">
          <p className="font-black text-stone-500">Next state</p>
          <p className="mt-1 font-black text-stone-900">{report.nextState}</p>
          {report.replanAvailable && (
            <p className="text-amber-800">REPLAN_AVAILABLE / new decisions exist</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-black uppercase text-stone-500">Changes</p>
        {report.changes.length ? (
          <ul className="mt-1 space-y-1 text-[11px] text-stone-800">
            {report.changes.map((c) => (
              <li key={c.key + c.label}>
                <span className="font-bold">{c.attribution}</span> — {c.label}
                <span className="text-stone-500"> · {c.evidence}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-stone-400">No attributable or observed changes yet.</p>
        )}
      </div>

      {report.unchanged.length > 0 && (
        <p className="text-[11px] text-stone-500">Unchanged: {report.unchanged.join(' · ')}</p>
      )}

      <div>
        <p className="text-[11px] font-black uppercase text-stone-500">Performance honesty</p>
        <dl className="mt-1 grid gap-1 text-[11px] sm:grid-cols-2">
          {[
            ['Clicks', report.outcome?.metrics.performance.clicks],
            ['Impressions', report.outcome?.metrics.performance.impressions],
            ['CTR', report.outcome?.metrics.performance.ctr],
            ['Avg position', report.outcome?.metrics.performance.averagePosition],
            ['Search Console', report.outcome?.metrics.providers.searchConsole],
            ['Analytics', report.outcome?.metrics.providers.analytics]
          ].map(([label, m]) => (
            <div key={String(label)} className="flex justify-between gap-2 border-b border-stone-50 py-0.5">
              <dt className="text-stone-500">{label as string}</dt>
              <dd className="text-left text-stone-800">{fmtMetric(m as MetricValue)}</dd>
            </div>
          ))}
        </dl>
      </div>

      {report.unknowns.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-950">
          <p className="font-black">What we still do not know</p>
          <ul className="mt-1 list-disc pr-4">
            {report.unknowns.slice(0, 8).map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}

      {report.nextRecommendations.length > 0 && (
        <div>
          <p className="text-[11px] font-black uppercase text-stone-500">Next actions (Decision Engine)</p>
          <ul className="mt-1 space-y-1 text-[11px]">
            {report.nextRecommendations.map((r) => (
              <li key={r.decisionId} className="rounded border border-stone-100 bg-stone-50 px-2 py-1">
                <span className="font-bold">{r.action}</span> — {r.title}
                <span className="text-stone-500"> · {r.priority}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-stone-400">
        Completed execution ≠ business success. No auto-publish. No fabricated traffic metrics.
      </p>
    </section>
  );
}
