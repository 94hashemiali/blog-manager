import type { PerformanceSnapshot, PerformanceTrend } from './types.js';

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pickMetric(
  snapshots: PerformanceSnapshot[],
  metric: PerformanceTrend['metric']
): number[] {
  return snapshots
    .map((snap) => {
      if (metric === 'clicks') return snap.clicks;
      if (metric === 'impressions') return snap.impressions;
      if (metric === 'ctr') return snap.ctr;
      if (metric === 'position') return snap.position;
      // Composite prefers clicks, then impressions.
      return snap.clicks ?? snap.impressions;
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

/**
 * Compares the most recent window with the previous equal window.
 * Never invents a percentage when either window lacks data.
 */
export function calculateTrend(
  snapshots: PerformanceSnapshot[],
  opts: { metric?: PerformanceTrend['metric']; periodDays?: number; now?: Date } = {}
): PerformanceTrend {
  const metric = opts.metric || 'composite';
  const periodDays = opts.periodDays || 28;
  const now = opts.now || new Date();
  const periodMs = periodDays * 24 * 60 * 60 * 1000;

  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.filter((snap) => now.getTime() - new Date(snap.date).getTime() <= periodMs);
  const previous = sorted.filter((snap) => {
    const age = now.getTime() - new Date(snap.date).getTime();
    return age > periodMs && age <= periodMs * 2;
  });

  const recentValues = pickMetric(recent, metric);
  const previousValues = pickMetric(previous, metric);
  const sampleSize = recentValues.length + previousValues.length;

  if (recentValues.length < 3 || previousValues.length < 3) {
    return {
      direction: 'INSUFFICIENT_DATA',
      changePercent: null,
      confidence: 'low',
      sampleSize,
      recentPeriodDays: periodDays,
      previousPeriodDays: periodDays,
      metric,
      reason: `دادهٔ کافی برای مقایسهٔ ${periodDays} روز اخیر با دورهٔ قبل وجود ندارد.`
    };
  }

  const recentAvg = average(recentValues)!;
  const previousAvg = average(previousValues)!;

  // Position trends invert: a lower average position is an improvement.
  const risingIsGood = metric !== 'position';
  const delta = risingIsGood ? recentAvg - previousAvg : previousAvg - recentAvg;
  const changePercent =
    previousAvg === 0 ? null : Math.round((delta / Math.abs(previousAvg)) * 1000) / 10;

  if (changePercent == null) {
    return {
      direction: 'INSUFFICIENT_DATA',
      changePercent: null,
      confidence: 'low',
      sampleSize,
      recentPeriodDays: periodDays,
      previousPeriodDays: periodDays,
      metric,
      reason: 'میانگین دورهٔ قبل صفر است و درصد تغییر قابل محاسبه نیست.'
    };
  }

  const volatility =
    stddev(recentValues) / Math.max(1, Math.abs(recentAvg)) > 0.45 &&
    stddev(previousValues) / Math.max(1, Math.abs(previousAvg)) > 0.45;

  let direction: PerformanceTrend['direction'] = 'STABLE';
  if (volatility && Math.abs(changePercent) >= 8) direction = 'VOLATILE';
  else if (changePercent >= 12) direction = 'RISING';
  else if (changePercent <= -12) direction = 'FALLING';

  return {
    direction,
    changePercent,
    confidence: sampleSize >= 14 ? 'high' : 'medium',
    sampleSize,
    recentPeriodDays: periodDays,
    previousPeriodDays: periodDays,
    metric,
    reason:
      direction === 'STABLE'
        ? `تغییر ${changePercent}٪ در محدودهٔ پایدار است.`
        : `تغییر ${changePercent}٪ نسبت به دورهٔ قبل (${direction}).`
  };
}

function stddev(values: number[]): number {
  const avg = average(values);
  if (avg == null || values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
