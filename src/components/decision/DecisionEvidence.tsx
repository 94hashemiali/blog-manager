interface EvidenceItem {
  type?: string;
  severity?: string;
  evidence?: string[];
}

interface DecisionEvidenceProps {
  reasons?: string[];
  signals?: EvidenceItem[];
  blockers?: Array<{ code: string; message: string }>;
}

export default function DecisionEvidence({ reasons = [], signals = [], blockers = [] }: DecisionEvidenceProps) {
  return (
    <div className="space-y-2 text-[11px]">
      {reasons.length > 0 && (
        <div>
          <p className="font-black text-stone-600">Evidence</p>
          <ul className="mt-1 list-disc pr-4 text-stone-700">
            {reasons.slice(0, 6).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {signals.length > 0 && (
        <div>
          <p className="font-black text-stone-600">Signals</p>
          <ul className="mt-1 space-y-1">
            {signals.slice(0, 6).map((s, i) => (
              <li key={i} className="rounded border border-stone-200 bg-white px-2 py-1 text-stone-700">
                <span className="font-bold">{s.type}</span>
                {s.severity ? ` · ${s.severity}` : ''}
                {s.evidence?.[0] ? ` — ${s.evidence[0]}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {blockers.length > 0 && (
        <ul className="space-y-1">
          {blockers.map((b) => (
            <li
              key={b.code}
              className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900"
            >
              {b.code}: {b.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
