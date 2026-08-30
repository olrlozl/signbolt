import type { ReactNode } from "react";
import { ChevronLeftIcon } from "./icons";

interface Props {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: ReactNode;
  nextDisabled?: boolean;
  onSecondary?: () => void;
  secondaryLabel?: ReactNode;
  busy?: boolean;
}

export default function StepNav({
  onBack,
  onNext,
  nextLabel = "다음",
  nextDisabled,
  onSecondary,
  secondaryLabel,
  busy,
}: Props) {
  return (
    <nav className="step-nav">
      <div className="step-nav-inner">
        {onBack && (
          <button className="btn" onClick={onBack} disabled={busy}>
            <ChevronLeftIcon />
            이전
          </button>
        )}
        <div className="step-nav-right">
          {onSecondary && (
            <button className="btn" onClick={onSecondary} disabled={busy}>
              {secondaryLabel}
            </button>
          )}
          <button
            className="btn primary"
            onClick={onNext}
            disabled={!onNext || nextDisabled || busy}
          >
            {busy ? "처리 중…" : nextLabel}
          </button>
        </div>
      </div>
    </nav>
  );
}
