import type { ReactNode } from 'react';

export function Metric({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  testId?: string;
}): ReactNode {
  return (
    <div className="metric" data-testid={testId}>
      <div className="metric__k">{label}</div>
      <div className="metric__v">{value}</div>
      {note ? <div className="metric__note">{note}</div> : null}
    </div>
  );
}
