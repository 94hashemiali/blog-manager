import ConfidenceBadge from './ConfidenceBadge';

export default function CompetitorCard({
  name,
  domain,
  verified,
  pages,
  gaps,
  sourceType,
  confidence,
  notes
}: {
  name: string;
  domain: string;
  verified?: boolean;
  pages?: number;
  gaps?: string[];
  sourceType?: string;
  confidence?: string;
  notes?: string;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold text-sm">{name}</div>
          <div className="text-[11px] font-mono text-stone-500">{domain}</div>
        </div>
        <ConfidenceBadge confidence={confidence} sourceType={sourceType} />
      </div>
      <p className="text-xs text-stone-600">
        {verified ? `${pages || 0} صفحه مشاهده‌شده از REST وردپرس` : 'تأیید نشده — هیچ داده رقبا جعل نشده است'}
      </p>
      {gaps && gaps.length > 0 && <p className="text-xs">شکاف‌ها: {gaps.slice(0, 4).join('، ')}</p>}
      {notes && <p className="text-[11px] text-stone-500">{notes}</p>}
    </div>
  );
}
