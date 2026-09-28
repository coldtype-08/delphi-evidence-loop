# DELPHi — 근거 관문이 있는 약물 신호 검증 에이전트

팀 **AI Pioneer** · Korea Agentic AI Hackathon 온라인 예선 제출 (2026-09-28) · NVIDIA Nemotron 3 Ultra (NIM)

| | |
|---|---|
| 콘솔 (배포) | https://delphi-console-production-8ae8.up.railway.app |
| API · 소개 페이지 (배포) | https://delphi-web-production-52d6.up.railway.app |
| 제출 문서 | `docs/[NVIDIA 해커톤_AI Pioneer_DELPHi].docx` |
| 실행 기록 | `docs/demo_run.txt` · `docs/board_run.txt` |


의료진 면담 기록을 환자군 × 신호 유형으로 세고, 문턱을 넘은 조합을 공개 근거(PubMed · ClinicalTrials.gov · openFDA · CMS Part D)로 검증하고,
사람이 서명한 뒤 임원 에이전트 7인이 심의하며, 사람이 결정한 후속 질문만 다음 면담 체크리스트에 넣는 시스템. NVIDIA Nemotron 3 Ultra(NIM)로 동작한다.
모델은 발언을 고르고 인용만 하며, 계수·인용 검증·입장 집계는 코드가 한다.

> Evidence-gated hypothesis loop on NVIDIA Nemotron: field notes → structured claims with verbatim evidence
> pointers → threshold-generated hypotheses → cross-check against PubMed / ClinicalTrials.gov / openFDA / CMS Part D
> → a named human signs → a seven-executive AI board deliberates (opening → discussion → final positions, tallied in code)
> → a named human decides → questions land in the next field checklist.

## 처리 순서

```
면담 기록(한국어)  ──sense──▶  발언 카드(원문 위치 필수)  ──코드 집계──▶  임계값 넘은 (환자군 × 신호) → 가설 DRAFT
                                                                                   │
  다음 면담 체크리스트 ◀──approve(사람)── AI Board(간사+임원 7 · 약 20턴) ◀──board── 서명(사람) ◀──review── screen ◀┘
                                          입장 집계·인용 검증 = 코드                                4 공개 근거원 · 인용 검증 · 코드 집계
```

## 지키는 규칙 (프롬프트가 아니라 코드가 강제)

| # | 규칙 | 어디서 |
|---|---|---|
| 1 | **숫자는 모델이 세지 않는다.** 언급 수·의료진 수·지지/반대 건수·시험 수·청구 건수는 전부 코드 | `sense.tally`, `screen.run`, `sources/` |
| 2 | **모든 인용에는 원문 위치가 있다.** 모델이 준 인용문을 원문에서 못 찾으면 «버림»으로 표시하고 세지 않는다 | `quotes.locate` |
| 3 | **사람이 승인하는 것은 가설과 실행이지 발언 카드가 아니다.** 관문은 둘 — 근거 검토 서명, 심의 결정 | `board.sign_review`, `board.approve` |
| 4 | **허가 범위 밖(DEVELOPMENT) 가설은 전문조직 검토로만 간다.** 상업 액션과 연결하지 않는다 | `board.deliberate` |
| 5 | **유해사례 후보는 별도 경로.** 분석 집계에 들어가지 않는다 | `sense.run` → `safety_queue` |
| 6 | **근거가 없으면 순위를 매기지 않는다.** `NO_EXTERNAL_EVIDENCE`는 사람이 읽을 플래그다 | `screen.run` |
| 7 | 화면의 모든 줄은 5단계 중 하나다: **[사실] [패턴] [해석] [제안] [실행]** | `cli.py` |
| 8 | **심의의 권고는 코드가 정한다.** 임원 7인의 최종 입장을 확신 가중(주무 임원 ×1.5)으로 집계해 권고로 옮기고, 간사는 회의록만 쓴다. 발언의 인용은 근거 표에 있는 ID만 인정하며, 허가 밖 가설에 붙은 상업 액션은 차단해 기록에 남긴다 | `board.py` |

## 심의 — AI Board

`board.deliberate`는 원본 설계의 임원 회의를 그대로 따른다.

| 단계 | 누가 | 무엇 |
|---|---|---|
| CONVENE | 간사 | 가설 유형 분류, 주무 임원과 발언 순서 지정, 개회 발언(상정 사실만) |
| OPENING | 임원 7인 (병렬) | 각자의 렌즈로 초기 입장(SUPPORT / HOLD / OPPOSE), 확신 1–5, 근거 인용, 질문·액션 제안 |
| FACILITATE + 답변 | 간사 → 지명된 2~3인 | 서로 다르게 보는 참석자에게 질문. 최대 2라운드, 간사가 진행 여부 결정 |
| FINAL | 임원 7인 (병렬) | 최종 입장. 입장 변경 여부는 모두발언과 비교해 코드가 계산 |
| TALLY | 코드 | 인원수와 확신 가중치(주무 ×1.5)를 세고 가중치가 큰 입장을 권고로 옮긴다. 동률은 HOLD |
| CLOSE | 간사 (사고 모드) | 회의록: 요약 · 근거 요약 · 권고 사유 · 중단 기준 · 위험 · 다음 면담 질문 3개 이내 |

임원: CMO · RA 총괄 · PV 총괄 · R&D 총괄 · CFO · CCO · CEO. 렌즈는 `board.PERSONAS`, 발화 규칙(결론 첫 문장 · 완결 존댓말 · 직함 호칭 · 코드 대신 한국어)은 `prompts/board_persona.md`. 한 번의 심의는 약 20회 호출이며 병렬로 약 5분이 걸린다.

## NVIDIA 스택

- **추론**: `nvidia/nemotron-3-ultra-550b-a55b` — NIM OpenAI 호환 API, 한국어 공식 지원. 호출은 `loop/llm.py` 한 곳. 구조화 출력(JSON schema)만 받고, 같은 입력은 캐시에서 재생한다.
- **스킬**: `skills/evidence-loop/SKILL.md` — Agent Skills 규격. Claude Code·OpenClaw 등 호환 에이전트에 설치하면 이 루프를 도구로 쓴다.
- **샌드박스**: `sandbox/EGRESS.md` — OpenShell/NemoClaw의 deny-by-default 정책에 넣을 허용 호스트 5개. 이 루프의 외부 통신은 그게 전부다.

## 콘솔 (Next.js) — `console/`

원본 DELPHi 콘솔을 그대로 옮겼다. 홈 · 신호의 여정 · 신호와 가설 · 다중 에이전트 검증 · AI Board 회의실 · 안전 · 실행 기록.
백엔드가 아직 제공하지 않는 화면(계약 · 배치 판독 · 시뮬레이터 · 시장 · 수집 지도)은 메뉴에서만 숨겼다 (`console/app/nav.tsx`의 `HIDDEN`).
콘솔이 부르는 API는 `loop/compat.py`(회의실 · 결정 · 액션), `loop/compat_hyp.py`(가설 카드 · Screen · 안전 · 실행 기록), `loop/compat_home.py`(홈 · 여정 집계)가
원본 API 계약(`docs/04_API_SPEC.md`의 경로와 응답 형태) 그대로 응답한다.

```bash
cd console && npm install
NEXT_PUBLIC_API_BASE_URL=http://localhost:8030/api npm run dev -- --port 3010   # 백엔드(8030)가 떠 있어야 한다
```

배포: Railway 서비스 `delphi-console`(Nixpacks, `npm run build` / `node server.js`), 변수 `NEXT_PUBLIC_API_BASE_URL=https://<api>/api`.
`server.js`는 Next 응답을 버퍼링해 `Content-Length`로 내보낸다 — Railway 엣지가 chunked 응답의 종료 청크를 떨어뜨려 Chrome이 홈을 거부하던 문제(원본 팀 09/02 미해결)를 이렇게 돌아갔다. 전 라우트는 요청 시 렌더(`app/layout.tsx`의 `force-dynamic`)이고 루트 `loading.tsx`는 비활성.

## 실행

```bash
uv sync
cp .env.example .env            # build.nvidia.com 에서 발급한 nvapi- 키 (무료)

# 웹 콘솔 — 리포트 위에 실행 버튼. 단계 순서·관문은 코드가 지킨다
uv run uvicorn loop.web:app --port 8030      # http://localhost:8030

# 같은 것을 CLI로
uv run python -m loop.cli sense                     # 면담 282건 → 발언 카드 → 가설
uv run python -m loop.cli screen HYP-001            # 공개 근거 교차검증
uv run python -m loop.cli review HYP-001 --by 이름   # 관문 ①
uv run python -m loop.cli board HYP-001             # 심의 (Nemotron 사고 모드)
uv run python -m loop.cli approve HYP-001 --by 이름  # 관문 ② → data/field_checklist.json
bash scripts/demo.sh                                # 한 바퀴 전체 · bash scripts/reset.sh 로 결과만 초기화
uv run python scripts/report.py                     # docs/report.html 정적 리포트
```

공개 API 응답(`data/cache/`)과 모델 응답(`data/llm_cache/`)이 저장소에 들어 있어 **키 없이도 같은 입력은 즉시 재생**된다. 새 입력(새 서명자 이름으로 심의 등)만 실제 호출이다.

배포: `Dockerfile` 하나 (`uv sync` → `uvicorn loop.web:app`). 환경변수 `NVIDIA_API_KEY`만 있으면 된다. 상태 파일은 컨테이너 안에 있으므로 재배포하면 결과가 초기화된다 — 데모 용도로는 그게 맞다.

## 데모 각본 — 메트포르민 (2026-09-28 실측)

**모든 면담 기록은 합성이다** (`data/field_notes.json`, 면담 282건 · 가상 의료진 264인, 생성기 `scripts/generate_notes.py`). 약은 특허가 만료된 지 오래고 특정 회사 소유가 아니며 공개 근거가 가장 두꺼워서 골랐다(PubMed 제목 18,054편 · CT.gov 3,120건 · FAERS 440,270건 · Part D 연 3,400만 건 청구). 문장은 공개된 사실(MA.32 무효 결과, eGFR 30 미만 금기, PCOS 배란 유도 병용, 소아 10세 이상 허가 등)에 맞춰 썼다.

**Sense**: 면담 282건 → 발언 카드 609장, **원문 검증 통과 607**, 원문에 없어 버림 2, 유해사례 후보 19건은 safety 큐로. 문턱(5회/3인)을 넘은 묶음 15개가 가설이 됐다. 언급 수와 의료진 수는 코드가 센다.

| 가설 | 현장 | 외부 근거 (지지/반대/중립) | 허가 |
|---|---|---|---|
| HYP-001 PCOS 여성 × 써봤다(OFF_LABEL_USE) | 100회/60인 | 16 / 0 / 14 | 허가 밖 |
| HYP-002 당뇨 전단계 × 쓰고 싶은데 막혔다(OFF_LABEL_DEMAND) | 92회/61인 | 12 / 3 / 14 | 허가 밖 |
| HYP-003 유방암 환자 × 쓰고 싶은데 막혔다(OFF_LABEL_DEMAND) | 64회/39인 | 5 / 0 / 23 | 허가 밖 |
| HYP-004 노인 65+ · 신기능 저하 × 용량·제형(DOSING) | 55회/37인 | 1 / 0 / 6 | 허가 밖 |
| HYP-005 유방암 환자 × 다른 쓰임(REPURPOSING) | 41회/32인 | 조사 대기 | 허가 밖 |
| HYP-006 임신부 · 임신성 당뇨 × 쓰고 싶은데 막혔다(OFF_LABEL_DEMAND) | 40회/26인 | 조사 대기 | 허가 밖 |
| HYP-007 청소년 10-17세 × 안전성·내약성(SAFETY_TOLERABILITY) | 37회/23인 | 조사 대기 | 허가 안 |
| HYP-008 노인 65+ · 신기능 저하 × 안전성·내약성(SAFETY_TOLERABILITY) | 33회/24인 | 조사 대기 | 허가 안 |
| HYP-009 당뇨 전단계 × 자료 부족(UNMET_NEED) | 27회/21인 | 조사 대기 | 허가 밖 |
| HYP-010 유방암 환자 × 자료 부족(UNMET_NEED) | 25회/20인 | 조사 대기 | 허가 밖 |
| HYP-011 소아 10세 미만 × 쓰고 싶은데 막혔다(OFF_LABEL_DEMAND) | 20회/17인 | 조사 대기 | 허가 밖 |
| HYP-012 PCOS 여성 × 용량·제형(DOSING) | 18회/16인 | 조사 대기 | 허가 밖 |
| HYP-013 당뇨 전단계 × 다른 쓰임(REPURPOSING) | 14회/12인 | 조사 대기 | 허가 밖 |
| HYP-014 유방암 환자 × 써봤다(OFF_LABEL_USE) | 11회/11인 | 조사 대기 | 허가 밖 |
| HYP-015 당뇨 전단계 × 써봤다(OFF_LABEL_USE) | 5회/5인 | 조사 대기 | 허가 밖 |

근거 조사는 가설 ID 순서로 돌고 있으며, 조사가 끝난 가설은 콘솔에서 서명 → 심의 → 판정까지 실행할 수 있다. 심의 기록과 판정은 배포 화면이 정본이다.

«버림»은 모델이 지어낸 인용이 아니라 **문장 중간을 건너뛰어 이어 붙인 것**들이다 — 그래도 세지 않는다. 공백·기호 차이(라벨 원문의 `( 5.1 )`, `Vitamin B 12`)와 «…»로 나뉜 조각은 코드가 원문에서 순서대로 찾아 살린다.

근거 읽기는 **RCT·3상·메타분석을 먼저** 읽는다(`screen.gather`). 관련도순 상위만 읽으면 가장 큰 시험이 밀린다 — MA.32가 처음엔 안 잡혔던 이유.

## 안 만든 것 · 한계
- 현장 수집 모바일 앱·음성 전사는 이 저장소에 없다 (`data/field_notes.json`이 그 출력이라고 가정).
- 권역은 가상 의료진마다 하나씩 결정론적으로 부여한 합성 값이다(`scripts/assign_regions.py` → `data/hcp_regions.json`, 미국 4개 인구조사 권역). 주(州) 단위 수치는 없고 지도는 권역 값을 입힌다.
- OpenShell 안에서 실행해 보지 않았다 (개발 환경이 macOS). 정책은 `sandbox/EGRESS.md`.
- `data/state.json` 하나가 정본이라 **명령은 한 번에 하나씩** 돌린다. 동시에 돌리면 나중 저장이 앞 저장을 덮는다.
- 모델 호출 1회 ≈ 20~60초(Nemotron 3 Ultra, 무료 엔드포인트). 무료 엔드포인트는 지속 호출 시 429로 제한해 면담 282건 추출에 약 2시간이 걸렸다(캐시 재생은 1초). 같은 입력은 캐시에서 즉시 재생된다.
