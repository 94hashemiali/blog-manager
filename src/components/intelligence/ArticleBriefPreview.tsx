export default function ArticleBriefPreview({ brief }: { brief: any }) {
  if (!brief) return null;
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 text-xs space-y-2">
      <h4 className="font-bold text-sm">{brief.topic}</h4>
      <p><strong>زاویه یکتا:</strong> {brief.uniqueAngle}</p>
      <p><strong>خوشه:</strong> {brief.contentCluster || '—'}</p>
      <p><strong>نیت:</strong> {brief.searchIntent}</p>
      {brief.productsToMention?.length > 0 && <p><strong>محصولات:</strong> {brief.productsToMention.join('، ')}</p>}
      {brief.internalLinks?.length > 0 && (
        <p><strong>لینک داخلی:</strong> {brief.internalLinks.map((l: any) => l.articleTitle).join('، ')}</p>
      )}
      {brief.forbiddenOverlap?.length > 0 && (
        <p className="text-amber-800"><strong>هم‌پوشانی ممنوع:</strong> {brief.forbiddenOverlap.join('، ')}</p>
      )}
    </div>
  );
}
