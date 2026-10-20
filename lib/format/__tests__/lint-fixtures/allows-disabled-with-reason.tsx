export function DisabledWithReasonView({ fileSize }: { fileSize: number }) {
  // eslint-disable-next-line no-restricted-syntax -- not money: byte count display
  const label = fileSize.toFixed(1);
  return <span>{label} KB</span>;
}
