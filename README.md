# nim-evidence-loop

**현장 면담에서 나온 약물 신호를, 공개 근거로 교차검증하고, 사람이 서명한 뒤에만 다음 행동으로 잇는 폐쇄 루프.**
NVIDIA Nemotron 3 Ultra(NIM) 위에서 돕니다. 모델은 고르고 인용하고, 숫자는 코드가 세고, 관문은 사람이 지킵니다.

> Evidence-gated hypothesis loop on NVIDIA Nemotron: field notes → structured claims with verbatim evidence
> pointers → threshold-generated hypotheses → cross-check against PubMed / ClinicalTrials.gov / openFDA / CMS Part D
> → a named human signs → board recommendation → a named human approves → questions land in the next field checklist.

## 루프 한 바퀴

```
면담 기록(한국어)  ──sense──▶  발언 카드(원문 위치 필수)  ──코드 집계──▶  임계값 넘은 (환자군 × 신호) → 가설 DRAFT
                                                                                   │
        다음 면담 체크리스트  ◀──approve(사람)──  심의 권고  ◀──board──  서명(사람)  ◀──review──  screen ◀┘
                                                                                   4 공개 근거원 · 인용 검증 · 코드 집계
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

## NVIDIA 스택

- **추론**: `nvidia/nemotron-3-ultra-550b-a55b` — NIM OpenAI 호환 API, 한국어 공식 지원. 호출은 `loop/llm.py` 한 곳. 구조화 출력(JSON schema)만 받고, 같은 입력은 캐시에서 재생한다.
- **스킬**: `skills/evidence-loop/SKILL.md` — Agent Skills 규격. Claude Code·OpenClaw 등 호환 에이전트에 설치하면 이 루프를 도구로 쓴다.
- **샌드박스**: `sandbox/EGRESS.md` — OpenShell/NemoClaw의 deny-by-default 정책에 넣을 허용 호스트 5개. 이 루프의 외부 통신은 그게 전부다.

## 실행

```bash
uv sync
cp .env.example .env            # build.nvidia.com 에서 발급한 nvapi- 키 (무료)

# 웹 콘솔 — 리포트 위에 실행 버튼. 단계 순서·관문은 코드가 지킨다
uv run uvicorn loop.web:app --port 8030      # http://localhost:8030

# 같은 것을 CLI로
uv run python -m loop.cli sense                     # 면담 12건 → 발언 카드 → 가설
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

**모든 면담 기록은 합성이다** (`data/field_notes.json`, 가상 의료진 12인). 약은 특허가 만료된 지 오래고 특정 회사 소유가 아니며 공개 근거가 가장 두꺼워서 골랐다(PubMed 제목 18,054편 · CT.gov 3,120건 · FAERS 440,270건 · Part D 연 3,400만 건 청구).

**Sense**: 면담 12건 → 발언 카드 30장, **원문 검증 통과 30/30**, 유해사례 후보 2건은 safety 큐로. 문턱(3회/3인)을 넘은 묶음 5개가 가설이 됐다.

| 가설 | 현장 | 외부 근거 (지지/반대/중립 · 버림) | 이 장면이 보여주는 것 |
|---|---|---|---|
| HYP-003 유방암 환자 × 쓰고 싶다(OFF_LABEL_DEMAND) | 3회/3인 | 10 / **3** / 19 · 2 | **반대 근거 장면.** 언론 보도로 환자 요청은 늘지만, 대규모 3상 MA.32(NCT01101438, n=3,649)는 무효. 같은 시험이 CT.gov에서는 «진지하게 시험됐다»(지지), PubMed 결과에서는 반대로 잡힌다 — 등록과 결과는 다르다. 심의(사고 모드) 권고 **HOLD**, 근거 첫 줄이 MA.32 무효 결과, 후속 질문 3개가 체크리스트로 |
| HYP-001 PCOS 여성 × 써봤다(OFF_LABEL_USE) | 6회/4인 | 9 / 0 / 27 · 3 | 지지 근거 장면. 허가 밖이지만 3상 42건 — DEVELOPMENT 경로로 전문조직 검토 |
| HYP-002 당뇨 전단계 × 막혔다(OFF_LABEL_DEMAND) | 4회/4인 | 23 / 2 / 13 · 1 | 라벨 경계 장면. 라벨은 침묵(중립), 시험은 117건 — «막혔다»와 «써봤다»를 가르는 이유 |
| HYP-004 유방암 × 다른 쓰임(REPURPOSING) | 3회/3인 | 9 / 1 / 7 · 3 | 당뇨 동반 환자의 관찰 연구 — 3상 결과 논문(PMID:35608580)이 함께 읽힌다 |
| HYP-005 유방암 × 자료 부족(UNMET_NEED) | 3회/3인 | 2 / 2 / 7 · 1 | 근거가 얇으면 얇다고 보인다 |
| 소아 10세 미만 · 노인 신기능 · 임신부 | 1~2인 | — | 임계 미달. 집계에는 보이지만 가설이 되지 않는다 — 문턱은 코드다 |
| 젖산산증 입원 · B12 결핍 신경병증 | 2건 | — | safety 큐. 분석에 섞이지 않는다 |

«버림»은 모델이 지어낸 인용이 아니라 **문장 중간을 건너뛰어 이어 붙인 것**들이다 — 그래도 세지 않는다. 공백·기호 차이(라벨 원문의 `( 5.1 )`, `Vitamin B 12`)와 «…»로 나뉜 조각은 코드가 원문에서 순서대로 찾아 살린다.

근거 읽기는 **RCT·3상·메타분석을 먼저** 읽는다(`screen.gather`). 관련도순 상위만 읽으면 가장 큰 시험이 밀린다 — MA.32가 처음엔 안 잡혔던 이유.

## 안 만든 것 · 한계
- 현장 수집 모바일 앱·음성 전사는 이 저장소에 없다 (`data/field_notes.json`이 그 출력이라고 가정).
- OpenShell 안에서 실행해 보지 않았다 (개발 환경이 macOS). 정책은 `sandbox/EGRESS.md`.
- `data/state.json` 하나가 정본이라 **명령은 한 번에 하나씩** 돌린다. 동시에 돌리면 나중 저장이 앞 저장을 덮는다.
- 모델 호출 1회 ≈ 20~60초(Nemotron 3 Ultra, 무료 엔드포인트). 한 바퀴 약 27회. 같은 입력은 캐시에서 즉시 재생된다.
