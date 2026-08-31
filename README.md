# SignBolt, 사인볼트

> 서명란 자동 인식부터 온라인 서명까지, 사내 서류 수기 서명 프로세스를 자동화하는 전자서명 서비스

<details>
<summary><strong>서비스 URL</strong>: <a href="https://signbolt.onrender.com">signbolt.onrender.com</a></summary>

- 무료 호스팅(Render)으로 배포한 체험용 서버입니다.
- 15분 이상 아무도 접속하지 않으면 서버가 잠들며, 이때 그동안 업로드한 문서·서명 기록이 초기화됩니다.
- 잠든 뒤 다시 접속하면 깨어나는 데 약 1분이 걸립니다.

</details>

---

## 시연 영상

<table>
  <tr>
    <td align="center" width="63%">
      <b>① 로그인 · 서류등록 · 서명란 자동인식 · 게시</b><br><br>
       <video src="https://github.com/user-attachments/assets/15cbabf8-1a27-4e91-9280-fb028cb36a34" controls width="100%"></video>
    </td>
    <td align="center" valign="top" width="37%" rowspan="2">
      <b>③ QR 스캔 · 모바일 서명</b><br><br>
      <video src="https://github.com/user-attachments/assets/e67f6091-43c0-4820-aadc-3ea7b5b11260" controls width="100%"></video>
    </td>
  </tr>
  <tr>
    <td align="center">
      <b>② 서명 현황 실시간 반영 · 최종 PDF 저장  </b><br><br>
      <video src="https://github.com/user-attachments/assets/d85fc6ae-a2c9-42f5-9d63-c6ec379d679a" controls width="100%"></video>
  </tr>
</table>

---

## 프로젝트 배경

- 다수 서명이 필요한 사내 서류 처리 시, 담당자가 직접 서명자를 찾아다니고 수합 후 스캔까지 해야 하는 번거로움 존재
- 기존 사내 전자서명 프로그램의 경우, 문서 안의 서명란을 하나씩 크기 맞춰 생성하고 칸마다 대상자를 연결하고 수신자를 지정하는 과정을 매 서류마다 수작업으로 반복해야해 시간 소요 및 불편 발생

---

## 핵심 기능

- 서명란 자동 인식 및 서명자 자동 매칭 (PDF 벡터 데이터 기반)
- 인식 결과 확인 및 수동 보정 (위치 이동, 크기 조정, 추가·삭제)
- QR 코드·링크 기반 서명 요청 공유 (앱 설치·로그인·계정 불필요)
- 모바일·PC 겸용 온라인 서명 (터치·마우스 입력 지원)
- 서명 현황 실시간 대시보드 (4초 주기 갱신, 인원별 완료 여부·진행률 표시)
- 전원 서명 완료 시 최종 합성 PDF 자동 생성

---

## 사용자 플로우

### 관리자

1. 로그인
2. 문서 목록 확인
3. 신규 문서 등록 (서명부 PDF 업로드)
4. 서명란 자동 인식 결과 확인·수정
5. 게시 및 QR·링크 생성
6. 서명 요청 공유 (안내 메시지·QR 복사 → 사내 메신저·이메일 전달)
7. 서명 현황 실시간 추적 (문서 미리보기에 서명 반영)
8. 전원 완료 시 최종 PDF 다운로드

### 서명자

1. QR 스캔 또는 링크 접속
2. 문서 전체 내용 확인
3. 미서명자 명단에서 본인 이름 선택
4. 서명란 확인 후 온라인 서명 입력
5. 제출 완료

---

## 서명란 자동 인식

대상 문서(엑셀·한글 내보내기 PDF)가 표·텍스트를 벡터 데이터로 보유한다는 특성 활용해 직접 파싱

**방식 1. 표 안의 서명란 인식**

- 표 격자 인식 후 "성명" 열과 인접한 "서명" 열 자동 매칭
- "직위·성명·서명" 반복 블록 구조 대응
- 성명 기재된 행만 서명 대상으로 판별, 공란 행은 제외

**방식 2. (인) 표기 인식**

- 표 없는 문서 대응 (예: "홍길동 (인)" 형태)
- "(인)" 계열 패턴 정규식 탐지 후 인접 한글 이름 매칭

---

## 기술 스택

| 영역   | 사용                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| 백엔드 | Python 3.11, **FastAPI**, **PyMuPDF**(PDF 파싱·렌더·서명 합성), Pillow, **SQLite**(stdlib, WAL), **segno**(QR), uvicorn |
| 프론트 | **React 18** + **Vite 6** + TypeScript, **react-router-dom v7**, Canvas 2D(서명패드)                                    |
| 배포   | 단일 Docker 이미지 (FastAPI가 빌드된 프론트까지 서빙), Render                                                           |
| 테스트 | pytest, Playwright(브라우저 E2E)                                                                                        |

---

## 프로젝트 구조

```
backend/app/
  detector.py    서명란 자동 인식 (표 + "(인)")
  renderer.py    PDF 페이지 → PNG
  stamper.py     서명 PNG를 PDF 좌표에 합성
  db.py          SQLite (documents / fields / signatures)
  workflow.py    person별 서명 상태 계산, 최종 PDF 재생성
  qr.py          서명 링크 → QR (segno)
  store.py       파일 경로·업로드 저장소
  main.py        담당자 / 서명자 API + 빌드된 프론트 서빙
frontend/src/
  pages/         AdminLogin · AdminDocList · AdminUpload · AdminEditor · SignerFlow
  components/    PageView · SignatureBox · NameSelect · SignaturePadModal
                 QrPanel · StatusDashboard · AdminSteps · StepNav · Toast …
  lib/           adminAuth · format · flash · personStatus
Dockerfile       프론트 빌드 → 백엔드 이미지에 번들
render.yaml      Render Blueprint (무료 티어)
```

---

## 로컬 실행

### 백엔드

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
SIGNBOLT_ADMIN_USER=admin SIGNBOLT_ADMIN_PASSWORD=admin1234 \
  .venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

미설정 시 기본값 `admin` / `admin1234`.

### 프론트엔드

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173  (/api 는 :8000 으로 프록시)
```

---

## 배포 (Render, 단일 Docker 서비스)

```
Dockerfile:  node 이미지에서 npm run build → python 이미지에 dist 번들
             → uvicorn 하나가 API(/api/*)와 프론트(정적 파일)를 함께 서빙
```

1. GitHub 리포지토리를 Render **Blueprint** 로 연결 (`render.yaml` 자동 인식)
2. 대시보드에서 `SIGNBOLT_ADMIN_USER` / `SIGNBOLT_ADMIN_PASSWORD` 입력
3. QR·링크 도메인은 Render가 주는 `RENDER_EXTERNAL_URL` 을 자동으로 사용 (설정 불필요)

무료 티어는 디스크가 임시라 재배포·재시작 시 업로드 PDF·서명·DB가 초기화된다(테스트용).
실사용은 영구 디스크(유료) 또는 볼륨 지원 호스트 필요.

---

## 테스트

```bash
cd backend
.venv/bin/python -m tests.make_sample     # 합성 샘플 생성 (실제 파일 없을 때)
.venv/bin/python -m pytest -q
```

| 파일                    | 검증                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `test_detector.py`      | 표 인식 정확도                                             |
| `test_seal_detector.py` | "(인)" 표기 인식·이름 매칭·위치                            |
| `test_workflow.py`      | 업로드 → 게시 → 다중 서명자 제출(동시성) → 현황 → 최종 PDF |

---

## API 요약

### 관리자 (`X-Admin-User` / `X-Admin-Password` 헤더)

| Method | Path                        | 설명                   |
| ------ | --------------------------- | ---------------------- |
| POST   | `/api/admin/login`          | 아이디·비밀번호 검증   |
| GET    | `/api/admin/documents`      | 전체 문서 요약 목록    |
| POST   | `/api/documents`            | PDF 업로드 → 감지 실행 |
| DELETE | `/api/admin/documents/{id}` | 문서 삭제              |

### 담당자 (`?token=<admin_token>`)

| Method | Path                                            | 설명                                                              |
| ------ | ----------------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/api/documents/{id}`                           | 편집기 뷰 (pages·fields·status·sign_url·persons·signed_field_ids) |
| PUT    | `/api/documents/{id}/fields`                    | 서명란 전체 교체 (draft 상태만)                                   |
| POST   | `/api/documents/{id}/publish`                   | 게시 → `{sign_url, qr_svg}`                                       |
| GET    | `/api/documents/{id}/status`                    | `{status, persons, complete, signed_field_ids}`                   |
| GET    | `/api/documents/{id}/qr.png`                    | 서명 링크 QR PNG                                                  |
| GET    | `/api/documents/{id}/signatures/{field_id}.png` | 수집된 서명 이미지 (미리보기용)                                   |
| GET    | `/api/documents/{id}/final.pdf`                 | 현재까지/최종 서명본                                              |

### 서명자 (`sign_token`)

| Method | Path                                   | 설명                                                   |
| ------ | -------------------------------------- | ------------------------------------------------------ |
| GET    | `/api/sign/{sign_token}`               | 문서·서명란·`remaining_names`                          |
| GET    | `/api/sign/{sign_token}/pages/{n}.png` | 페이지 이미지                                          |
| POST   | `/api/sign/{sign_token}/submit`        | `{signer_name, signatures:[{field_id, png_data_url}]}` |

---

## 동시성 / 정합성

- SQLite WAL + `BEGIN IMMEDIATE` 로 서명 제출을 직렬화 (읽기는 비차단)
- `signatures.field_id` PK 로 이중 서명 원천 차단, 경쟁 시 이미 처리된 항목은 조용히 skip
- 최종 PDF는 항상 **원본 + 서명 전체로 재생성**(in-place 변형 없음, 멱등)

---

## 한계 / 향후

- **스캔 PDF(이미지 전용) 미지원** — 표·글자가 그림이라 파싱 대상이 없음. OpenCV 괘선 검출 + 한국어 OCR 폴백 필요
- 게시 후 서명란 레이아웃 수정 불가
- 서명자 인증은 이름 선택만(신뢰 기반) — 사내용 전제, 동명이인 없다는 가정
- 사내 메신저(예: Flow) 연동 없음 — QR·링크만 생성, 전송은 담당자가 직접
