interface Props {
  missions: Array<{
    id: string;
    title: string;
    goal: string;
    status: string;
    planVersion: number;
    updatedAt: string;
  }>;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
}

export default function MissionList({ missions, selectedId, onSelect, loading }: Props) {
  if (loading && !missions.length) {
    return <p className="text-sm text-stone-400">Loading missions…</p>;
  }
  if (!missions.length) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">
        No missions yet.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {missions.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onSelect(m.id)}
            className={`w-full rounded-xl border px-3 py-3 text-left text-xs transition ${
              selectedId === m.id
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-stone-900">{m.title}</span>
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                {m.status}
              </span>
              <span className="text-[10px] text-stone-500">{m.goal}</span>
            </div>
            <p className="mt-1 text-[10px] text-stone-500">plan v{m.planVersion}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
