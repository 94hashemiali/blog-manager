import DecisionScore from './DecisionScore';
import DecisionEvidence from './DecisionEvidence';

export interface DecisionDetailModel {
  id: string;
  title: string;
  recommendedAction?: string;
  type?: string;
  score: number;
  confidence?: string;
  expectedImpact?: string;
  effort?: number;
  priority?: string;
  status?: string;
  feasibilityStatus?: string;
  reasons?: string[];
  signals?: Array<{ type?: string; severity?: string; evidence?: string[] }>;
  blockers?: Array<{ code: string; message: string }>;
  explanation?: {
    whyThis?: string;
    whyNow?: string;
    whatHappensIfExecuted?: string;
    whatWillNotHappen?: string;
    expectedBenefit?: string;
    alternatives?: Array<{ action: string; score: number; reason: string }>;
    whyRejectedHigherRisk?: string;
  };
  recommendationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Props {
  decision: DecisionDetailModel;
  recommendation?: { id: string; status: string; linkedJobId?: string } | null;
  onClose?: () => void;
  onExecute?: () => void;
  busy?: boolean;
}

export default function DecisionDetail({ decision, recommendation, onClose, onExecute, busy }: Props) {
  const action = decision.recommendedAction || decision.type || '—';
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center" dir="rtl">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Decision detail</p>
            <h3 className="mt-1 text-lg font-black text-stone-900">{decision.title}</h3>
            <p className="mt-1 text-xs font-bold text-emerald-800">{action}</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-bold text-stone-600"
            >
              Close
            </button>
          )}
        </div>

        <div className="mt-4">
          <DecisionScore
            score={decision.score}
            confidence={decision.confidence}
            expectedImpact={decision.expectedImpact}
            effort={decision.effort}
            priority={decision.priority}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase">
          {decision.status && (
            <span className="rounded bg-stone-100 px-2 py-1 text-stone-700">{decision.status}</span>
          )}
          {decision.feasibilityStatus && (
            <span className="rounded bg-sky-100 px-2 py-1 text-sky-900">{decision.feasibilityStatus}</span>
          )}
          {recommendation && (
            <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-900">
              rec {recommendation.status}
            </span>
          )}
          {recommendation?.linkedJobId && (
            <span className="rounded bg-violet-100 px-2 py-1 text-violet-900">
              job {recommendation.linkedJobId}
            </span>
          )}
        </div>

        {decision.explanation && (
          <div className="mt-4 space-y-1.5 text-[11px] text-stone-700">
            {decision.explanation.whyThis && (
              <p>
                <span className="font-bold">Why:</span> {decision.explanation.whyThis}
              </p>
            )}
            {decision.explanation.whyNow && (
              <p>
                <span className="font-bold">Why now:</span> {decision.explanation.whyNow}
              </p>
            )}
            {decision.explanation.whatHappensIfExecuted && (
              <p>
                <span className="font-bold">If executed:</span> {decision.explanation.whatHappensIfExecuted}
              </p>
            )}
            {decision.explanation.whatWillNotHappen && (
              <p>
                <span className="font-bold">Will NOT:</span> {decision.explanation.whatWillNotHappen}
              </p>
            )}
            {decision.explanation.expectedBenefit && (
              <p>
                <span className="font-bold">Benefit:</span> {decision.explanation.expectedBenefit}
              </p>
            )}
            {decision.explanation.whyRejectedHigherRisk && (
              <p className="text-amber-900">
                <span className="font-bold">Rejected higher risk:</span>{' '}
                {decision.explanation.whyRejectedHigherRisk}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <DecisionEvidence
            reasons={decision.reasons}
            signals={decision.signals}
            blockers={decision.blockers}
          />
        </div>

        {(decision.explanation?.alternatives || []).length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-black text-stone-600">Alternatives</p>
            <ul className="mt-1 space-y-1 text-[11px] text-stone-700">
              {decision.explanation!.alternatives!.map((a) => (
                <li key={a.action} className="rounded border border-stone-100 px-2 py-1">
                  {a.action} · score {Math.round(a.score * 100)} — {a.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-stone-500">
          {decision.createdAt && <p>Created: {decision.createdAt}</p>}
          {decision.updatedAt && <p>Updated: {decision.updatedAt}</p>}
          {decision.recommendationId && <p>Recommendation: {decision.recommendationId}</p>}
        </div>

        {onExecute && (
          <button
            type="button"
            disabled={busy}
            onClick={onExecute}
            className="mt-5 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            Execute
          </button>
        )}
      </div>
    </div>
  );
}
