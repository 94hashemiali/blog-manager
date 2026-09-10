import { useEffect, useState } from 'react';
import {
  cancelJob,
  getAutomationSettings,
  listJobs,
  pauseJob,
  resumeJob,
  retryJob,
  saveAutomationSettings,
  type OpsJob
} from '../api/jobs';

interface JobCenterProps {
  siteId: string;
  open: boolean;
  onClose: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  RUNNING: 'bg-sky-100 text-sky-800',
  QUEUED: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-rose-100 text-rose-800',
  CANCELLED: 'bg-stone-200 text-stone-700',
  PAUSED: 'bg-violet-100 text-violet-800',
  INTERRUPTED: 'bg-orange-100 text-orange-800',
  RECOVERY_REQUIRED: 'bg-orange-100 text-orange-900'
};

export default function JobCenter({ siteId, open, onClose }: JobCenterProps) {
  const [jobs, setJobs] = useState<OpsJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'jobs' | 'automation'>('jobs');
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [performanceSync, setPerformanceSync] = useState('disabled');
  const [contentIntelligence, setContentIntelligence] = useState('disabled');
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      const data = await listJobs({ siteId });
      setJobs(data.jobs || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [open, siteId]);

  useEffect(() => {
    if (!open || tab !== 'automation') return;
    getAutomationSettings(siteId)
      .then((data) => {
        setMonitoringEnabled(Boolean(data.settings?.monitoringEnabled));
        const schedules = data.schedules || [];
        const read = (type: string) => {
          const row = schedules.find((s: any) => s.type === type && s.enabled);
          return row ? row.interval : 'disabled';
        };
        setPerformanceSync(read('PERFORMANCE_SYNC'));
        setContentIntelligence(read('INTELLIGENCE_SYNC'));
      })
      .catch((err) => setError(err.message));
  }, [open, tab, siteId]);

  if (!open) return null;

  const active = jobs.filter((j) => ['RUNNING', 'QUEUED', 'PAUSED'].includes(j.status));
  const failed = jobs.filter((j) => ['FAILED', 'INTERRUPTED', 'RECOVERY_REQUIRED'].includes(j.status));
  const done = jobs.filter((j) => ['COMPLETED', 'CANCELLED'].includes(j.status)).slice(0, 12);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md bg-white shadow-xl border-l border-stone-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <header className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-stone-900">مرکز عملیات</h2>
            <p className="text-xs text-stone-500">{active.length} در حال اجرا / صف</p>
          </div>
          <button type="button" className="text-stone-500 hover:text-stone-800" onClick={onClose}>
            بستن
          </button>
        </header>

        <div className="flex border-b border-stone-200 text-sm">
          <button
            type="button"
            className={`flex-1 py-2 ${tab === 'jobs' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-stone-500'}`}
            onClick={() => setTab('jobs')}
          >
            کارها
          </button>
          <button
            type="button"
            className={`flex-1 py-2 ${tab === 'automation' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-stone-500'}`}
            onClick={() => setTab('automation')}
          >
            اتوماسیون
          </button>
        </div>

        {error && <p className="mx-4 mt-3 text-sm text-rose-600">{error}</p>}

        {tab === 'jobs' ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <JobGroup title="فعال" jobs={active} siteId={siteId} onChange={refresh} />
            <JobGroup title="ناموفق" jobs={failed} siteId={siteId} onChange={refresh} />
            <JobGroup title="اخیر" jobs={done} siteId={siteId} onChange={refresh} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={monitoringEnabled}
                onChange={(e) => setMonitoringEnabled(e.target.checked)}
              />
              Monitoring روشن
            </label>
            <Select label="Performance sync" value={performanceSync} onChange={setPerformanceSync} />
            <Select label="Content intelligence" value={contentIntelligence} onChange={setContentIntelligence} />
            <p className="text-xs text-stone-500">Research refresh schedule: not enabled (needs topic-scoped jobs)</p>
            <p className="text-xs text-stone-500">Automatic content generation: OFF</p>
            <p className="text-xs text-stone-500">Automatic publishing: OFF (hard)</p>
            <button
              type="button"
              disabled={saving}
              className="w-full rounded-lg bg-emerald-700 text-white py-2 disabled:opacity-50"
              onClick={async () => {
                setSaving(true);
                try {
                  await saveAutomationSettings(siteId, {
                    monitoringEnabled,
                    performanceSync,
                    contentIntelligence,
                    researchRefresh: 'disabled'
                  });
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              ذخیره تنظیمات
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function Select({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-stone-600">{label}</span>
      <select
        className="w-full border border-stone-300 rounded-lg px-2 py-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="disabled">Disabled</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </select>
    </label>
  );
}

function JobGroup({
  title,
  jobs,
  siteId,
  onChange
}: {
  title: string;
  jobs: OpsJob[];
  siteId: string;
  onChange: () => void;
}) {
  if (!jobs.length) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold text-stone-500 mb-2">{title}</h3>
      <ul className="space-y-2">
        {jobs.map((job) => (
          <li key={job.id} className="border border-stone-200 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-stone-800 text-sm">{job.type}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded ${STATUS_STYLE[job.status] || 'bg-stone-100'}`}>
                {job.status}
              </span>
            </div>
            <p className="text-xs text-stone-600 mt-1">{job.progress?.label}</p>
            <div className="mt-2 h-1.5 bg-stone-100 rounded overflow-hidden">
              <div className="h-full bg-emerald-600" style={{ width: `${job.progress?.percentage || 0}%` }} />
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              {job.progress?.current}/{job.progress?.total} · {job.currentStage || '—'}
            </p>
            {job.lastError && <p className="text-[11px] text-rose-600 mt-1">{job.lastError.message}</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              {['RUNNING', 'QUEUED', 'PAUSED'].includes(job.status) && (
                <button
                  type="button"
                  className="text-xs text-rose-700"
                  onClick={() => cancelJob(job.id, siteId).then(onChange)}
                >
                  لغو
                </button>
              )}
              {job.status === 'RUNNING' && (
                <button
                  type="button"
                  className="text-xs text-violet-700"
                  onClick={() => pauseJob(job.id, siteId).then(onChange)}
                >
                  توقف
                </button>
              )}
              {['PAUSED', 'INTERRUPTED', 'FAILED'].includes(job.status) && (
                <button
                  type="button"
                  className="text-xs text-emerald-700"
                  onClick={() =>
                    (job.status === 'FAILED' ? retryJob(job.id, siteId) : resumeJob(job.id, siteId)).then(onChange)
                  }
                >
                  {job.status === 'FAILED' ? 'تلاش مجدد' : 'ادامه'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
