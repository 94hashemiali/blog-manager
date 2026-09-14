import { useState } from 'react';
import type { MissionGoal } from '../../api/missions';

const GOALS: Array<{ value: MissionGoal; label: string }> = [
  { value: 'ORGANIC_GROWTH', label: 'رشد ارگانیک' },
  { value: 'CONTENT_REFRESH', label: 'تازه‌سازی محتوا' },
  { value: 'CONTENT_EXPANSION', label: 'گسترش محتوا' },
  { value: 'SEO_IMPROVEMENT', label: 'بهبود سئو' },
  { value: 'RESEARCH_REFRESH', label: 'تازه‌سازی تحقیق' },
  { value: 'CONTENT_HEALTH', label: 'سلامت محتوا' },
  { value: 'CUSTOM', label: 'سفارشی' }
];

interface Props {
  onCreate: (input: {
    title: string;
    description: string;
    goal: MissionGoal;
    targetDate?: string;
  }) => Promise<void>;
  busy?: boolean;
}

export default function MissionCreate({ onCreate, busy }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState<MissionGoal>('CONTENT_REFRESH');
  const [targetDate, setTargetDate] = useState('');

  return (
    <form
      className="space-y-3 rounded-xl border border-stone-200 bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onCreate({
          title: title.trim(),
          description,
          goal,
          targetDate: targetDate || undefined
        });
        setTitle('');
        setDescription('');
        setTargetDate('');
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">مأموریت جدید</p>
      <p className="text-[11px] text-stone-500">
        وظایف را دستی تعریف نکن — برنامه از وضعیت سایت و Decision Engine ساخته می‌شود.
      </p>
      <input
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
        placeholder="عنوان مأموریت"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
        placeholder="توضیح (اختیاری)"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <select
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
        value={goal}
        onChange={(e) => setGoal(e.target.value as MissionGoal)}
      >
        {GOALS.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label} ({g.value})
          </option>
        ))}
      </select>
      <label className="block text-[11px] text-stone-500">
        تاریخ هدف (اختیاری)
        <input
          type="date"
          className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="w-full rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
      >
        ایجاد + تولید Plan
      </button>
    </form>
  );
}
