# SignBolt

표 형태의 **서명부 PDF**를 올리면 직원별 빈 서명란을 자동으로 찾아 매칭하고,
**QR 링크 하나**로 전 직원에게 서명을 받아 최종 PDF를 만드는 도구.

- **담당자**: PDF 업로드 → 서명란 자동 인식·이름 매칭 → 박스 보정 → 게시(QR 생성)
  → 직원별 서명 현황 확인 → 최종 PDF 다운로드
- **직원**: 폰으로 QR 스캔 → 앱 설치 없이 서명 페이지 → 문서 열람 → 미서명 명단에서
  본인 선택 → 전체화면 패드에 터치 서명 → 제출

대상 문서는 한글/엑셀에서 만든 **디지털 PDF**(표 괘선·글자가 실제 벡터 데이터)를 가정합니다.
OCR 없이 PyMuPDF `page.find_tables` 로 셀 좌표를 얻습니다. 스캔본은 미지원.

## 구조

```
backend/   FastAPI + PyMuPDF + SQLite
  app/detector.py   표 → 서명란 감지 + 이름 매칭
  app/renderer.py   페이지 → PNG
  app/stamper.py    서명 PNG를 PDF 좌표에 합성
  app/db.py         SQLite (documents / fields / signatures)
  app/workflow.py   person 상태 계산, 최종 PDF 재생성
  app/qr.py         서명 링크 → QR SVG (segno)
  app/main.py       담당자 / 서명자 API
frontend/  React + Vite + react-router
  src/pages/AdminUpload · AdminEditor · SignerHome · SignerSign
  src/components/PageView · SignatureBox · SignaturePadModal · QrPanel · StatusDashboard
```

## 실행

### 백엔드

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

### 프론트엔드

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (/api 는 :8000 으로 프록시)
```

브라우저에서 `http://localhost:5173` → PDF 업로드 → 이름 확인/보정 → **게시하고 QR 만들기**.

### 폰에서 서명 테스트 (같은 Wi-Fi)

QR/링크의 도메인은 환경변수 `SIGNBOLT_PUBLIC_ORIGIN` 으로 정합니다. 폰이 접속하려면
`localhost` 대신 **이 컴퓨터의 LAN IP** 를 써야 합니다:

```bash
# 맥 IP 확인:  ipconfig getifaddr en0   (예: 192.168.0.12)
SIGNBOLT_PUBLIC_ORIGIN=http://192.168.0.12:5173 \
  .venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

프론트는 `vite.config.ts` 의 `server.host: true` 로 이미 LAN 에 노출됩니다.
폰에서 `http://192.168.0.12:5173` 접속 또는 담당자 화면의 QR 스캔.

## 테스트

```bash
cd backend
.venv/bin/python -m tests.make_sample     # 실제 파일 없을 때 합성 샘플 생성
.venv/bin/python -m pytest -q
```

- `test_detector.py` — 표 인식 정확도
- `test_workflow.py` — 업로드 → 게시 → 다중 서명자 제출(동시성 포함) → 현황 → 최종 PDF

실제 서명부 PDF 는 `backend/tests/fixtures/sample_signbook.pdf` 로 저장하면 그 파일로 검증합니다.

## API

### 담당자 (`?token=<admin_token>` 필요)

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/documents` | PDF 업로드 → `{id, admin_token, pages, fields}` |
| GET  | `/api/documents/{id}` | 편집기 뷰 (pages·fields·status·sign_url·qr_svg·persons) |
| PUT  | `/api/documents/{id}/fields` | 서명란 전체 교체 (draft 상태만) |
| POST | `/api/documents/{id}/publish` | 게시 → `{sign_url, qr_svg}` |
| GET  | `/api/documents/{id}/qr.png` | 서명 링크 QR 코드 PNG (저장·복사용) |
| GET  | `/api/documents/{id}/status` | `{status, persons, complete}` |
| GET  | `/api/documents/{id}/final.pdf` | 현재까지/최종 서명본 |

### 서명자 (`sign_token`)

| Method | Path | 설명 |
|---|---|---|
| GET  | `/api/sign/{sign_token}` | 문서·서명란·`remaining_names` |
| GET  | `/api/sign/{sign_token}/pages/{n}.png` | 페이지 이미지 |
| POST | `/api/sign/{sign_token}/submit` | `{signer_name, signatures:[{field_id, png_data_url}]}` |

## 감지 로직 (`detector.py`)

1. `page.find_tables(strategy="lines")` 로 모든 표·셀 bbox 추출
2. "성명"+"서명" 글자가 함께 있는 행을 헤더로 탐지
3. `직위 | 성명 | 서명` 블록이 좌·우로 반복 → 각 "서명" 열을 왼쪽 가장 가까운 "성명" 열과 짝
4. 헤더 아래 행에서 성명 셀에 이름이 있으면 → 짝 서명 셀을 그 사람의 서명란으로 채택
5. 이미 잉크가 있는 셀은 `already_signed`

고정 좌표를 쓰지 않으므로 행 수·블록 수·열 너비가 달라도 대응됩니다.

## 동시성 / 정합성

- SQLite WAL + `BEGIN IMMEDIATE` 로 서명 제출 직렬화
- `signatures.field_id` PK 로 이중 서명 원천 차단
- 최종 PDF 는 항상 원본 + 서명 전체로 **재생성**(멱등)

## 한계 / 향후

- 스캔 PDF(이미지 전용) 미지원 — OpenCV 괘선 검출 + 한국어 OCR 폴백 필요
- 게시 후 서명란 레이아웃 수정 불가
- 서명자 인증은 이름 선택만(신뢰 기반) — 사내용 전제
- "서명란 추가"는 1페이지에만 생성
- 사내 Flow 쪽지 시스템 연동 없음 — QR/링크만 생성, 전송은 담당자가 직접
