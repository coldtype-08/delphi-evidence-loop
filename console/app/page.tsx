/**
 * 홈 대시보드 — 벤토 통합판 v2 (08/30, 팀장 확정 목업 「안 1」 타일 1:1 재현).
 *
 * 위에서부터: 수집 현실 벤토(코퍼스 · 허가 밖/안 언급 · 계약 버전 · 수집 캘린더 · 연도
 * 비교) → 언급 벤토(허가 밖 질환 상위 3 추세 · 신호 유형 6축 · 안전성 언급) → 시간·공간축
 * (월별 추이 · 권역 밀도) → 판독 파이프라인(claim 계기판 + 신호 지도).
 *
 * 수치의 출처가 **두 층**이고 화면이 그 구분을 표기한다:
 *  - 언급 집계 `/analytics/mentions` — 원문 결정론 키워드 매칭(절대 규칙 #1의 「결정론적
 *    코드」쪽). LLM 추출 claim 이 아니며 판독 전에도 정확하다 — 타일에 「언급 블록」표기.
 *  - claim 집계 `/aggregates/*` — LLM 추출 후 SQL. 08/30(#115)로 승인이 «수집 시점»으로
 *    옮겨져 이 화면의 파이프라인 계기판에는 「잠정」이 없다 — 공식/잠정 나란히·합산 금지(#3)가
 *    살아 있는 곳은 아래 분석 탭(`/analytics`)이다.
 *  - 안전성 언급은 별도 경로 카드 하나로 격리 — 어떤 집계와도 섞지 않는다 (#6).
 *  - 허가 밖 항목은 전문조직 검토 대상으로만 표시한다 (#5).
 */

import Link from "next/link";
import { api } from "@/lib/api";
import { Panel, Eyebrow, Chip, Topbar, Placeholder } from "@/app/components/ui";
import AnalyticsTabs from "./analytics/_tabs";
import SignalMapInteractive from "./analytics/_signal-map";
import { SignalGlossary, toSignalCells, type SigRow } from "./analytics/_signals";
import KpiStrip, { type KpiStage } from "./components/kpi-strip";
import CollectTrend, { type MonthPoint } from "./components/collect-trend";
import HeatDots from "./components/heat-dots";
import HoverTip, { TipHead, TipRow, TipNote } from "./components/hover-tip";
import { Lock01 } from "@untitledui/icons";

type Kpis = {
  computedBy: string;
  asOf: string;
  approvedClaims: number;
  /** 08/30 신설 — 구조화가 만들어 낸 claim 전체(기각 제외). 「추출된 Claim」이 세는 것. */
  totalClaims: number;
  distinctHcp: number;
  /** RETIRED 제외 — `GET /hypotheses` 목록의 기본 필터와 같은 기준 (08/30) */
  openHypotheses: number;
  /** CANDIDATE — 08/30(#115) 개정 뒤 뜻이 「승인 대기」에서 **「검증에 걸려 사람이 봐야 할
   *  L등급」**으로 바뀌었다. 「추출된 Claim」에 쓰면 승인 정책이 바뀔 때마다 카드가 뜻을 바꾼다. */
  pendingReviews: number;
};

type Collection = {
  corpus: {
    documents: number; blocks: number; distinctHcp: number;
    firstMonth: string; lastMonth: string; recentHcp: number;
  };
  recentSince: string;
  monthly: MonthPoint[];
  yearly: { year: string; blocks: number; distinctHcp: number }[];
  regions: {
    region: string; blocks: number; distinctHcp: number;
    recentBlocks: number; recentHcp: number; gapHcp: number;
  }[];
};

type Mentions = {
  computedBy: string;
  totalBlocks: number;
  scope: {
    outLabel: { blocks: number; distinctHcp: number; diseaseCount: number } | null;
    inLabel: { blocks: number; distinctHcp: number };
  };
  diseases: {
    key: string; ko: string; en: string; labelScope: string;
    blocks: number; distinctHcp: number;
    monthly: { month: string; count: number }[];
  }[];
  signals: { key: string; ko: string; blocks: number; distinctHcp: number }[];
  cross: Record<string, { blocks: number; distinctHcp: number }>;
  safety: {
    tolerabilityBlocks: number; aeBlocks: number; unclassifiedBlocks: number;
    tol: { key: string; ko: string; blocks: number }[];
    ae: { key: string; ko: string; blocks: number }[];
  };
  noteKo: string;
};

type ContractStatus = { version: string | null; status: string };

const REGION_KO: Record<string, string> = {
  NORTHEAST: "북동부", MIDWEST: "중서부", SOUTH: "남부", WEST: "서부",
};

// 환자군 × 신호 교차 칩 — 이 데이터셋에서 가설이 선 네 조합. 숫자는 서버 cross 맵에서
// 읽고, 여기는 어느 조합을 보여줄지만 정한다. 키는 "환자군 라벨|신호 유형" (계약의 환자군
// 키가 곧 한국어 라벨이다).
const CROSS_CHIPS: { key: string; label: string }[] = [
  { key: "유방암 환자|OFF_LABEL_DEMAND", label: "유방암 × 막혔다" },
  { key: "PCOS 여성|OFF_LABEL_USE", label: "PCOS × 써봤다" },
  { key: "당뇨 전단계|OFF_LABEL_DEMAND", label: "당뇨 전단계 × 막혔다" },
  { key: "유방암 환자|REPURPOSING", label: "유방암 × 다른 쓰임" },
];

export const dynamic = "force-dynamic";

async function loadSignalMap() {
  const [sig, seg] = await Promise.all([
    api<{ rows: SigRow[] }>("/aggregates/signals"),
    api<{ rows: { segment: string; labelKo: string; labelScope: string; hypothesisIds: string[] }[] }>(
      "/analytics/segments",
    ),
  ]);
  const label = Object.fromEntries(seg.rows.map((r) => [r.segment, r.labelKo]));
  const scope = Object.fromEntries(seg.rows.map((r) => [r.segment, r.labelScope]));
  const hypBySegment = Object.fromEntries(seg.rows.map((r) => [r.segment, r.hypothesisIds ?? []]));
  return { cells: toSignalCells(sig.rows, label, scope), hypBySegment };
}

/** 상위 질환 추세 스파크라인 — 서버의 월별 시계열을 그리기만 한다. */
function TrendSpark({ series, axis }: { series: Map<string, number>; axis: string[] }) {
  const vals = axis.map((mo) => series.get(mo) ?? 0);
  const max = Math.max(1, ...vals);
  const W = 180, H = 40;
  const pts = vals.map((v, i) =>
    `${i ? "L" : "M"}${((i / Math.max(1, vals.length - 1)) * W).toFixed(1)} ${(H - 3 - (v / max) * (H - 8)).toFixed(1)}`,
  ).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-10 w-full" aria-hidden preserveAspectRatio="none">
      <path d={`${pts} L${W} ${H} L0 ${H} Z`} fill="var(--orange)" opacity="0.14" />
      <path d={pts} fill="none" stroke="var(--orange-deep)" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Home() {
  // 병렬 조회 — 하나가 죽어도 나머지 화면은 뜬다.
  const [kpisR, collR, mentR, contractR, stagesR, mapR] = await Promise.allSettled([
    api<Kpis>("/aggregates/kpis"),
    api<Collection>("/analytics/collection"),
    api<Mentions>("/analytics/mentions"),
    api<ContractStatus>("/contract/status"),
    api<{ stages: { screen: number; evidenceReview: number; board: number } }>(
      "/hypotheses/pipeline"),
    loadSignalMap(),
  ]);
  const kpis = kpisR.status === "fulfilled" ? kpisR.value : null;
  const coll = collR.status === "fulfilled" ? collR.value : null;
  const ment = mentR.status === "fulfilled" ? mentR.value : null;
  const contract = contractR.status === "fulfilled" ? contractR.value : null;
  const stagesCount = stagesR.status === "fulfilled" ? stagesR.value.stages : null;
  const { cells, hypBySegment } =
    mapR.status === "fulfilled" ? mapR.value : { cells: [], hypBySegment: {} };
  const backendDown = !kpis && !coll;
  // 백엔드는 살아 있는데 **언급 집계만 없는** 상태 (08/30). `/analytics/collection`·
  // `/analytics/mentions` 는 이 브랜치가 추가한 엔드포인트라, 한 버전 뒤의 백엔드를 보면
  // 404 가 난다. 그때 타일을 `{coll && …}` 로 그냥 빼면 **화면이 통째로 예전 버전처럼**
  // 보인다 — 실제로 그렇게 오해했다. 사라지는 대신 왜 없는지 말한다.
  const mentionsMissing = !backendDown && (!coll || !ment);

  // 파이프라인 계기판 (08/29 설계 유지) — 실제 흐름 그대로, 오렌지는 사람의 관문 하나.
  const stages: KpiStage[] = [
    {
      // 08/30(#115): 이 칸은 `pendingReviews`(CANDIDATE)를 「추출된 Claim · 잠정 집계」로
      // 부르고 있었다. 두 군데가 틀렸다 — 세는 대상이 추출 전체가 아니라 **승인 안 된 것**
      // 이었고(1,996 중 1,807만 보였다), 승인이 수집 시점으로 옮겨진 지금 「잠정」이라는
      // 대기 상태 자체가 없다. 카드 이름이 세는 것과 같아지도록 `totalClaims` 로 바꾼다.
      n: 1, label: "추출된 Claim", value: kpis?.totalClaims ?? null, unit: "건", tag: "근거 연결됨",
      note: "AI가 원문에서 뽑아 근거 위치까지 연결한 주장(Claim)입니다. 근거 문장이 원문과 다르면 저장되지 않습니다.",
      href: "/pipeline#ai-readable",
    },
    {
      n: 2, label: "열린 가설", value: kpis?.openHypotheses ?? null, unit: "건", tag: null,
      note: "임계값(반복 3회·독립 의료진 3인)을 둘 다 넘어 자동 생성됐고, 아직 승인·반려되지 않은 가설입니다.",
      href: "/hypotheses",
    },
    {
      n: 3, label: "근거 검증 중", value: stagesCount?.screen ?? null, unit: "건", tag: "다중 에이전트",
      note: "검토관 4인이 PubMed·ClinicalTrials.gov·openFDA·CMS의 공개 근거와 대조하는 중인 가설입니다.",
      href: "/hypotheses?stage=screen",
    },
    {
      // 08/30(#117): 「심의 대기」(`stages.board`)였다. 두 군데가 틀어졌다 —
      // ① `board` 칸이 결정 난 가설까지 세도록 넓어져(화면과 맞춤) 「대기」가 아니게 됐고
      // ② 사람의 관문이 **둘**이 되면서 «지금 사람이 할 일»의 앞자리가 바뀌었다.
      //    Screen 은 판정이 아니라 근거 수집이고, 그 근거를 읽고 서명해야 심의로 간다.
      // 그래서 이 칸이 세는 것은 **서명을 기다리는 수**다 — 강조색이 가리켜야 할 자리.
      n: 4, label: "근거 검토 대기", value: stagesCount?.evidenceReview ?? null, unit: "건",
      tag: "사람이 볼 차례", tagTone: "orange",
      note: "Screen이 모은 외부 근거를 사람이 직접 읽고 «검토했습니다»에 서명해야 심의로 올라갑니다 — 사람의 관문 둘 중 첫째입니다 (둘째는 심의 결정).",
      href: "/hypotheses?stage=screen",
      accent: true,
    },
  ];

  // 허가 밖 질환 상위 3 + 그 외 — 서버가 블록 수로 정렬해 준 것을 자르기만 한다.
  const offDiseases = (ment?.diseases ?? []).filter((d) => d.labelScope === "OUT_OF_LABEL");
  const axis = (coll?.monthly ?? []).slice(-24).map((x) => x.month);
  const top3 = offDiseases.slice(0, 3).map((d) => {
    const series = new Map(d.monthly.map((x) => [x.month, x.count]));
    // 배수 = 최근 12개월 ÷ 이전 12개월 — 서버 시계열의 단순 합산(표시 가공), 새 수치 없음.
    const r12 = axis.slice(12).reduce((s, mo) => s + (series.get(mo) ?? 0), 0);
    const p12 = axis.slice(0, 12).reduce((s, mo) => s + (series.get(mo) ?? 0), 0);
    return { ...d, series, r12, p12 };
  });
  const restOff = offDiseases.slice(3);

  // 연도 비교 — 마지막 두 해. 연환산은 표시 가공(단순 나눗셈)이고 각주로 밝힌다.
  const yearly = coll?.yearly ?? [];
  const yPrev = yearly.length >= 2 ? yearly[yearly.length - 2] : null;
  const yLast = yearly.length >= 1 ? yearly[yearly.length - 1] : null;
  const lastMonthNum = coll ? parseInt(coll.corpus.lastMonth.slice(5), 10) : 12;
  const monthsElapsed =
    yLast && coll && coll.corpus.lastMonth.slice(0, 4) === yLast.year ? lastMonthNum : 12;
  const annualized =
    yLast && monthsElapsed < 12 ? Math.round((yLast.blocks / monthsElapsed) * 12) : null;
  const yMax = Math.max(1, yPrev?.blocks ?? 0, yLast?.blocks ?? 0);

  // 권역 밀도 — 1인당 면담 밀도 순 (서버 값의 나눗셈 표시 가공).
  const regions = (coll?.regions ?? []).slice().sort((a, b) =>
    b.blocks / Math.max(1, b.distinctHcp) - a.blocks / Math.max(1, a.distinctHcp));
  const maxRegionBlocks = Math.max(1, ...regions.map((r) => r.blocks));
  const topRegion = regions[0] ?? null;
  const topIsFewest =
    topRegion !== null && regions.every((r) => r.distinctHcp >= topRegion.distinctHcp);

  const maxSignal = Math.max(1, ...(ment?.signals ?? []).map((s) => s.blocks));
  const safetyTotal = ment
    ? ment.safety.tolerabilityBlocks + ment.safety.aeBlocks + ment.safety.unclassifiedBlocks
    : 0;

  // 도식 카드 호버 상세의 재료 (08/30 팀장 요청) — 전부 서버 값의 재배열이다.
  const regByBlocks = (coll?.regions ?? []).slice().sort((a, b) => b.blocks - a.blocks);
  const inDiseases = (ment?.diseases ?? []).filter((d) => d.labelScope === "IN_LABEL");

  return (
    <>
      <Topbar
        title="홈 대시보드"
        meta={kpis
          ? `computedBy ${kpis.computedBy} · asOf ${new Date(kpis.asOf).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
          : undefined}
      />

      <div className="mx-auto max-w-6xl pb-24">
        <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-navy">
          성장 인텔리전스
        </h1>
        <p className="mt-1.5 max-w-xl text-[0.9375rem] leading-[1.7] text-muted">
          현장에서 들어온 말이 구조화를 거쳐 가설이 되고 심의에 오르기까지의 상태입니다.{" "}
          <b className="font-medium text-body">모든 수치는 서버 계산</b>이고, 화면은 세지 않습니다.
        </p>

        <AnalyticsTabs current="overview" />

        {backendDown && (
          <Panel tone="note" pad="lg" className="mt-10">
            <b className="text-[0.9375rem] text-rust">백엔드에 연결할 수 없습니다.</b>
            <pre className="mono mt-2.5 rounded-xl bg-card px-4 py-3 text-[0.8125rem] leading-[1.8] text-body">
              cd backend && uv run uvicorn app.main:app --reload{"\n"}
              (최초 1회: uv run --project backend python scripts/seed_db.py)
            </pre>
          </Panel>
        )}

        {mentionsMissing && (
          <Panel tone="note" pad="lg" className="mt-10">
            <b className="text-[0.9375rem] text-rust">언급 집계 타일이 빠졌습니다.</b>
            <p className="mt-2 text-[0.875rem] leading-[1.7] text-body">
              백엔드는 응답하는데{" "}
              <code className="mono text-[0.8125rem] text-ink">
                {[!coll && "/analytics/collection", !ment && "/analytics/mentions"]
                  .filter(Boolean).join(" · ")}
              </code>{" "}
              이(가) 없습니다 — 이 화면의 코퍼스·언급 타일이 쓰는 집계입니다.
            </p>
            <p className="mt-2 text-[0.8125rem] leading-[1.7] text-muted">
              한 버전 뒤의 백엔드를 보고 있을 때 나는 상태입니다(예: 배포본을 보는{" "}
              <code className="mono text-[0.75rem]">dev.sh --remote</code>). 로컬 백엔드로 띄우면
              채워집니다 — 이 타일들은 결정론 언급 집계라 계약 확정·판독 없이도 정확합니다.
            </p>
            <pre className="mono mt-2.5 rounded-xl bg-card px-4 py-3 text-[0.8125rem] leading-[1.8] text-body">
              bash scripts/dev.sh
            </pre>
          </Panel>
        )}

        {/* ── 벤토 A — 수집 현실. 코퍼스(면담 블록) 기준이라 판독 전에도 정확하다. ── */}
        {coll && (
          <div className="mt-10 grid gap-3.5 md:grid-cols-12">
            <Panel tone="navy" pad="lg" className="flex flex-col md:col-span-3">
              <Eyebrow onNavy>면담 코퍼스 · 관찰된 사실</Eyebrow>
              <HoverTip
                tip={<>
                  <TipHead>권역별 면담 블록</TipHead>
                  {regByBlocks.map((r) => (
                    <TipRow key={r.region} k={REGION_KO[r.region] ?? r.region} v={`${r.blocks}블록`} />
                  ))}
                  <TipNote>
                    최근 1년에 만난 의료진 {coll.corpus.recentHcp}인 / 전체 {coll.corpus.distinctHcp}인
                  </TipNote>
                </>}
              >
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-[2.6rem] font-medium leading-none tabular-nums">
                    {coll.corpus.blocks.toLocaleString()}
                  </span>
                  <span className="mono text-[0.8125rem] text-on-navy-3">블록</span>
                </div>
                <p className="mt-2 text-[0.8125rem] leading-[1.7] text-on-navy-2">
                  원문 문서 {coll.corpus.documents.toLocaleString()} · 의료진{" "}
                  {coll.corpus.distinctHcp}인 · {coll.corpus.firstMonth} ~ {coll.corpus.lastMonth}
                </p>
              </HoverTip>
              <div className="mt-auto flex gap-2 pt-4">
                <Link href="/pipeline"
                      className="flex-1 whitespace-nowrap rounded-lg bg-on-navy px-2 py-1.5 text-center text-[0.75rem] font-semibold text-navy">
                  AI Readable 전환 ↗
                </Link>
                <Link href="/analytics?tab=kol"
                      className="flex-1 whitespace-nowrap rounded-lg border border-on-navy-line px-2 py-1.5 text-center text-[0.75rem] font-medium text-on-navy-2 hover:text-on-navy">
                  수집 현장 ↗
                </Link>
              </div>
            </Panel>

            {/* 허가 밖/안 언급 스택 — 두 숫자는 층이 같은 「언급 블록」이고 절대 더하지 않는다.
                허가 범위 = 활성 Data Contract가 정한 허가 적응증 범위, 허가 밖은 표시만 (절대 규칙 #5). */}
            <div className="flex flex-col gap-3.5 md:col-span-3">
              <Panel pad="lg" className="flex-1">
                <HoverTip
                  className="flex items-center gap-3"
                  tip={ment?.scope.outLabel ? <>
                    <TipHead>
                      허가 범위 밖 {ment.scope.outLabel.blocks}블록 ·
                      의료진 {ment.scope.outLabel.distinctHcp}인
                    </TipHead>
                    {offDiseases.slice(0, 6).map((d) => (
                      <TipRow key={d.key} k={d.ko} v={`${d.blocks}블록`} />
                    ))}
                    {offDiseases.length > 6 && <TipRow k="그 외" v={`${offDiseases.length - 6}개 질환`} />}
                    <TipNote>허가 밖 신호는 전문조직 검토용으로만 표시하며, 상업 액션과 연결하지 않습니다.</TipNote>
                  </> : "원문에서 직접 센 언급입니다 — 판독과 무관합니다."}
                >
                  <span className="flex size-9 flex-none items-center justify-center rounded-full bg-orange-soft">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--orange-deep)"
                         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M7 17L17 7M8 7h9v9" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[1.55rem] font-medium leading-none tabular-nums text-ink">
                        {ment?.scope.outLabel ? ment.scope.outLabel.blocks : "—"}
                      </span>
                    </div>
                    <div className="mt-1 text-[0.75rem] leading-[1.5] text-muted">허가 범위 밖 언급 블록</div>
                  </div>
                  {ment?.scope.outLabel && (
                    <span className="mono ml-auto whitespace-nowrap rounded-full bg-orange-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-orange-deep">
                      {ment.scope.outLabel.diseaseCount}개 질환
                    </span>
                  )}
                </HoverTip>
              </Panel>
              <Panel pad="lg" className="flex-1">
                <HoverTip
                  className="flex items-center gap-3"
                  tip={ment ? <>
                    <TipHead>
                      허가 범위 안 {ment.scope.inLabel.blocks}블록 ·
                      의료진 {ment.scope.inLabel.distinctHcp}인
                    </TipHead>
                    {inDiseases.map((d) => (
                      <TipRow key={d.key} k={d.ko} v={`${d.blocks}블록`} />
                    ))}
                    <TipNote>허가 범위 = 활성 Data Contract가 정한 허가 적응증 범위</TipNote>
                  </> : "원문에서 직접 센 언급입니다 — 판독과 무관합니다."}
                >
                  <span className="flex size-9 flex-none items-center justify-center rounded-full bg-fill-2">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--navy)"
                         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-[1.55rem] font-medium leading-none tabular-nums text-ink">
                      {ment ? ment.scope.inLabel.blocks : "—"}
                    </div>
                    <div className="mt-1 text-[0.75rem] leading-[1.5] text-muted">허가 범위 안 언급 블록</div>
                  </div>
                  <span className="mono ml-auto whitespace-nowrap rounded-full bg-fill-2 px-2 py-0.5 text-[0.6875rem] font-semibold text-navy">
                    대비 축
                  </span>
                </HoverTip>
              </Panel>
            </div>

            {/* 계약 버전 — 값 코드·축은 불변, 변경은 SCP 경로만 (절대 규칙 #4).
                08/30 2차 (팀장: "아이콘이나 글자 크기를 키우든가 중앙 정렬을 하든가 해서
                꽉 찬 느낌이었으면"): 좌측 정렬 + 작은 자물쇠라 카드의 오른쪽 절반이 비어
                있었다. 가운데로 모으고 자물쇠를 키웠다.
                설명도 바꿨다 — 「Data Contract」는 이름을 되풀이할 뿐 **무엇인지**를 말하지
                않는다. 이 계약의 정체는 두 층이 만난 것이다: 회사가 이미 아는 질문을 사람이
                고정 헤더로 쥐고(도메인 지식), 그 데이터에만 있는 것을 AI가 발견 헤더로
                찾는다 — CLAUDE.md 「헤더 두 층」. 그래서 «Domain Knowledge × AI»다. */}
            {/* 08/30 3차 (팀장): 링크가 맨 아래 한 줄에만 걸려 있어 카드를 눌러도 아무 일이
                없었다. **카드 전체가 링크**이고 목적지는 「AI Readable 전환」이다 — 계약이
                실제로 쓰이는 곳이 거기다. 꼬리말 「환자군 × 신호 6축 →」은 지웠다. */}
            <Panel as="div" pad="none" className="md:col-span-2">
              <HoverTip
                className="h-full"
                tip={<>
                  <TipHead>
                    Data Contract {contract?.version ? `v${contract.version}` : "없음"}
                    {contract && contract.status !== "ACTIVE" && ` · ${contract.status}`}
                  </TipHead>
                  <TipRow k="사람이 정한 고정 헤더" v="반드시 알아야 할 질문" />
                  <TipRow k="AI가 찾은 발견 헤더" v="이 데이터에만 있는 것" />
                  <TipRow k="분석 축" v="환자군 × 신호 유형" />
                  <TipNote>
                    수집·추출·집계·Field 입력 폼이 모두 이 스키마 하나를 씁니다.
                    바꾸려면 변경 제안을 사람이 승인해야 합니다.
                  </TipNote>
                </>}
              >
                <Link href="/pipeline"
                      className="flex h-full flex-col items-center justify-center rounded-2xl px-5 py-5
                                 text-center transition-colors hover:bg-fill-1">
                  <span className="flex size-12 items-center justify-center rounded-full bg-fill-2">
                    <Lock01 size={22} color="var(--navy)" strokeWidth={1.8} />
                  </span>
                  <div className="mt-3.5 text-[2rem] font-medium leading-none tabular-nums text-ink">
                    {contract?.version ? `v${contract.version}` : "v0.0"}
                  </div>
                  {/* 한 줄로 붙인다 — 좁은 타일이라 그냥 두면 «Domain Knowledge ×» / «AI» 로
                      접혀 곱셈 기호가 줄 끝에 걸린다. 두 층이 만난다는 뜻이 거기서 깨진다. */}
                  <p className="mt-2 whitespace-nowrap text-[0.75rem] font-medium leading-[1.5] text-body">
                    Domain&nbsp;Knowledge <span className="text-orange-deep">×</span> AI
                    {contract && contract.status !== "ACTIVE" && (
                      <span className="text-orange-deep"> · {contract.status === "NONE" ? "계약 없음" : contract.status}</span>
                    )}
                  </p>
                  <p className="mt-1 text-[0.75rem] leading-[1.5] text-faint">
                    DELPHi 공통 데이터 스키마
                  </p>
                </Link>
              </HoverTip>
            </Panel>

            <Panel pad="lg" className="flex flex-col md:col-span-2">
              <Eyebrow>수집 캘린더</Eyebrow>
              {/* 격자에 남는 세로를 다 준다 — 한 줄이 한 해다 */}
              <div className="mt-3 min-h-0 flex-1">
                <HeatDots monthly={coll.monthly} />
              </div>
              <p className="mt-auto pt-3 text-[0.75rem] leading-[1.6] text-faint">
                <b className="tabular-nums text-ink">{coll.monthly.length}개월</b> 연속 수집
              </p>
            </Panel>

            {/* 연도 비교 — 마지막 두 해의 언급이 아니라 **수집 블록** 비교다 */}
            <Panel pad="lg" className="flex flex-col md:col-span-2">
              <Eyebrow>연도 비교</Eyebrow>
              {yPrev && yLast ? (
                <>
                  <div className="mt-3 grid grid-cols-2 items-end gap-2">
                    {[{ y: yPrev, hot: false }, { y: yLast, hot: true }].map(({ y, hot }) => (
                      <HoverTip key={y.year}
                        tip={<>
                          <TipHead>{y.year}년 수집</TipHead>
                          <TipRow k="면담 블록" v={`${y.blocks}블록`} />
                          <TipRow k="독립 의료진" v={`${y.distinctHcp}인`} />
                        </>}
                      >
                        <div className="text-right text-[1rem] font-semibold tabular-nums text-ink">
                          {y.blocks}
                        </div>
                        <div className="mt-1 h-[22px] overflow-hidden rounded-md bg-fill-2">
                          <span className="block h-full rounded-md"
                                style={{
                                  width: `${((y.blocks / yMax) * 100).toFixed(1)}%`,
                                  background: hot
                                    ? "linear-gradient(90deg, var(--orange-bright), var(--orange-deep))"
                                    : "var(--line-2)",
                                }} />
                        </div>
                        <div className="mono mt-1 text-center text-[0.6875rem] text-faint">
                          &rsquo;{y.year.slice(2)}
                        </div>
                      </HoverTip>
                    ))}
                  </div>
                  <p className="mt-auto pt-2 text-[0.75rem] leading-[1.6] text-faint">
                    {annualized !== null
                      ? <>&rsquo;{yLast.year.slice(2)}은 {monthsElapsed}개월치 — 연환산{" "}
                          <b className="tabular-nums text-ink">{annualized}</b></>
                      : "두 해 모두 12개월치입니다."}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[0.75rem] text-faint">아직 두 해가 쌓이지 않았습니다.</p>
              )}
            </Panel>
          </div>
        )}

        {/* ── 벤토 B — 언급 집계 (결정론 키워드 매칭 · claim 아님) ── */}
        {ment && (
          <div className="mt-3.5 grid gap-3.5 lg:grid-cols-12">
            {/* 허가 밖 질환 — 상위 3 추세 */}
            <Panel pad="lg" className="lg:col-span-4">
              <div className="flex items-baseline gap-2.5">
                <Eyebrow>허가 밖 질환 — 상위 3 추세</Eyebrow>
                <span className="ml-auto"><Chip>관찰된 사실</Chip></span>
              </div>
              {top3.length > 0 ? (
                <>
                  <div className="mt-1 divide-y divide-[var(--line)]">
                    {top3.map((d, i) => (
                      <HoverTip key={d.key}
                        className="grid grid-cols-[26px_minmax(0,1.1fr)_minmax(0,1.3fr)_auto] items-center gap-2.5 py-3"
                        tip={<>
                          <TipHead>{d.ko}</TipHead>
                          <TipRow k="언급" v={`${d.blocks}블록`} />
                          <TipRow k="독립 의료진" v={`${d.distinctHcp}인`} />
                          <TipRow k="최근 12개월" v={`${d.r12}건`} />
                          <TipRow k="이전 12개월" v={`${d.p12}건`} />
                          {d.p12 > 0 && <TipRow k="증가" v={`▲ ${(d.r12 / d.p12).toFixed(1)}배`} />}
                          <TipNote>허가 범위 밖이라 전문조직 검토용으로만 표시합니다.</TipNote>
                        </>}
                      >
                        <span className="mono text-[1rem] font-semibold text-faint">0{i + 1}</span>
                        <div className="min-w-0">
                          <div className="text-[0.875rem] font-medium leading-[1.35] text-ink">{d.ko}</div>
                          <div className="mt-0.5 text-[0.75rem] text-faint">의료진 {d.distinctHcp}인</div>
                        </div>
                        <TrendSpark series={d.series} axis={axis} />
                        <div className="text-right">
                          <div className="text-[1.1rem] font-medium tabular-nums text-navy">
                            {d.blocks}
                            <span className="mono ml-0.5 text-[0.75rem] text-faint">블록</span>
                          </div>
                          {d.p12 > 0 && (
                            <span className="mono rounded-full bg-orange-soft px-1.5 py-px text-[0.6875rem] font-semibold text-orange-deep">
                              ▲ {(d.r12 / d.p12).toFixed(1)}×
                            </span>
                          )}
                        </div>
                      </HoverTip>
                    ))}
                  </div>
                  {restOff.length > 0 && (
                    <div className="border-t border-line pt-3">
                      <div className="text-[0.75rem] text-faint">그 외 허가 밖 질환</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {restOff.map((d) => (
                          <Chip key={d.key}>
                            {d.ko} <b className="tabular-nums text-navy">{d.blocks}</b>
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="mt-3 border-t border-line pt-2.5 text-[0.75rem] leading-[1.6] text-faint">
                    추세 = 최근 12개월 언급 블록 ÷ 이전 12개월 · 원문 결정론 집계 — 허가 밖 항목은
                    전문조직 검토 대상으로만 표시합니다.
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[0.875rem] leading-[1.7] text-muted">
                  허가 밖 질환 언급이 아직 없습니다.
                </p>
              )}
            </Panel>

            {/* 신호 유형 6축 — 계약의 신호 축 허용값과 같은 이름 */}
            <Panel pad="lg" className="lg:col-span-5">
              <div className="flex items-baseline gap-2.5">
                <Eyebrow>신호 유형 6축</Eyebrow>
                <span className="ml-auto"><Chip>관찰된 사실</Chip></span>
              </div>
              <div className="mt-4 space-y-1">
                {ment.signals.map((s) => {
                  const safetyAxis = s.key === "SAFETY_TOLERABILITY";
                  return (
                    <HoverTip key={s.key}
                      className="-mx-1.5 grid grid-cols-[minmax(0,132px)_1fr_auto] items-center gap-2.5
                                 rounded-lg px-1.5 py-1 hover:bg-fill-1"
                      tip={<>
                        <TipHead>{s.ko}</TipHead>
                        <TipRow k="언급" v={`${s.blocks}블록`} />
                        <TipRow k="독립 의료진" v={`${s.distinctHcp}인`} />
                        {safetyAxis && (
                          <TipNote>개별 부작용 의심 발언은 여기 들어오지 않고 안전성 경로로만 갑니다.</TipNote>
                        )}
                      </>}
                    >
                      <span className="truncate text-[0.875rem] text-body">{s.ko}</span>
                      <span className="h-[9px] overflow-hidden rounded-md bg-fill-2">
                        <span className="block h-full rounded-md"
                              style={{
                                width: `${((s.blocks / maxSignal) * 100).toFixed(1)}%`,
                                // 안전성 축만 네이비 톤 — 별도 경로 카드와 같은 신호라는 표시 (#6)
                                background: safetyAxis
                                  ? "#97A2C4"
                                  : "linear-gradient(90deg, var(--orange-bright), var(--orange-deep))",
                              }} />
                      </span>
                      <span className="whitespace-nowrap text-right">
                        <b className="text-[0.9375rem] font-semibold tabular-nums text-ink">{s.blocks}</b>
                        <span className="mono ml-1 text-[0.75rem] tabular-nums text-faint">{s.distinctHcp}인</span>
                      </span>
                    </HoverTip>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3.5">
                {CROSS_CHIPS.map((c) => {
                  const v = ment.cross[c.key];
                  if (!v) return null;
                  return (
                    <HoverTip key={c.key}
                      tip={<>
                        <TipHead>{c.label}</TipHead>
                        <TipRow k="언급" v={`${v.blocks}블록`} />
                        <TipRow k="독립 의료진" v={`${v.distinctHcp}인`} />
                      </>}
                    >
                      <Chip>
                        {c.label} <b className="tabular-nums text-orange-deep">{v.blocks}</b>
                      </Chip>
                    </HoverTip>
                  );
                })}
              </div>
              <p className="mt-3 text-[0.75rem] leading-[1.6] text-faint">
                「써봤다」와 「막혔다」를 가르는 것이 이 축의 요점입니다 — 규제상·전략상 전혀 다른
                신호입니다. 칩은 환자군 × 신호 교차의 언급 블록 수입니다.
              </p>
            </Panel>

            {/* 안전성 언급 — 별도 경로. 이 카드의 숫자는 다른 어떤 집계에도 들어가지 않는다 (#6). */}
            <Panel tone="note" pad="lg" className="lg:col-span-3">
              <div className="flex items-baseline gap-2.5">
                <Eyebrow>안전성 언급</Eyebrow>
                <span className="ml-auto"><Chip tone="orange">별도 경로</Chip></span>
              </div>
              <HoverTip
                tip={<>
                  <TipHead>안전성 언급 분해</TipHead>
                  <TipRow k="반복 패턴 (집계 대상)" v={`${ment.safety.tolerabilityBlocks}블록`} />
                  <TipRow k="개별 사례 (분리 경로)" v={`${ment.safety.aeBlocks}블록`} />
                  <TipRow k="미분류" v={`${ment.safety.unclassifiedBlocks}블록`} />
                  <TipNote>세 칸은 겹치지 않습니다. 애매한 문장은 넘겨짚지 않고 미분류로 둡니다.</TipNote>
                </>}
              >
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-[1.7rem] font-medium leading-none tabular-nums text-navy">
                    {safetyTotal}
                  </span>
                  <span className="mono text-[0.8125rem] text-faint">블록</span>
                </div>
                {/* 세그먼트 바 — 셋은 겹치지 않는 칸이라 나란히 그려도 합산이 아니다 */}
                <div className="mt-3 flex h-[9px] gap-[2px] overflow-hidden rounded-md">
                  {[
                    { n: ment.safety.tolerabilityBlocks, bg: "var(--navy)" },
                    { n: ment.safety.aeBlocks, bg: "linear-gradient(90deg, var(--orange-bright), var(--orange-deep))" },
                    { n: ment.safety.unclassifiedBlocks, bg: "var(--line-2)" },
                  ].map((seg, i) => (
                    <span key={i} className="h-full rounded-[2px]"
                          style={{ width: `${((seg.n / Math.max(1, safetyTotal)) * 100).toFixed(1)}%`, background: seg.bg }} />
                  ))}
                </div>
              </HoverTip>
              <div className="mt-3 space-y-1.5">
                {[
                  { label: "집계 대상 — 반복 패턴", n: ment.safety.tolerabilityBlocks, dot: "var(--navy)" },
                  { label: "분리 경로 — 개별 사례", n: ment.safety.aeBlocks, dot: "var(--orange-deep)" },
                  { label: "미분류 — 사람이 읽음", n: ment.safety.unclassifiedBlocks, dot: "var(--line-2)" },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-2 text-[0.8125rem]">
                    <span className="size-2 flex-none rounded-full" style={{ background: r.dot }} />
                    <span className="min-w-0 flex-1 truncate text-body">{r.label}</span>
                    <b className="tabular-nums text-ink">{r.n}</b>
                  </div>
                ))}
              </div>
              {ment.safety.tol.length > 0 && (
                <div className="mt-3 border-t border-line pt-2.5">
                  <div className="text-[0.75rem] text-faint">집계 대상 상위</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ment.safety.tol.slice(0, 4).map((t) => (
                      <Chip key={t.key}>{t.ko} <b className="tabular-nums text-navy">{t.blocks}</b></Chip>
                    ))}
                  </div>
                </div>
              )}
              {ment.safety.ae.length > 0 && (
                <div className="mt-2.5">
                  <div className="text-[0.75rem] text-faint">분리 경로 상위</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ment.safety.ae.slice(0, 4).map((t) => (
                      <Chip key={t.key}>{t.ko} <b className="tabular-nums text-navy">{t.blocks}</b></Chip>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-3 border-t border-line pt-2.5 text-[0.75rem] leading-[1.6] text-faint">
                개별 이상사례 <b className="tabular-nums text-ink">{ment.safety.aeBlocks}건</b>은 일반
                분석과 섞이지 않고 safety 경로로만 전달됩니다.{" "}
                <Link href="/safety" className="whitespace-nowrap text-navy underline underline-offset-2">
                  안전성 경로 →
                </Link>
              </p>
            </Panel>
          </div>
        )}

        {/* ── 벤토 C — 수집의 시간축과 공간축 ── */}
        {coll && (
          <div className="mt-3.5 grid gap-3.5 lg:grid-cols-12">
            <Panel pad="lg" className="lg:col-span-7">
              <div className="flex items-baseline gap-2.5">
                <Eyebrow>월별 수집 추이</Eyebrow>
                <span className="ml-auto"><Chip>관찰된 사실</Chip></span>
              </div>
              <div className="mt-3">
                <CollectTrend monthly={coll.monthly} />
              </div>
            </Panel>
            <Panel pad="lg" className="lg:col-span-5">
              <div className="flex items-baseline gap-2.5">
                <Eyebrow>권역 밀도</Eyebrow>
                <span className="ml-auto"><Chip>통계적 패턴</Chip></span>
              </div>
              <div className="mt-4 space-y-1.5">
                {regions.map((r, i) => (
                  <HoverTip key={r.region}
                    className="-mx-1.5 grid grid-cols-[44px_1fr_auto] items-center gap-2.5 rounded-lg
                               px-1.5 py-1 hover:bg-fill-1"
                    tip={<>
                      <TipHead>{REGION_KO[r.region] ?? r.region}</TipHead>
                      <TipRow k="면담 블록" v={`${r.blocks}블록`} />
                      <TipRow k="독립 의료진" v={`${r.distinctHcp}인`} />
                      <TipRow k="최근 1년 접촉" v={`${r.recentHcp}인`} />
                      <TipRow k="2년 넘게 공백" v={`${r.gapHcp}인`} />
                    </>}
                  >
                    <span className="text-[0.875rem] font-medium text-ink">
                      {REGION_KO[r.region] ?? r.region}
                    </span>
                    <span className="h-[9px] overflow-hidden rounded-md bg-fill-2">
                      <span
                        className="block h-full rounded-md"
                        style={{
                          width: `${((r.blocks / maxRegionBlocks) * 100).toFixed(1)}%`,
                          background: i === 0
                            ? "linear-gradient(90deg, var(--orange-bright), var(--orange-deep))"
                            : "var(--navy)",
                          opacity: i === 0 ? 1 : 0.78,
                        }}
                      />
                    </span>
                    <span className="whitespace-nowrap text-right">
                      <b className="text-[0.9375rem] font-semibold tabular-nums text-ink">{r.blocks}</b>
                      <b className={`ml-1.5 rounded-full px-1.5 py-px text-[0.6875rem] tabular-nums ${
                        i === 0 ? "bg-orange-soft text-orange-deep" : "bg-fill-2 text-muted"}`}>
                        {(r.blocks / Math.max(1, r.distinctHcp)).toFixed(2)}/인
                      </b>
                    </span>
                  </HoverTip>
                ))}
              </div>
              {topRegion && (
                <p className="mt-4 border-t border-line pt-3 text-[0.8125rem] leading-[1.7] text-muted">
                  <b className="text-ink">{REGION_KO[topRegion.region] ?? topRegion.region}</b>는 의료진{" "}
                  <b className="tabular-nums text-ink">{topRegion.distinctHcp}인</b>
                  {topIsFewest ? "으로 가장 적지만" : "이고"} 1인당{" "}
                  <b className="tabular-nums text-ink">
                    {(topRegion.blocks / Math.max(1, topRegion.distinctHcp)).toFixed(2)}건
                  </b>{" "}
                  — 최근 1년 접촉 <b className="tabular-nums text-ink">{topRegion.recentHcp}인</b>.{" "}
                  <Link href="/analytics?tab=kol" className="whitespace-nowrap text-navy underline underline-offset-2">
                    권역 지도 →
                  </Link>
                </p>
              )}
            </Panel>
          </div>
        )}

        {/* 방법 — 위 언급 타일들이 무엇을 어떻게 셌는지, 서버의 설명을 그대로 싣는다 */}
        {ment && (
          <div className="mt-3.5 flex items-start gap-3 rounded-2xl border border-line bg-fill-1 px-4 py-3">
            <span className="mono mt-0.5 flex-none rounded bg-navy px-1.5 py-0.5 text-[0.6875rem] font-bold text-on-navy">
              방법
            </span>
            <p className="text-[0.75rem] leading-[1.7] text-muted">
              {ment.noteKo}{" "}
              <span className="mono text-faint">computedBy {ment.computedBy}</span>
            </p>
          </div>
        )}

        {/* ── 판독 파이프라인 — 여기부터는 LLM 추출 claim 기준 집계다 (언급과 다른 층) ── */}
        {!backendDown && (
          <section className="mt-14 border-t border-line pt-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <Eyebrow>판독 파이프라인 · claim 기준</Eyebrow>
              <span className="text-[0.8125rem] leading-[1.6] text-muted">
                위 언급 집계와 층이 다릅니다 — 여기부터는 근거 위치가 연결된 추출 claim 입니다.
              </span>
              {/* 08/30(#115): 「공식 N · 잠정 M — 나란히 표기, 합산하지 않음」이었다.
                  승인이 수집 시점으로 옮겨져 «승인을 기다리는 잠정»이 없어졌으므로, 여기서
                  말할 것은 두 숫자의 관계가 아니라 **승인이 어디서 찍혔고 무엇이 남았는가**다.
                  나란히·합산 금지 규율이 살아 있는 곳은 아래 분석 탭이다. */}
              {kpis && (
                <span className="mono ml-auto text-[0.75rem] tabular-nums text-faint">
                  적재 시 승인 {kpis.approvedClaims.toLocaleString()} · 검증에 걸려 사람 몫으로{" "}
                  {kpis.pendingReviews.toLocaleString()}
                </span>
              )}
            </div>
            <div className="mt-4">
              <KpiStrip stages={stages} />
            </div>
          </section>
        )}

        {/* ── 신호 지도 (유지) ── */}
        <section className="mt-14 border-t border-line pt-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <Eyebrow>신호 지도</Eyebrow>
            <span className="text-[0.8125rem] leading-[1.6] text-muted">
              칸 크기는 <b className="text-ink">반복 횟수</b>, 진하기는{" "}
              <b className="text-ink">독립 의료진 수</b>입니다 — 가설이 되려면 둘 다 넘어야 합니다.
            </span>
            <span className="ml-auto">
              <Chip>SQL 집계</Chip>
            </span>
          </div>
          {cells.length > 0 ? (
            <>
              <div className="mt-4">
                <SignalMapInteractive cells={cells} hypBySegment={hypBySegment} />
              </div>
              <SignalGlossary />
              <p className="mt-3 text-[0.8125rem] leading-[1.7] text-muted">
                <b className="text-ink">크지만 옅은 칸은 한두 사람이 반복한 것</b>이라 임계는 넘어도
                신호로는 약합니다. 그 구분이 이 화면의 요점입니다 — 반복 횟수만 보면 안 보입니다.
                칸을 누르면 그 환자군의 가설로 이동합니다.
              </p>
            </>
          ) : (
            <div className="mt-4">
              <Placeholder title="아직 표시할 신호가 없습니다.">
                백엔드 연결 후 추출이 쌓이면 이 자리에 신호 지도가 채워집니다.{" "}
                <Link href="/pipeline" className="text-navy underline underline-offset-2">
                  AI Readable 전환 열기 →
                </Link>
              </Placeholder>
            </div>
          )}
        </section>

        {/* ── 푸터 — 이 화면 숫자의 두 가지 약속 (유지) ── */}
        <div className="mt-14 grid gap-x-10 gap-y-6 border-t border-line pt-5 lg:grid-cols-2">
          <div className="flex items-start gap-3">
            <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden className="mt-0.5 flex-none">
              <path d="M2,2 C16,2 12,14 30,14" stroke="var(--rust)" strokeWidth="1.5"
                    strokeDasharray="3 3" strokeOpacity="0.7" fill="none" />
              <path d="M28,10.5 L33,14 L27.5,15.5 Z" fill="var(--rust)" fillOpacity="0.7" />
            </svg>
            <p className="text-[0.8125rem] leading-[1.7] text-muted">
              부작용(AE) 의심 발언은 추출 단계에서 빠져나갑니다 —{" "}
              <b className="text-ink">위 안전성 카드 밖 어떤 숫자에도 들어가지 않습니다</b> (절대
              규칙 #6).{" "}
              <Link href="/safety" className="whitespace-nowrap text-navy underline underline-offset-2">
                안전성 경로 →
              </Link>
            </p>
          </div>
          <p className="text-[0.8125rem] leading-[1.7] text-muted">
            모든 수치는 서버 계산입니다 — SQL 또는 결정론적 코드이고, 화면은 세지 않습니다 (절대
            규칙 #1).{" "}
            <Link href="/review/field" className="whitespace-nowrap text-navy underline underline-offset-2">
              현장 수집분 보기 →
            </Link>
            <br />
            {kpis && (
              <span className="mono text-faint">
                computedBy {kpis.computedBy} · asOf{" "}
                {new Date(kpis.asOf).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </span>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
