import DecisionScore from './DecisionScore';
import DecisionEvidence from './DecisionEvidence';

export interface NextActionCard {
  id: string;
  title: string;
  recommendedAction?: string;
  action?: string;
  score: number;
  confidence?: string;
  expectedImpact?: string;
  priority?: string;
  effort?: number;
  reasons?: string[];
  signals?: Array<{ type?: string; severity?: string; evidence?: string[] }>;
  blockers?: Array<{ code: string; message: string }>;
  explanation?: {
    whyThis?: string;
    whyNow?: string;
    whyRejectedHigherRisk?: string;
  };
  recommendationId?: string;
  articleId?: string | number;
}

interface Props {
  actions: NextActionCard[];
  busyId?: string | null;
  onExecute?: (action: NextActionCard) => void;
  onOpenDetail?: (action: NextActionCard) => void;
  onReevaluate?: () => void;
  loading?: boolean;
}

export default function NextBestActions({
  actions,
  busyId,
  onExecute,
  onOpenDetail,
  onReevaluate,
  loading
}: Props) {
  const top = actions.slice(0, 5);

  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-l from-emerald-50 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Next Best Actions</p>
          <p className="text-xs text-stone-600">Deterministic Decision Engine — no LLM ranking</p>
        </div>
        {onReevaluate && (
          <button
            type="button"
            onClick={onReevaluate}
            disabled={loading}
            className="rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-black text-emerald-800 disabled:opacity-50"
          >
            Re-evaluate
          </button>
        )}
      </div>

      {top.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">
          No prioritized actions yet. Run re-evaluate when signals exist.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {top.map((item) => {
            const action = item.recommendedAction || item.action || '—';
            const blocker = item.blockers?.[0];
            return (
              <li
                key={item.id}
                className="rounded-xl border border-emerald-100 bg-white/90 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                        {action}
                      </span>
                      {item.expectedImpact && (
                        <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-black text-stone-700">
                          {item.expectedImpact} IMPACT
                        </span>
                      )}
                      {item.confidence && (
                        <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-900">
                          {item.confidence} CONFIDENCE
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-sm font-black text-stone-900">{item.title}</h3>
                    <div className="mt-2">
                      <DecisionScore
                        score={item.score}
                        confidence={item.confidence}
                        expectedImpact={item.expectedImpact}
                        priority={item.priority}
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-stone-700">
                      <span className="font-bold">Why:</span>{' '}
                      {item.explanation?.whyNow ||
                        item.explanation?.whyThis ||
                        item.reasons?.[0] ||
                        'Stored operational signals'}
                    </p>
                    {item.explanation?.whyRejectedHigherRisk && (
                      <p className="mt-1 text-[11px] text-amber-900">
                        {item.explanation.whyRejectedHigherRisk}
                      </p>
                    )}
                    <div className="mt-2">
                      <DecisionEvidence blockers={blocker ? [blocker] : []} reasons={item.reasons?.slice(0, 3)} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {onOpenDetail && (
                      <button
                        type="button"
                        onClick={() => onOpenDetail(item)}
                        className="rounded-xl border border-stone-200 px-3 py-2 text-[11px] font-black text-stone-700"
                      >
                        Details
                      </button>
                    )}
                    {onExecute && (
                      <button
                        type="button"
                        disabled={busyId === item.id || busyId === item.recommendationId}
                        onClick={() => onExecute(item)}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-[11px] font-black text-white disabled:opacity-50"
                      >
                        Execute
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
