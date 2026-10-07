/** Marks a panel whose numbers are sample data, not live OracleDesk data. */
export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Sample data for layout. Not live OracleDesk data."
      className={`text-[10px] font-label-caps uppercase px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant ${className}`}
    >
      Demo data
    </span>
  );
}
