const STEPS = [
  {
    title: "서명부 업로드",
    desc: "서명받을 PDF를 업로드하세요. 서명란은 자동으로 인식됩니다.",
  },
  {
    title: "서명란 지정",
    desc: "서명란을 추가 또는 삭제하거나, 위치와 크기를 조정할 수 있습니다. 서명자 이름 지정은 필수입니다.",
  },
  { title: "게시 · 서명 현황", desc: "" },
];

/** Sticky step header shared by the admin upload and editor screens —
 *  same shape as the signer's StepHeader. */
export default function AdminSteps({ current }: { current: 1 | 2 | 3 }) {
  const step = STEPS[current - 1];
  return (
    <div className="admin-steps">
      <div className="admin-steps-dots" aria-label={`${current} / 3 단계`}>
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= current ? "on" : ""} />
        ))}
      </div>
      <div className="admin-steps-title">
        <span className="admin-steps-badge">{current}</span>
        <h2>{step.title}</h2>
      </div>
      {step.desc && <p>{step.desc}</p>}
    </div>
  );
}
