export default function SeloTermoDeteccao({
  termo,
  ancora,
  className = "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800",
}: {
  termo: string;
  ancora?: string | null;
  className?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={className}>{termo}</span>
      {ancora ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {ancora}
        </span>
      ) : null}
    </span>
  );
}
