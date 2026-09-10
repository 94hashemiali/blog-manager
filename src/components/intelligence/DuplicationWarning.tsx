export default function DuplicationWarning({
  decision,
  message
}: {
  decision?: string;
  message?: string;
}) {
  if (!decision && !message) return null;
  return (
    <div className="text-xs bg-amber-50 border border-amber-200 text-amber-950 rounded-lg p-3">
      {decision && <div className="font-bold mb-1">تصمیم: {decision}</div>}
      {message && <p>{message}</p>}
    </div>
  );
}
