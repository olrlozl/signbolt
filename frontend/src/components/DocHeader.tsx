import type { ReactNode } from "react";
import { FileIcon } from "./icons";

interface Props {
  filename: string;
  meta?: string;
  action?: ReactNode;
}

export default function DocHeader({ filename, meta, action }: Props) {
  return (
    <div className="doc-header">
      <span className="doc-header-icon">
        <FileIcon />
      </span>
      <div className="doc-header-body">
        <h1 className="doc-header-name">{filename}</h1>
        {meta && <p className="doc-header-meta">{meta}</p>}
      </div>
      {action && <div className="doc-header-action">{action}</div>}
    </div>
  );
}
