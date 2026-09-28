/**
 * 신호의 여정 — 현장의 말이 승인된 실행이 되기까지 (08/30 신설, 팀장 확정 목업).
 *
 * 보드 위 링이 실행 루프이고, **사람의 관문은 둘**이다 (08/30 #117) — 07 「근거 검토」와
 * 09 「사람 결정」. Screen 은 판정이 아니라 사람이 검토할 근거를 모으는 단계이므로,
 * 그 근거를 직접 읽은 사람의 서명이 있어야 심의로 올라간다. Claim 단위 승인 관문은
 * 여전히 없다 (절대 규칙 #3 · docs/HANDOFF §4). 숫자는 전부 기존 SQL 집계
 * (`/aggregates/pipeline`·`/aggregates/signals`·`/analytics/*`)를 그대로 그린다 (#1).
 */

import Link from "next/link";
import { api } from "@/lib/api";
import { Panel, Eyebrow, Chip, Topbar } from "@/app/components/ui";
import JourneyBoard, { type BoardCounts } from "./_board";

type Pipeline = {
  rawDocuments: number;
  analyzedRecords: number;
  // 08/30 개정(#115) — 「잠정 / 공식」 두 숫자가 한 숫자가 됐다. 승인이 «본부 검토 큐»에서
  // «수집 시점»으로 옮겨져 «승인을 기다리는 잠정»이라는 상태가 이 라인의 산출물에 없다.
  signals: { total: number; approved: number; heldForReview?: number };
  // 08/31 레인 개편 — 현장 줄의 두 칸. 화면이 세지 않는다 (절대 규칙 #1).
  field?: { interviews: number; activeDirectives: number };
  // `total` 은 RETIRED 를 뺀 가설 전체 — DRAFT 만 세면 이미 Screen 으로 넘어간 가설이
  // 통째로 빠져 0 이 뜬다(실측: DRAFT 0 · 전체 7).
  hypotheses: { total: number; draft: number; nearThreshold: number };
};
// 08/30: `nearThreshold`(임계 근접 조합 수)는 API가 주는데 보드가 안 받고 있었고,
// 04 「신호 축적」 자리에는 "SQL" 이라는 하드코딩 문자열이 들어가 있었다 — 이 화면에서
// 유일하게 데이터에 반응하지 않는 칸이었다. 있는 값을 그 자리에 붙인다.
type SigRow = {
  patientSegment: string; signalType: string;
  provisional: { claimCount: number; distinctHcp: number };
};
type SegRow = { segment: string; labelKo: string };

const SIGNAL_KO: Record<string, string> = {
  OFF_LABEL_DEMAND: "쓰고 싶은데 막혔다",
  OFF_LABEL_USE: "써봤다·반응 보고",
  REPURPOSING: "다른 쓰임",
  UNMET_NEED: "미충족 수요",
  DOSING: "용법·용량",
  SAFETY_TOLERABILITY: "안전성·내약성",
};

export const dynamic = "force-dynamic";

export default async function JourneyPage() {
  const [pipeR, sigR, segR, stageR, unmappedR] = await Promise.allSettled([
    api<Pipeline>("/aggregates/pipeline"),
    api<{ rows: SigRow[] }>("/aggregates/signals"),
    api<{ rows: SegRow[] }>("/analytics/segments"),
    // 단계 수치는 **서버 한 곳**에서 받는다 — 보드가 세지 않는다 (절대 규칙 #1).
    // `evidenceReview` 는 상태가 아니라 «서명 유무»로 세는 칸이라 서버가 따로 센다 (08/30 #117).
    api<{ stages: { screen: number; evidenceReview: number; board: number; decided: number } }>(
      "/hypotheses/pipeline"),
    api<{ totalTerms?: number }>("/analytics/unmapped?limit=1", { role: "DATA_STEWARD" }),
  ]);
  const pipe = pipeR.status === "fulfilled" ? pipeR.value : null;
  const sig = sigR.status === "fulfilled" ? sigR.value.rows : [];
  const segLabel = Object.fromEntries(
    (segR.status === "fulfilled" ? segR.value.rows : []).map((r) => [r.segment, r.labelKo]),
  );
  const stages = stageR.status === "fulfilled" ? stageR.value.stages : null;
  const unmapped = unmappedR.status === "fulfilled" ? (unmappedR.value.totalTerms ?? null) : null;

  // 신호 축적 상위 — 기각(REJECTED)만 뺀 전건 기준 정렬 (표시 가공 · 새 수치 없음).
  // `/aggregates/signals` 의 `provisional` 은 **필드 이름이 그대로 남은 것**이고, 그 뜻은
  // 「기각 제외 전건」이다 — 08/30 개정 뒤에는 «승인 대기»라는 뜻이 아니다. 분석 화면은
  // 여전히 공식과 나란히 두지만(규칙 #3), 이 여정 화면은 한 숫자로 말한다.
  //
  // **임계 평가와 같은 모집단만 센다 (08/30).** 안 거르면 상위 3이 실제로
  // 「UNSPECIFIED × OTHER 1,618」·「UNSPECIFIED × 용법·용량 140」으로 떴다 — 둘 다
  // 가설이 될 수 없는 행이다: `hypothesis_gen` 은 환자군 미상을 주체에서 빼고
  // (DECISIONS 08/21) 계약이 선언한 분석 신호만 임계에 태운다. 「신호 축적」이라 써 놓고
  // 미분류를 1위로 보여주면, 바로 옆 05 「가설 생성」의 숫자와 이야기가 이어지지 않는다.
  const topSignals = sig
    .slice()
    .filter((r) => r.patientSegment !== "UNSPECIFIED" && r.signalType in SIGNAL_KO)
    .sort((a, b) => b.provisional.claimCount - a.provisional.claimCount)
    .slice(0, 3)
    .map((r) => ({
      labelKo: `${segLabel[r.patientSegment] ?? r.patientSegment} × ${SIGNAL_KO[r.signalType] ?? r.signalType}`,
      count: r.provisional.claimCount,
      hcp: r.provisional.distinctHcp,
    }));

  const counts: BoardCounts = {
    documents: pipe?.rawDocuments ?? null,
    blocks: pipe?.analyzedRecords ?? null,
    claims: pipe?.signals.total ?? null,
    hypotheses: pipe?.hypotheses.total ?? null,
    fieldInterviews: pipe?.field?.interviews ?? null,
    activeDirectives: pipe?.field?.activeDirectives ?? null,
    nearThreshold: pipe?.hypotheses.nearThreshold ?? null,
    screen: stages?.screen ?? null,
    evidenceReview: stages?.evidenceReview ?? null,
    board: stages?.board ?? null,
    decided: stages?.decided ?? null,
    unmappedTerms: unmapped,
    topSignals,
  };

  return (
    <>
      <Topbar title="신호의 여정" />
      <div className="mx-auto max-w-6xl pb-24">
        <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-navy">신호의 여정</h1>
        <p className="mt-1.5 max-w-xl text-[0.9375rem] leading-[1.7] text-muted">
          현장의 말 한 줄이 승인된 실행이 되기까지의 경로입니다. 사람이 판단하는 지점은{" "}
          <b className="font-medium text-body">07 근거 검토</b>와{" "}
          <b className="font-medium text-body">09 사람 결정</b> 두 곳이며, 추출된 항목을 하나씩
          다시 승인하는 단계는 없습니다 — 확정은{" "}
          <b className="font-medium text-body">수집하는 시점</b>에 이루어집니다.
        </p>

        <Panel pad="lg" className="mt-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <Eyebrow>파이프라인 보드 · 관찰된 사실</Eyebrow>
            <span className="text-[0.8125rem] leading-[1.6] text-muted">
              <b className="text-ink">가로줄은 왼쪽 메뉴의 층과 같습니다</b> — 마우스를 올리면 그
              단계의 설명이 뜨고, 누르면 해당 화면으로 이동합니다
            </span>
            <span className="ml-auto"><Chip>SQL 집계</Chip></span>
          </div>
          <div className="mt-4">
            <JourneyBoard c={counts} />
          </div>
          {/* 아이콘 레전드 — «누가 하는 단계인가» (08/30 팀장 요청으로 아이콘이 생기며 추가).
              색은 브랜드 두 색만 쓰고, 같은 «기계»라도 **세는 것**과 **판단하는 것**을 ✦ 로
              가른다 — 그 구분이 절대 규칙 #1 이다. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4
                          text-[0.75rem] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] border border-glass-line bg-fill-2" />
              코드·SQL 이 세는 단계 <span className="text-faint">01·02·04</span>
            </span>
            <span className="flex items-center gap-1.5">
              {/* 보드의 배지와 같은 크기로 — 레전드가 더 작으면 «다른 표식»으로 읽힌다 */}
              <svg width="14" height="14" viewBox="0 0 12 12" fill="var(--orange-deep)" aria-hidden>
                <path d="M6 0l1.1 3.4L10.5 4.5 7.1 5.6 6 9 4.9 5.6 1.5 4.5 4.9 3.4z" />
              </svg>
              AI 에이전트가 판단하는 단계 <span className="text-faint">03·05·06·08</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] border-[1.5px] border-dashed border-orange-deep" />
              사람의 관문 <span className="text-faint">07·09</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] bg-orange-soft" />
              현장에서 일어나는 것 <span className="text-faint">상시 · 현장 · 10</span>
            </span>
          </div>

          {/* 선 세 종류의 뜻 — 08/31 2차 팀장: "주황색 점선이랑 네이비색 점선은 차이가 뭐야".
              보드에 흐르는 선이 셋인데 범례가 둘만 말하고 있었다. **색이 «누가 도는가»를,
              대시 모양이 «얼마나 자주»를 말한다**: 오렌지=매번 · 네이비 점=드물게 ·
              네이비 긴 대시=한 번. safety 항목은 뺐다 — 보드에서 그 패드를 내렸다(팀장). */}
          <div className="mt-4 grid gap-x-8 gap-y-3 border-t border-line pt-4 md:grid-cols-3">
            <div className="flex items-start gap-2.5">
              <svg width="30" height="8" className="mt-1.5 flex-none" aria-hidden>
                <path d="M1 4h28" stroke="var(--orange)" strokeWidth="2.2" strokeDasharray="2 6" strokeLinecap="round" />
              </svg>
              <p className="text-[0.75rem] leading-[1.6] text-muted">
                <b className="text-ink">오렌지 점 — 실행 루프.</b> 왼쪽 세로 경로입니다.
                09에서 <b className="text-ink">승인한 것만</b> 「수집 지시」가 되어 현장으로
                내려가고, 다음 면담이 그 질문을 참조합니다 —
                <b className="text-ink"> 심의할 때마다</b> 닫힙니다.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <svg width="30" height="8" className="mt-1.5 flex-none" aria-hidden>
                <path d="M1 4h28" stroke="var(--navy)" strokeWidth="1.8" strokeDasharray="2 5" strokeLinecap="round" opacity="0.75" />
              </svg>
              <p className="text-[0.75rem] leading-[1.6] text-muted">
                <b className="text-ink">네이비 점 — 구조 루프.</b> 스키마에 칸이 없어 미분류로
                쌓인 표현이 반복되면, 변경 심사를 거쳐 사람이 승인하고 수집 구조 자체가
                넓어집니다 — <b className="text-ink">드물게</b> 일어나는 것이 정상입니다.
              </p>
            </div>
            {/* 08/31: 여기 있던 「safety 분리」를 「상시 수집」으로 바꿨다. AE 패드를 보드에서
                뺐으므로(팀장 결정) 그 선을 설명할 자리가 없어졌고, 대신 레인 개편으로 **새로
                생긴 줄**이 설명을 필요로 한다 — 현장은 Board 지시가 없어도 매일 돈다.
                절대 규칙 #6은 그대로다: 개별 AE 후보는 여전히 어느 집계에도 안 들어가고
                「안전」 화면이 자기 자리에서 그 사실을 말한다. */}
            <div className="flex items-start gap-2.5">
              <svg width="30" height="8" className="mt-1.5 flex-none" aria-hidden>
                <path d="M1 4h28" stroke="var(--navy)" strokeWidth="2" strokeDasharray="7 5" strokeLinecap="round" opacity="0.6" />
              </svg>
              <p className="text-[0.75rem] leading-[1.6] text-muted">
                <b className="text-ink">네이비 긴 대시 — 최초 적재.</b> 회사에 이미 쌓여 있던
                내부 문서(01)가 02 로 들어옵니다 — <b className="text-ink">한 번</b> 지나갑니다.
              </p>
            </div>
            {/* 08/31 레인 개편으로 넷째 선이 생겼다 — 색 규약(«누가 도는가»)에 맞춰 회색이다:
                오렌지=실행 루프 · 네이비=구조 루프/최초 적재 · 회색=루프 밖 상시. */}
            <div className="flex items-start gap-2.5">
              <svg width="30" height="8" className="mt-1.5 flex-none" aria-hidden>
                <path d="M1 4h28" stroke="var(--muted)" strokeWidth="2" strokeDasharray="6 4"
                      strokeLinecap="round" opacity="0.75" />
              </svg>
              <p className="text-[0.75rem] leading-[1.6] text-muted">
                <b className="text-ink">회색 대시 — 상시 수집.</b> 루틴 방문은 심의 지시와 무관하게
                들어옵니다 — <b className="text-ink">매일</b> 이루어집니다. 지시는 그 위에 더해지는
                항목입니다.
              </p>
            </div>
          </div>
        </Panel>

        {/* 단계 상세 3열 — 보드가 그림이라면 여기는 읽는 줄이다 */}
        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-3">
          <Panel pad="lg">
            <Eyebrow>수집 · 구조화 — 입구 둘</Eyebrow>
            {/* 08/31 회의: «영어 원석 + 한국어 Field 수집을 발언 단위로 나눠» 가 틀렸다.
                Field 는 01·02 를 거치지 않는다 — 계약 버전에 맞춰 claim 을 직접 만든다. */}
            <p className="mt-2.5 text-[0.875rem] leading-[1.7] text-body">
              <b className="text-ink">회사에 이미 쌓여 있던 비정형 데이터</b>는 01–02 를 지나 발언 단위로
              나뉘고, <b className="text-ink">현장 수집</b>은 스키마에 맞춰 정리된 항목을 바로 만듭니다.
              두 경로가 03 에서 만나고, 정리된 항목은 <b className="text-ink">그대로 적재</b>됩니다.
            </p>
            <p className="mt-2.5 text-[0.75rem] leading-[1.6] text-faint">
              현장 수집은 <b className="text-ink">전사된 대화 원문</b>도 함께 남깁니다 — 지금 스키마에 담을
              칸이 없는 이야기까지 보존해 두기 위한 것이고, 스키마가 넓어질 때 다시 읽어 쓰는 재료가 됩니다.
            </p>
            {/* 08/30(#115): 여기 있던 「공식과 잠정을 나란히」는 이 단계에 대해서는 더 이상
                맞지 않는다 — 원석 배치분은 적재하는 순간 승인되므로 대기하는 잠정이 없다.
                그 표기 규율이 살아 있는 곳은 집계·분석 화면이고, 여기서 말할 것은
                «승인이 어디서 찍히는가»다. */}
            <p className="mt-2.5 text-[0.75rem] leading-[1.6] text-faint">
              확정은 수집하는 시점에 이루어집니다 — 과거 축적분은 불러올 때, 현장 수집분은 그
              대화에 있었던 수집자가 확인하면서. 형식 검증에 걸린 항목만 사람이 확인합니다.
            </p>
          </Panel>
          <Panel pad="lg">
            <Eyebrow>신호 축적 · 가설 (04–05)</Eyebrow>
            {topSignals.length > 0 ? (
              <div className="mt-2.5 space-y-1.5">
                {topSignals.map((s) => (
                  <div key={s.labelKo}
                       className="flex items-baseline gap-2 rounded-lg bg-fill-1 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-body">{s.labelKo}</span>
                    <b className="mono text-[0.8125rem] tabular-nums text-orange-deep">{s.count}</b>
                    <span className="mono text-[0.6875rem] tabular-nums text-faint">{s.hcp}인</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2.5 text-[0.875rem] leading-[1.7] text-muted">
                구조화가 진행되면 상위 신호가 여기에 채워집니다.
              </p>
            )}
            <p className="mt-2.5 text-[0.75rem] leading-[1.6] text-faint">
              반복 5회 이상이면서 독립 의료진 3인 이상이면 가설이 자동으로 만들어집니다.
            </p>
          </Panel>
          <Panel pad="lg">
            <Eyebrow>검토 · 심의 · 실행 (06–10)</Eyebrow>
            <p className="mt-2.5 text-[0.875rem] leading-[1.7] text-body">
              검증 단계가 외부 공개 근거(PubMed · ClinicalTrials.gov · openFDA · CMS)를 모으면{" "}
              <b className="text-ink">사람이 그 근거를 직접 읽고 서명</b>해야 심의로 올라갑니다.
              AI 이사회가 권고하면 <b className="text-ink">사람이 결정</b>하고, 승인된 후속 질문이
              현장 질문지로 내려가면서 한 바퀴가 닫힙니다.
            </p>
            {/* 08/30(#117): Screen 은 판정이 아니라 근거 수집이다. 기계가 센 지지/반대
                개수가 심의 여부를 대신 정하면 loop 안에 사람이 없다 — 그래서 서명이 관문이다. */}
            <p className="mt-2.5 text-[0.75rem] leading-[1.6] text-faint">
              현재 <b className="text-orange-deep">{counts.evidenceReview ?? "—"}건</b>이 근거 검토 서명을
              기다리고 있습니다 — 지지 근거가 많아도 아무도 읽지 않았으면 올라가지 않습니다.
            </p>
            <p className="mt-2.5 text-[0.75rem] leading-[1.6] text-faint">
              <Link href="/hypotheses?stage=screen" className="text-navy underline underline-offset-2">
                근거 검토하러 가기 →
              </Link>
            </p>
          </Panel>
        </div>

        <p className="mt-6 border-t border-line pt-4 text-[0.8125rem] leading-[1.7] text-muted">
          모든 수치는 서버 SQL 계산입니다 — 화면은 세지 않습니다.
          실행 루프는 매 심의마다, 구조 루프는 드물게 도는 것이 정상입니다.
        </p>
      </div>
    </>
  );
}
