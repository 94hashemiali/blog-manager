import { useState } from 'react';

const GOALS = [
  'ORGANIC_GROWTH',
  'CONTENT_REFRESH',
  'CONTENT_EXPANSION',
  'SEO_IMPROVEMENT',
  'RESEARCH_REFRESH',
  'CONTENT_HEALTH',
  'CUSTOM'
];

interface Props {
  onCreate: (input: { title: string; description: string; goal: string }) => Promise<void>;
  busy?: boolean;
}

export default function MissionCreate({ onCreate, busy }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('CONTENT_REFRESH');

  return (
    <form
      className="space-y-3 rounded-xl border border-stone-200 bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onCreate({ title: title.trim(), description, goal });
        setTitle('');
        setDescription('');
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">New mission</p>
      <input
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
        placeholder="Mission title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
        placeholder="Description (optional)"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <select
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      >
        {GOALS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="w-full rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
      >
        Create mission
      </button>
    </form>
  );
}
