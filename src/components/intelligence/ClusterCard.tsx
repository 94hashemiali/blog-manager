export default function ClusterCard({
  name,
  score,
  pillar,
  missing,
  actions
}: {
  name: string;
  score: number;
  pillar?: string;
  missing?: string[];
  actions?: string[];
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm">{name}</h4>
        <span className={`text-xs font-black ${score < 60 ? 'text-amber-700' : 'text-emerald-700'}`}>{score}</span>
      </div>
      {pillar && <p className="text-xs text-stone-600">ستون: {pillar}</p>}
      {missing && missing.length > 0 && <p className="text-xs">کمبود: {missing.join('، ')}</p>}
      {actions && actions.length > 0 && <p className="text-[11px] text-stone-500">{actions[0]}</p>}
    </div>
  );
}
