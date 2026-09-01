import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "./icons";

const LABELS = ["서명부 등록", "서명란 지정", "서명 수집", "서명 완료"];

const NOTES: Record<number, string> = {
  1: "서명받을 PDF를 업로드하세요. 문서를 분석해 서명란을 감지합니다.",
  2: "서명란을 추가 또는 삭제하거나 위치와 크기를 조정할 수 있습니다. 서명자 이름 지정은 필수입니다.",
  3: "QR·링크를 공유해 서명을 요청하고, 수집 현황을 실시간으로 확인하세요.",
  4: "모든 서명자가 서명을 완료했습니다. 최종 서명본 PDF를 저장하세요.",
};

interface Props {
  current: 1 | 2 | 3 | 4;
  /** when true, mount one step behind and fill up to `current` once (used
   *  right after an upload so the 1→2 segment animates like the live ones) */
  animateInitial?: boolean;
}

/** Progress header shared by every admin screen (upload → editor).
 *  Shows all four stage titles at once; the current stage is highlighted.
 *  The blue bar fills in place (CSS transition) when the step advances live —
 *  publish, or the last signature landing. A plain visit from the list just
 *  renders it already filled up to the current step, no animation.
 *  Display only — steps are not clickable. */
export default function DocSteps({ current, animateInitial = false }: Props) {
  const [shown, setShown] = useState(
    animateInitial && current > 1 ? current - 1 : current,
  );
  const behind = useRef(shown !== current);

  useEffect(() => {
    if (behind.current) {
      behind.current = false;
      // let the "one step behind" state paint, then fill to the real step
      const id = requestAnimationFrame(() =>
        requestAnimationFrame(() => setShown(current)),
      );
      return () => cancelAnimationFrame(id);
    }
    setShown(current);
  }, [current]);

  return (
    <div className="doc-steps">
      <ol className="doc-steps-track" aria-label={`${current} / 4 단계`}>
        {LABELS.map((label, i) => {
          const n = i + 1;
          const state = n < shown ? "done" : n === shown ? "current" : "todo";
          return (
            <li
              key={n}
              className={`doc-step ${state}`}
              aria-current={n === current ? "step" : undefined}
            >
              <span className="doc-step-mark">
                {n < shown ? <CheckIcon /> : n}
              </span>
              <span className="doc-step-label">{label}</span>
            </li>
          );
        })}
      </ol>

      <p className="doc-steps-desc">{NOTES[current]}</p>
    </div>
  );
}
