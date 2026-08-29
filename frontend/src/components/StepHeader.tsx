import type { ReactNode } from "react";

interface Props {
  num: number;
  total: number;
  title: string;
  desc: ReactNode;
}

export default function StepHeader({ num, total, title, desc }: Props) {
  return (
    <div className="step-header">
      <div className="step-dots" aria-label={`${num} / ${total} 단계`}>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i + 1 <= num ? "on" : ""} />
        ))}
      </div>
      <div className="step-header-top">
        <span className="step-badge">{num}</span>
        <h2>{title}</h2>
      </div>
      <p>{desc}</p>
    </div>
  );
}
