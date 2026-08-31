import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import PageView, { type PageViewHandle } from "../components/PageView";
import SignaturePadModal from "../components/SignaturePadModal";
import StepNav from "../components/StepNav";
import StepHeader from "../components/StepHeader";
import {
  CheckIcon,
  ChevronRightIcon,
  PenIcon,
  RedoIcon,
} from "../components/icons";
import ProgressList from "../components/ProgressList";
import { getSignerDoc, submitSignatures } from "../api";
import { personsFromSignerFields } from "../lib/personStatus";
import type { SignatureMap, SignerDocView, SignerField } from "../types";

const TOTAL = 3;

export default function SignerFlow() {
  const { token = "" } = useParams();
  const [doc, setDoc] = useState<SignerDocView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [sigs, setSigs] = useState<SignatureMap>({});
  const [padField, setPadField] = useState<SignerField | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const pageRefs = useRef<Record<number, PageViewHandle | null>>({});

  useEffect(() => {
    getSignerDoc(token)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [token]);

  const persons = doc ? personsFromSignerFields(doc.fields) : [];

  const myFields = useMemo(
    () => (doc ? doc.fields.filter((f) => f.signer_name === name) : []),
    [doc, name],
  );
  const myUnsigned = useMemo(
    () => myFields.filter((f) => !f.signed),
    [myFields],
  );
  const toDraw = myUnsigned.filter((f) => !sigs[f.id]);
  const allDrawn = myUnsigned.length > 0 && toDraw.length === 0;

  // switching the selected person discards any signature drawn but not submitted
  useEffect(() => {
    setSigs({});
  }, [name]);

  // once, when step 3 first appears: bring the signer's box into view
  const scrolledToBox = useRef(false);
  useEffect(() => {
    if (step !== 3) {
      scrolledToBox.current = false;
      return;
    }
    if (scrolledToBox.current || !doc || myUnsigned.length === 0) return;
    scrolledToBox.current = true;
    const first = myUnsigned[0];
    const t = setTimeout(
      () => pageRefs.current[first.page]?.scrollFieldIntoView(first.id),
      250,
    );
    return () => clearTimeout(t);
  }, [step, doc, myUnsigned]);

  function go(next: number) {
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  // open the signature pad with the page reset to the top behind it
  function openPad(f: SignerField) {
    window.scrollTo({ top: 0 });
    setPadField(f);
  }

  // on close, bring that signature box back into view
  function closePad(f: SignerField) {
    setPadField(null);
    setTimeout(() => pageRefs.current[f.page]?.scrollFieldIntoView(f.id), 60);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await submitSignatures(
        token,
        name,
        myUnsigned
          .filter((f) => sigs[f.id])
          .map((f) => ({ field_id: f.id, png_data_url: sigs[f.id] })),
      );
      setDone(true);
      window.scrollTo({ top: 0 });
      // refresh so the done screen shows up-to-date signing status
      getSignerDoc(token)
        .then(setDoc)
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !doc)
    return (
      <div className="signer">
        <div className="error">{error}</div>
      </div>
    );
  if (!doc)
    return (
      <div className="signer">
        <p className="sub">불러오는 중…</p>
      </div>
    );

  if (done) {
    return (
      <div className="signer done-screen">
        <div className="done-hero">
          <div className="done-mark">
            <CheckIcon />
          </div>
          <h1>서명 완료</h1>
          <p>
            <b>{name}</b> 님의 서명이 저장되었습니다.
          </p>
        </div>
        <ProgressList persons={persons} highlightName={name} />
      </div>
    );
  }

  const pageFields = (pageIdx: number) =>
    doc.fields
      .filter((f) => f.page === pageIdx)
      .map((f) => ({
        id: f.id,
        page: f.page,
        rank: f.rank,
        signer_name: f.signer_name,
        bbox_pdf: f.bbox_pdf,
        already_signed: f.signed,
      }));

  return (
    <div className="signer">
      {error && <div className="error">{error}</div>}

      {step === 1 && (
        <>
          <StepHeader
            num={1}
            total={TOTAL}
            title="문서 확인"
            desc="아래 문서를 끝까지 내려 확인하세요."
          />
          <div className="doc-scroll">
            {doc.pages.map((p) => (
              <img
                key={p.index}
                src={p.image_url}
                alt={`페이지 ${p.index + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader
            num={2}
            total={TOTAL}
            title="본인 선택"
            desc="서명할 본인 이름을 선택하세요. 서명을 마친 분은 목록에 없습니다."
          />
          {doc.complete ? (
            <p className="all-done">모든 직원의 서명이 완료되었습니다. 🎉</p>
          ) : doc.remaining_names.length === 0 ? (
            <p className="all-done">서명 대상이 없습니다.</p>
          ) : (
            <div className="name-grid">
              {doc.remaining_names.map((n) => (
                <button
                  key={n}
                  className={`btn name-btn${n === name ? " selected" : ""}`}
                  onClick={() => setName(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <StepHeader
            num={3}
            total={TOTAL}
            title="서명하기"
            desc={
              allDrawn ? (
                <>
                  <b>{name}</b> 님의 서명이 입력되었습니다. 하단의{" "}
                  <b>다시 서명</b> 또는 <b>제출하기</b> 버튼을 눌러 주세요.
                </>
              ) : (
                <>
                  <b>{name}</b> 님의 서명란
                  {myUnsigned.length > 1 ? ` ${myUnsigned.length}곳` : ""}
                  입니다. 하단의 <b>서명하기</b> 버튼 또는{" "}
                  <b>문서에 표시된 서명란</b>을 직접 선택해 서명하세요.
                </>
              )
            }
          />
          {myUnsigned.length === 0 ? (
            <p className="all-done">이미 서명을 마쳤습니다.</p>
          ) : (
            <>
              {doc.pages.map((p) => (
                <PageView
                  key={p.index}
                  ref={(h) => (pageRefs.current[p.index] = h)}
                  page={p}
                  mode="highlight"
                  emphasiseName={name}
                  fields={pageFields(p.index)}
                  signatures={sigs}
                  onOpen={(f) => {
                    const sf = myUnsigned.find((x) => x.id === f.id);
                    if (sf) openPad(sf);
                  }}
                />
              ))}
            </>
          )}
        </>
      )}

      <StepNav
        onBack={step > 1 ? () => go(step - 1) : undefined}
        onNext={
          step === 1
            ? () => go(2)
            : step === 2
              ? name
                ? () => go(3)
                : undefined
              : myUnsigned.length === 0
                ? undefined
                : toDraw.length > 0
                  ? () => openPad(toDraw[0])
                  : submit
        }
        nextLabel={
          step < 3 ? (
            <>
              다음
              <ChevronRightIcon />
            </>
          ) : toDraw.length > 0 ? (
            <>
              <PenIcon />
              {myUnsigned.length > 1
                ? `서명하기 (${myUnsigned.length - toDraw.length + 1})`
                : "서명하기"}
            </>
          ) : (
            <>
              <CheckIcon />
              제출하기
            </>
          )
        }
        nextDisabled={
          step === 2 ? !name : step === 3 ? myUnsigned.length === 0 : false
        }
        onSecondary={
          step === 3 && allDrawn
            ? () => {
                setSigs({}); // 처음부터 다시
                openPad(myUnsigned[0]);
              }
            : undefined
        }
        secondaryLabel={
          <>
            <RedoIcon />
            다시 서명
          </>
        }
        busy={busy}
      />

      {padField && (
        <SignaturePadModal
          fullscreen
          bbox_pdf={padField.bbox_pdf}
          who={`${name} 님 서명`}
          onCancel={() => closePad(padField)}
          onSave={(png) => {
            setSigs((prev) => ({ ...prev, [padField.id]: png }));
            closePad(padField);
          }}
        />
      )}
    </div>
  );
}
