interface DecisionScoreProps {
  score: number;
  confidence?: string;
  expectedImpact?: string;
  effort?: number;
  priority?: string;
}

export default function DecisionScore({
  score,
  confidence,
  expectedImpact,
  effort,
  priority
}: DecisionScoreProps) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
      <div>
        <dt className="text-stone-500">Priority score</dt>
        <dd className="font-black text-stone-900">{Math.round((score || 0) * 100)}</dd>
      </div>
      {confidence && (
        <div>
          <dt className="text-stone-500">Confidence</dt>
          <dd className="font-black text-stone-900">{confidence}</dd>
        </div>
      )}
      {expectedImpact && (
        <div>
          <dt className="text-stone-500">Impact</dt>
          <dd className="font-black text-stone-900">{expectedImpact}</dd>
        </div>
      )}
      {priority && (
        <div>
          <dt className="text-stone-500">Priority</dt>
          <dd className="font-black text-stone-900">{priority}</dd>
        </div>
      )}
      {typeof effort === 'number' && (
        <div>
          <dt className="text-stone-500">Effort</dt>
          <dd className="font-black text-stone-900">{effort.toFixed(2)}</dd>
        </div>
      )}
    </dl>
  );
}
