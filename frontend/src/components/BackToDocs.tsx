import { Link } from "react-router-dom";
import { ChevronLeftIcon } from "./icons";

/** Small bordered "back to the document list" button, shown in the corner of
 *  the step header / document header. */
export default function BackToDocs() {
  return (
    <Link
      className="docs-back"
      to="/admin/docs"
      title="작업 내용은 초안으로 자동 저장됩니다"
    >
      <ChevronLeftIcon />
      문서 목록
    </Link>
  );
}
