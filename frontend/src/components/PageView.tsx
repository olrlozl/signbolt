import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Bbox, PageInfo } from "../types";
import SignatureBox, { type BoxField, type BoxMode } from "./SignatureBox";

export interface PageViewField extends BoxField {
  page: number;
}

interface Props {
  page: PageInfo;
  mode: BoxMode;
  fields: PageViewField[];
  signatures?: Record<string, string>;
  nameOptions?: string[];
  emphasiseName?: string;
  flashId?: string | null;
  onOpen?: (field: PageViewField) => void;
  onRemove?: (id: string) => void;
  onChange?: (id: string, bbox: Bbox) => void;
  onAssign?: (id: string, name: string) => void;
  onCustomName?: (id: string) => void;
}

export interface PageViewHandle {
  scaleFor: () => number;
  scrollFieldIntoView: (id: string) => void;
}

const PageView = forwardRef<PageViewHandle, Props>(function PageView(
  {
    page,
    mode,
    fields,
    signatures = {},
    nameOptions = [],
    emphasiseName,
    flashId,
    onOpen,
    onRemove,
    onChange,
    onAssign,
    onCustomName,
  },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [renderWidth, setRenderWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRenderWidth(el.clientWidth));
    ro.observe(el);
    setRenderWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scale = renderWidth > 0 ? renderWidth / page.width : 0;

  useImperativeHandle(ref, () => ({
    scaleFor: () => scale,
    scrollFieldIntoView: (id: string) => {
      const f = fields.find((x) => x.id === id);
      if (!f || !wrapRef.current) return;
      const top =
        wrapRef.current.offsetTop + f.bbox_pdf[1] * scale - window.innerHeight / 3;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    },
  }));

  return (
    <div className="page-wrap" ref={wrapRef}>
      <img src={page.image_url} alt={`페이지 ${page.index + 1}`} />
      {scale > 0 &&
        fields.map((f) => (
          <SignatureBox
            key={f.id}
            field={f}
            mode={mode}
            scale={scale}
            pageWidthPx={page.width * scale}
            pageHeightPx={page.height * scale}
            signed={signatures[f.id]}
            nameOptions={nameOptions}
            emphasise={!!emphasiseName && f.signer_name === emphasiseName}
            flash={f.id === flashId}
            onOpen={() => onOpen?.(f)}
            onRemove={() => onRemove?.(f.id)}
            onChange={(b) => onChange?.(f.id, b)}
            onAssign={(n) => onAssign?.(f.id, n)}
            onCustomName={() => onCustomName?.(f.id)}
          />
        ))}
    </div>
  );
});

export default PageView;
