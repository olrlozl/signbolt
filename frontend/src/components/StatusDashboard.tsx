import { useState } from "react";
import type { AuditLogEntry, PersonStatus } from "../types";
import { formatDateTime } from "../lib/format";
import { CheckIcon, ClockIcon, DownloadIcon } from "./icons";

interface Props {
  persons: PersonStatus[];
  complete: boolean;
  finalUrl: string;
  auditLog?: AuditLogEntry[];
}

export default function StatusDashboard({
  persons,
  complete,
  finalUrl,
  auditLog = [],
}: Props) {
  const done = persons.filter((p) => p.done).length;
  const pct = persons.length ? Math.round((done / persons.length) * 100) : 0;
  const [downloaded, setDownloaded] = useState(false);

  // 이름별 가장 마지막 서명 제출 기록 (시각·접속 IP 확인용)
  const lastSignedBy = new Map<string, AuditLogEntry>();
  for (const e of auditLog) {
    if (e.event === "signature_submit") lastSignedBy.set(e.detail, e);
  }

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
        {persons.map((p) => {
          const log = p.done ? lastSignedBy.get(p.name) : undefined;
          return (
            <li key={p.name} className={p.done ? "done" : ""}>
              <span className="pname">{p.name}</span>
              {p.done ? (
                <span className="pbadge">
                  <CheckIcon />
                  서명 완료
                  {log && (
                    <>
                      <i className="pbadge-dot" />
                      <ClockIcon />
                      {formatDateTime(log.created_at)}
                      <span className="paudit-ip">
                        {log.ip || "IP 확인 불가"}
                      </span>
                    </>
                  )}
                </span>
              ) : (
                <span className="pbadge">미서명</span>
              )}
            </li>
          );
        })}
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
            ? "최종 PDF 저장됨"
            : "최종 PDF 저장"
          : downloaded
            ? "현재까지 서명본 저장됨"
            : "현재까지 서명본 저장"}
      </a>
    </div>
  );
}
