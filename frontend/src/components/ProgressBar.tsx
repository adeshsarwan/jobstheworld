interface ProgressBarProps {
  step: number;
  total: number;
}

export function ProgressBar({ step, total }: ProgressBarProps) {
  const percent = Math.round((step / total) * 100);

  return (
    <div className="progress" aria-label={`Step ${step} of ${total}`}>
      <span className="progress-label">Step {step} of {total}</span>
      <span className="progress-track">
        <span className="progress-fill" style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}
