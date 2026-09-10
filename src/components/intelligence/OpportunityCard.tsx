import ConfidenceBadge from './ConfidenceBadge';

export default function OpportunityCard({
  title,
  keyword,
  intent,
  contentType,
  cluster,
  why,
  priority,
  confidence,
  sourceType,
  cannibalization,
  products,
  onWrite,
  onBrief
}: {
  title: string;
  keyword?: string;
  intent?: string;
  contentType?: string;
  cluster?: string;
  why: string;
  priority?: number;
  confidence?: string;
  sourceType?: string;
  cannibalization?: string;
  products?: string[];
  onWrite?: () => void;
  onBrief?: () => void;
}) {
  return (
    <article className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs space-y-2">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-bold text-sm text-stone-900">{title}</h4>
        {typeof priority === 'number' && (
          <span className="text-xs font-black text-emerald-700">{priority}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] text-stone-600">
        {keyword && <span className="px-2 py-0.5 bg-stone-100 rounded">{keyword}</span>}
        {intent && <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded">{intent}</span>}
        {contentType && <span className="px-2 py-0.5 bg-purple-50 text-purple-800 rounded">{contentType}</span>}
        {cluster && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded">{cluster}</span>}
        {cannibalization && <span className="px-2 py-0.5 bg-amber-50 text-amber-900 rounded">{cannibalization}</span>}
      </div>
      <p className="text-xs text-stone-600 leading-6">{why}</p>
      {products && products.length > 0 && (
        <p className="text-[11px] text-stone-500">محصولات مرتبط: {products.join('، ')}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <ConfidenceBadge confidence={confidence} sourceType={sourceType} />
        <div className="flex gap-2">
          {onBrief && (
            <button type="button" onClick={onBrief} className="text-[11px] font-bold text-stone-600 hover:text-stone-900">
              بریف
            </button>
          )}
          {onWrite && (
            <button type="button" onClick={onWrite} className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900">
              تولید مقاله
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
