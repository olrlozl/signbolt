import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "./icons";

interface Props {
  value: string;
  options: string[];
  onPick: (name: string) => void; // "" clears the assignment
  onCustom: () => void; // open the "type a name" modal
}

/** Styled replacement for a native <select> — the open list is a portaled menu
 *  so it escapes the page's `overflow: hidden` and looks consistent. */
export default function NameSelect({ value, options, onPick, onCustom }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxH: number;
  }>();

  const opts = value && !options.includes(value) ? [value, ...options] : options;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 150), 240);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
    left = Math.max(8, left);

    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const openUp = below < 240 && above > below;
    setPos({
      left,
      width,
      maxH: Math.min(340, openUp ? above : below),
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = (e: Event) => {
      // scrolling inside the menu's own list must not dismiss it
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`name-select${value ? "" : " empty"}${open ? " open" : ""}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span className="name-select-value">{value || "이름 선택"}</span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className="name-menu"
            style={{
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              minWidth: pos.width,
              maxHeight: pos.maxH,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {value && (
              <button
                type="button"
                className="name-menu-item clear"
                onClick={() => pick(() => onPick(""))}
              >
                이름 지우기
              </button>
            )}
            <div className="name-menu-scroll">
              {opts.length === 0 ? (
                <div className="name-menu-empty">
                  다른 서명란에서 지정한 이름이 여기 표시됩니다
                </div>
              ) : (
                opts.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`name-menu-item${n === value ? " on" : ""}`}
                    onClick={() => pick(() => onPick(n))}
                  >
                    <span>{n}</span>
                    {n === value && <CheckIcon />}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              className="name-menu-item add"
              onClick={() => pick(onCustom)}
            >
              + 직접 입력…
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
