import type { ProgressStep } from '../../utils/productionClient';

const STATUS_STYLES: Record<ProgressStep['status'], string> = {
  done: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  current: 'bg-cyan-50 text-cyan-800 border-cyan-300 ring-2 ring-cyan-100',
  todo: 'bg-stone-50 text-stone-400 border-stone-200'
};

const STATUS_MARK: Record<ProgressStep['status'], string> = {
  done: '✓',
  warn: '⚠',
  current: '●',
  todo: '○'
};

export default function PipelineStrip({ progress }: { progress: ProgressStep[] }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-xs font-bold text-stone-500">خط تولید محتوا</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {progress.map((step) => (
          <div
            key={step.key}
            className={`rounded-xl border px-2.5 py-2 text-center text-xs font-bold ${STATUS_STYLES[step.status]}`}
          >
            <div className="text-base leading-none">{STATUS_MARK[step.status]}</div>
            <div className="mt-1">{step.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
