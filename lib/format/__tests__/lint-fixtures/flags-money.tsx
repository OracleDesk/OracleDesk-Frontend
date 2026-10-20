export function BadMoneyView({ summary }: { summary: { totalUsdc: number; dailyPnl: number } }) {
  const amount = 42.5;
  return (
    <div>
      <span>{summary.totalUsdc.toLocaleString()}</span>
      <span>{amount.toFixed(2)}</span>
      <span>{`$${summary.dailyPnl.toFixed(2)}`}</span>
    </div>
  );
}
