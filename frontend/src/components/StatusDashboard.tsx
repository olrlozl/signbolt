import { useState } from "react";
import type { PersonStatus } from "../types";
import { CheckIcon, DownloadIcon } from "./icons";

interface Props {
  persons: PersonStatus[];
  complete: boolean;
  finalUrl: string;
}

export default function StatusDashboard({ persons, complete, finalUrl }: Props) {
  const done = persons.filter((p) => p.done).length;
  const pct = persons.length ? Math.round((done / persons.length) * 100) : 0;
  const [downloaded, setDownloaded] = useState(false);

  return (
    <div className="status-panel">
      <div className="status-head">
        <strong>서명 현황</strong>
        <span>
          {done} / {persons.length} 완료
        </span>
      </div>
      <div className="progress">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <ul className="person-list">
        {persons.map((p) => (
          <li key={p.name} className={p.done ? "done" : ""}>
            <span className="pname">{p.name}</span>
            <span className="pbadge">{p.done ? "서명 완료" : "미서명"}</span>
          </li>
        ))}
      </ul>
      <a
        className={`btn primary block copy-btn${downloaded ? " copied" : ""}${
          complete || downloaded ? "" : " disabled-look"
        }`}
        href={finalUrl}
        target="_blank"
        rel="noreferrer"
        onClick={() => {
          setDownloaded(true);
          setTimeout(() => setDownloaded(false), 3000);
        }}
      >
        {downloaded ? <CheckIcon /> : <DownloadIcon />}
        {complete
          ? downloaded
            ? "최종 PDF 다운로드됨"
            : "최종 PDF 다운로드"
          : downloaded
            ? "서명본 다운로드됨"
            : "현재까지 서명본 다운로드"}
      </a>
    </div>
  );
}
