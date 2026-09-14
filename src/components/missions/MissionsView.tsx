import MissionsPanel from './MissionsPanel';

interface Props {
  siteId: string;
  onOpenJob?: (jobId: string) => void;
  onOpenDecision?: (decisionId: string) => void;
  initialMissionId?: string | null;
  onInitialMissionConsumed?: () => void;
}

/** First-class Missions view (AppView = missions). */
export default function MissionsView({
  siteId,
  onOpenJob,
  onOpenDecision,
  initialMissionId,
  onInitialMissionConsumed
}: Props) {
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-stone-200 bg-gradient-to-l from-emerald-50 via-white to-teal-50 p-5" dir="rtl">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
          Content Operating System
        </p>
        <h1 className="mt-1 text-xl font-black text-stone-900">مرکز مأموریت</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          هدف → Decision Engine → Task Graph → Recommendation → Job → بازبینی انسان. بدون انتشار
          خودکار. بدون LLM در برنامه‌ریزی.
        </p>
      </header>
      <MissionsPanel
        siteId={siteId}
        onOpenJob={onOpenJob}
        onOpenDecision={onOpenDecision}
        initialMissionId={initialMissionId}
        onInitialMissionConsumed={onInitialMissionConsumed}
      />
    </div>
  );
}
