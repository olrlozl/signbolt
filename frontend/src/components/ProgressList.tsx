import type { PersonStatus } from "../types";

interface Props {
  persons: PersonStatus[];
  highlightName?: string;
}

export default function ProgressList({ persons, highlightName }: Props) {
  const done = persons.filter((p) => p.done).length;
  const pct = persons.length ? Math.round((done / persons.length) * 100) : 0;

  return (
    <div className="status-panel">
      <div className="status-head">
        <strong>서명 현황</strong>
        <span>
          {done} / {persons.length} 명
        </span>
      </div>
      <div className="progress">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <ul className="person-list">
        {persons.map((p) => (
          <li
            key={p.name}
            className={`${p.done ? "done" : ""}${p.name === highlightName ? " me" : ""}`}
          >
            <span className="pname">
              {p.name}
              {p.name === highlightName && " (나)"}
            </span>
            <span className="pbadge">{p.done ? "서명 완료" : "대기 중"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
