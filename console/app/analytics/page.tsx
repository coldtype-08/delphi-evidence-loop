/**
 * 분석 — 홈 대시보드의 서브탭 (08/28).
 *
 * 홈은 "라인이 지금 어디까지 왔나"를 말한다. 이 화면은 **그래서 무엇이 보이는가**를
 * 말한다. 네 탭이 전부 같은 재료를 다른 축으로 자른 것이다:
 *   환자군 확장 = 환자군 축 · 안전성 = 분리 경로 · KOL = 사람 축 · 추이 = 시간 축
 *   (개요는 홈 자체다 — 신호 지도가 거기 있다)
 *
 * **08/29: 「신규 적응증」 탭을 뺐다** (팀장: "환자군 확장이랑 겹치는 거 같은데").
 * 질환 표현 52종의 대부분은 새 질환이 아니라 같은 환자군의 다른 표기였다 —
 * 별도 축이 아니라 표기 정규화 재료이므로 「온톨로지」 화면이 다룬다.
 *
 * **같은 날 덜어낸 것** (팀장: "괜히 헷갈려"): 승인 표시(오렌지 테두리)·허가 범위 배지·
 * KPI 카드 둘·표기 변이 패널. 허가 범위는 **아래 표 한 곳**에만 남기고 각주를 달았다.
 *
 * 이 화면이 지키는 것 (전부 서버 컴포넌트 — 브라우저에서 숫자를 만들지 않는다):
 *  - 절대 규칙 #1: 모든 숫자는 `/analytics/*`·`/aggregates/*`의 SQL 값 그대로.
 *    **합성 점수를 만들지 않는다** — 목업의 "우선순위 434.2" 같은 가중합은 쓰지 않고,
 *    센 값(독립 의료진 수 → 언급 수)으로 정렬만 한다 (08/27 팀장 확인).
 *  - 절대 규칙 #3: 잠정(CANDIDATE 포함)과 공식(APPROVED)을 **나란히**. 합치지 않는다.
 *  - 절대 규칙 #5: 허가 범위(In-label · Off-label)는 **아래 표 한 곳**에만 표시한다 (08/29).
 *  - 절대 규칙 #6: 안전성은 별도 경로 — 다른 탭의 어떤 숫자에도 들어가지 않는다.
 *  - 절대 규칙 #7: KOL은 처방성향 점수가 아니라 **발언 수**다. 실명·소속은 시스템에 없다.
 */

import Link from "next/link";
import { api } from "@/lib/api";
import { Panel, Eyebrow, Chip, Topbar, TableFrame, TH, TD, Quote } from "@/app/components/ui";
import AnalyticsTabs, { ANALYTICS_TABS } from "./_tabs";
import { Heatmap, Bars, StackedPair, SignalMatrix, CoverageGrid, CoverageLegend,
         type CoverageRow } from "./_viz";
import { SIGNAL_KO, SIGNAL_ORDER, MatrixLegend, toSignalCells } from "./_signals";
import CollectionView from "@/app/collection/_view";
import type { RegionMentions, RegionRow } from "@/app/collection/_tilemap";
import type { MonthPoint } from "@/app/components/collect-trend";

export const dynamic = "force-dynamic";

/* ── 응답 모양 (docs/04) ─────────────────────────────────────────── */
type Pair = { claimCount: number; distinctHcp?: number; distinctRegions?: number; usedCount?: number };
type Cond = { condition: string; official: Pair; lastMentionAt: string | null;
               provisional: { claimCount: number; distinctHcp: number; distinctRegions: number; usedCount: number };
               /** 그 표현이 어느 환자군의 claim 에 붙어 있나 (08/29 신설) — 표기 변이를 되묶는 열쇠 */
               segments?: { segment: string; claimCount: number }[] };
type Seg = {
  segment: string; labelKo: string; labelScope: string; unclassified: boolean;
  provisional: Pair; official: Pair; lastMentionAt: string | null; hypothesisIds: string[];
};
type Kol = {
  hcpRef: string; specialty: string; region: string;
  provisional: { claimCount: number; highGradeCount: number; distinctSegments: number };
  official: { claimCount: number; highGradeCount: number };
  lastClaimAt: string | null;
};
type Saf = {
  id: string; interactionId: string; verbatimQuote: string; eventTerms: string | null;
  severityNote?: string | null; routedAt: string | null; status: string;
  evidence?: { docId?: string; charStart?: number; charEnd?: number } | null;
};
type SafTier = {
  tier: string; labelKo: string; whatKo: string; whyKo: string; actionKo: string; count: number;
  groups: { tier: string; labelKo: string; whyKo: string; count: number;
            terms: { term: string; count: number }[] }[];
};
type SafSum = {
  total: number; unnamedCount: number;
  /** 세 칸 — 참조표(`backend/app/safety_reference.yaml`)를 대조한 결과 (08/29) */
  tiers?: SafTier[];
  reference?: { version: string; sourceKo: string; noteKo: string;
                rows: { tier: string; tierKo: string; labelKo: string;
                        keywords: string[]; whyKo: string }[] };
  byTerm: { term: string; count: number }[];
  monthly: { month: string; count: number }[];
  byRegion: { region: string; count: number }[];
};
type Cov = {
  regions: { region: string; labelKo: string }[];
  rows: (CoverageRow & { sample?: {
    claimId: string; quote: string; signalType: string; reviewGrade: string;
    hcpRef: string; region: string; occurredOn: string;
    evidence: { docId: string | null; charStart: number | null; charEnd: number | null };
  } })[];
  threshold: { repeat: number; hcp: number };
};
type Sig = {
  patientSegment: string; signalType: string; claimCount: number;
  provisional: { claimCount: number; distinctHcp: number; distinctRegions: number;
                 monthly: { month: string; count: number }[] };
  monthly: { month: string; count: number }[];
};

const day = (s: string | null) => (s ? s.slice(0, 10) : "—");

/* 잠정/공식을 한 칸에 나란히 — 합치지 않는다는 것이 눈에 보이게 (절대 규칙 #3) */
function Pairs({ prov, offi, unit = "" }: { prov: number; offi: number; unit?: string }) {
  return (
    <span className="mono whitespace-nowrap">
      <b className="font-medium text-navy">{prov.toLocaleString("ko-KR")}</b>
      <span className="text-faint">{unit} / </span>
      <b className={offi > 0 ? "font-medium text-orange-deep" : "text-navy/35"}>{offi.toLocaleString("ko-KR")}</b>
      <span className="text-faint">{unit}</span>
    </span>
  );
}

function Head({ title, desc, tone }: { title: string; desc: string; tone?: "safety" }) {
  return (
    <>
      <h1 className="mt-5 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">{title}</h1>
      <p className={`mt-1.5 max-w-[74ch] text-[0.9375rem] leading-[1.7] ${tone === "safety" ? "text-rust" : "text-navy/58"}`}>
        {desc}
      </p>
    </>
  );
}

/** 카드 세 장 — 탭마다 "무엇을 몇 개 보고 있나" */
function Kpis({ items }: { items: { label: string; value: string | number; note: string; tone?: "orange" }[] }) {
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-3">
      {items.map((k) => (
        <Panel key={k.label} pad="lg">
          <Eyebrow>{k.label}</Eyebrow>
          <div className={`mt-1.5 text-[1.7rem] font-bold leading-none ${k.tone === "orange" ? "text-orange-deep" : "text-navy"}`}>
            {typeof k.value === "number" ? k.value.toLocaleString("ko-KR") : k.value}
          </div>
          <p className="mt-2 text-[0.8125rem] leading-[1.6] text-muted">{k.note}</p>
        </Panel>
      ))}
    </div>
  );
}

/** 잠정/공식 범례 — 표마다 한 번 (숫자의 뜻을 화면이 설명한다).
 *
 * 08/30(#115): 「공식은 **사람이 승인한 것**」이었다. 규칙 #3 개정으로 승인이 «수집
 * 시점»으로 옮겨지면서 공식의 대부분이 사람이 아무도 안 누른 자동 승인분
 * (`reviewed_by = BATCH_INGEST`)이 됐다 — 그대로 두면 오렌지 면적이 «사람이 얼마나
 * 봤나»로 읽힌다. 실제로 그 면적이 뜻하는 것은 **검증(H/M)을 통과했나**다.
 * 나란히·합산 금지는 그대로다 — 여기는 집계·분석 화면이고, 그 규율이 사는 자리다. */
function PairLegend() {
  return (
    <p className="mono mt-2 text-[0.75rem] text-navy/40">
      <b className="font-medium text-navy">잠정</b>
      <span className="text-faint"> / </span>
      <b className="font-medium text-orange-deep">공식</b> — 잠정은 검증에 걸린 행까지 포함,
      공식은 적재 시점에 승인된 것(검증 통과분 + 현장 수집자 승인분).
      두 숫자를 더하지 않습니다.
    </p>
  );
}

/** 도식 한 장 — 제목 + 무엇을 보는 그림인지 한 줄, 그 아래 그림.
 *  그림에는 축 설명이 붙어야 한다. 붙지 않으면 예쁜 장식이 된다. */
function Figure({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <Panel pad="lg" className="mt-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Eyebrow>{title}</Eyebrow>
        <span className="text-[0.8125rem] leading-[1.6] text-muted">{hint}</span>
      </div>
      <div className="mt-3">{children}</div>
    </Panel>
  );
}


/** 안전성 87건을 셋으로 — «그래서 무엇을 하는가»로 나눈다 (08/29 팀장 요청).
 *
 * 주루룩 늘어놓으면 무엇부터 볼지가 화면에 없다. 나누는 근거는 서버의
 * `safety_reference.yaml` 이고, 그 표를 아래에 접어 그대로 보여준다 —
 * **누가 무엇을 근거로 «유심히 볼 것»이라 했는지 읽을 수 있어야** 화면이 신뢰를 얻는다.
 *
 * 「중점 추적」이 라벨에 있는데도 따로 있는 이유: 발진·간 수치는 이 약 라벨이
 * DRESS(다기관 과민반응)로 경고한 계열이라 **알려졌더라도 건수 변화를 계속 봐야** 한다.
 * 흔한 어지러움·졸림과 같은 칸에 두면 늘어나도 눈에 안 띈다.
 */
function SafetyTiers({ tiers, total, reference }: {
  tiers: SafTier[]; total: number;
  reference?: SafSum["reference"];
}) {
  const tone = (t: string) =>
    t === "WATCH" ? { bar: "bg-rust", chip: "bg-rust-soft text-rust", text: "text-rust" }
    : t === "NEW" ? { bar: "bg-orange", chip: "bg-orange-soft text-orange-deep", text: "text-orange-deep" }
    : { bar: "bg-navy/25", chip: "bg-navy/[.06] text-body", text: "text-navy" };
  const maxGroup = Math.max(1, ...tiers.flatMap((t) => t.groups.map((g) => g.count)));
  return (
    <Panel pad="lg" className="mt-4">
      <div className="flex h-[34px] overflow-hidden rounded-lg bg-navy/[.035]">
        {tiers.map((t) => (
          <div key={t.tier} title={`${t.labelKo} ${t.count}건`}
               className={`flex min-w-[28px] items-center justify-center ${tone(t.tier).bar}`}
               style={{ width: `${(t.count / Math.max(1, total)) * 100}%` }}>
            <span className={`mono text-[0.9375rem] font-medium ${t.tier === "KNOWN" ? "text-navy" : "text-on-navy"}`}>
              {t.count}
            </span>
          </div>
        ))}
      </div>

      {/* 기준을 접지 않는다 — 무엇을 근거로 갈랐는지가 이 화면의 절반이다 */}
      <div className="mt-3.5 grid gap-2.5 md:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.tier}
               className={`rounded-xl border px-4 py-3 ${
                 t.tier === "WATCH" ? "border-rust/40 bg-rust-soft"
                 : t.tier === "NEW" ? "border-orange/40 bg-orange-soft/40"
                 : "border-glass-line bg-card"}`}>
            <div className="flex items-center gap-2">
              <span className={`block size-[11px] shrink-0 rounded-[3px] ${tone(t.tier).bar}`} />
              <b className={`text-[1rem] font-bold ${tone(t.tier).text}`}>{t.labelKo}</b>
              <span className={`mono ml-auto text-[1.1rem] font-medium ${tone(t.tier).text}`}>{t.count}</span>
            </div>
            <p className="mt-2 text-[0.875rem] leading-[1.6] text-ink"
               dangerouslySetInnerHTML={{ __html: t.whatKo }} />
            {t.whyKo && <p className="mt-1 text-[0.8125rem] leading-[1.6] text-muted">{t.whyKo}</p>}
            <p className="mt-1.5 border-t border-dashed border-line-2 pt-1.5 text-[0.8125rem] leading-[1.55] text-faint">
              {t.actionKo}
            </p>
          </div>
        ))}
      </div>

      {tiers.map((t) => (
        <div key={t.tier}>
          <div className={`mono mt-5 mb-2 text-[0.75rem] uppercase tracking-[0.12em] ${tone(t.tier).text} opacity-80`}>
            {t.labelKo}
          </div>
          {t.groups.map((g) => (
            <div key={g.labelKo} className="border-t border-line py-3 first:border-t-0">
              <div className="flex items-baseline gap-2">
                <b className={`text-[1rem] font-bold ${tone(t.tier).text}`}>{g.labelKo}</b>
                <span className={`mono ml-auto text-[1.02rem] font-medium ${tone(t.tier).text}`}>{g.count}</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-navy/[.035]">
                <div className={`h-full rounded-full ${tone(t.tier).bar}`}
                     style={{ width: `${(g.count / maxGroup) * 100}%` }} />
              </div>
              {g.whyKo && <p className="mt-2 text-[0.8125rem] leading-[1.6] text-muted">{g.whyKo}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.terms.slice(0, 5).map((x) => (
                  <span key={x.term} className={`rounded-full px-2.5 py-[3px] text-[0.8125rem] ${tone(t.tier).chip}`}>
                    {x.term} <b className="mono font-medium opacity-60">{x.count}</b>
                  </span>
                ))}
                {g.terms.length > 5 && (
                  <span className="rounded-full border border-dashed border-line-2 px-2.5 py-[3px] text-[0.8125rem] text-faint">
                    +{g.terms.length - 5}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {reference && (
        <details className="mt-5 border-t border-line pt-3.5">
          <summary className="cursor-pointer list-none text-[0.875rem] text-muted marker:content-none">
            ▸ 근거표 — 어떤 말이 어느 칸으로 가나 (사람이 확정합니다 · v{reference.version})
          </summary>
          <p className="mt-2.5 text-[0.8125rem] leading-[1.7] text-faint">
            출처: {reference.sourceKo} · {reference.noteKo}
          </p>
          <TableFrame className="mt-2.5">
            <tbody>
              {reference.rows.map((r) => (
                <tr key={r.labelKo}>
                  <td className={TD}>
                    <span className={`mono rounded-full px-2 py-0.5 text-[0.75rem] ${tone(r.tier).chip}`}>
                      {r.tierKo}
                    </span>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-navy`}>{r.labelKo}</td>
                  <td className={`${TD} mono text-[0.8125rem] text-muted`}>{r.keywords.join(" · ") || "—"}</td>
                  <td className={`${TD} text-[0.875rem] leading-[1.6]`}>{r.whyKo}</td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </details>
      )}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════ */

async function Segments() {
  const [d, sig] = await Promise.all([
    api<{ rows: Seg[] }>("/analytics/segments"),
    api<{ rows: Sig[] }>("/aggregates/signals").catch(() => ({ rows: [] as Sig[] })),
  ]);
  const known = d.rows.filter((r) => !r.unclassified);
  const segLabel: Record<string, string> = Object.fromEntries(d.rows.map((r) => [r.segment, r.labelKo]));
  const segScope: Record<string, string> = Object.fromEntries(d.rows.map((r) => [r.segment, r.labelScope]));
  // 격자의 재료 — 환자군 × 신호 유형은 서버가 이미 세어 준다. 화면은 칸에 배치만 한다.
  const cells = toSignalCells(sig.rows, segLabel, segScope);
  const un = d.rows.find((r) => r.unclassified);

  return (
    <>
      <Head
        title="환자군 확장"
        desc="계약이 정의한 환자군별 신호입니다."
      />
      <Kpis
        items={[
          { label: "환자군", value: known.length, note: "계약 v1.8의 허용값 · SCP로만 늘어납니다" },
        ]}
      />
      <Figure
        title="환자군별 발언 — 잠정 안에 든 공식"
        hint="연한 막대가 잠정, 그 안의 오렌지가 승인된 공식입니다 — 적재 시점에 검증을 통과한 것과 현장 수집자가 승인한 것. 겹쳐 그린 것은 두 숫자를 더하지 않는다는 뜻입니다."
      >
        <StackedPair
          rows={known.map((r) => ({
            // 라벨의 괄호 설명과 범위 배지는 뺀다 — 아래 표에 있고, 여기선 한 줄이 두 줄로 넘친다
            key: r.segment, label: r.labelKo.split(" (")[0],
            prov: r.provisional.claimCount, offi: r.official.claimCount,
          }))}
        />
      </Figure>

      {cells.length > 0 && (
        <Figure
          title="환자군이 하는 말의 종류"
          hint="가로로 훑으면 «이 환자군이 무슨 말을 하나», 세로로 훑으면 «이 신호를 누가 말하나»가 나옵니다. 큰 숫자가 반복 횟수, 아래 작은 숫자가 독립 의료진 수 — 가설이 되려면 둘 다 넘어야 합니다."
        >
          <SignalMatrix cells={cells} signals={SIGNAL_ORDER} />
          <MatrixLegend />
          <p className="mt-2 text-[0.8125rem] leading-[1.7] text-muted">
            허가 범위(In-label · Off-label)는 <b className="text-ink">아래 표 한 곳</b>에만 표시합니다 —
            카드·격자·설명 세 군데에 흩어져 있으면 같은 말이 세 번 나옵니다.
          </p>
        </Figure>
      )}


      <TableFrame className="mt-4">
        <thead>
          <tr>
            <th className={TH}>환자군</th>
            <th className={TH}>허가 범위</th>
            <th className={TH}>언급 (잠정/공식)</th>
            <th className={TH}>독립 의료진</th>
            <th className={TH}>권역</th>
            <th className={TH}>가설</th>
            <th className={TH}>최근 발언</th>
          </tr>
        </thead>
        <tbody>
          {known.map((r) => (
            <tr key={r.segment}>
              {/* 괄호 설명은 자른다 — 바로 옆 칸의 In-label / Off-label 칩이 같은 말을 한다 */}
              <td className={`${TD} font-medium text-navy`}>
                {r.labelKo.split(" (")[0]}
                {r.labelKo !== r.segment && (
                  <span className="mono ml-1.5 text-[0.75rem] text-navy/35">{r.segment}</span>
                )}
              </td>
              {/* 08/29: 「범위 밖 · Development」 → 영문 정식 표기. 뜻은 표 아래 각주가 말한다 —
                  같은 설명을 칩마다 반복하면 표가 안 읽힌다 (팀장). */}
              <td className={TD}>
                {r.labelScope === "OUT_OF_LABEL"
                  ? <Chip tone="orange">Off-label</Chip>
                  : <Chip>In-label</Chip>}
              </td>
              <td className={TD}><Pairs prov={r.provisional.claimCount} offi={r.official.claimCount} /></td>
              <td className={`${TD} mono`}>
                <Pairs prov={r.provisional.distinctHcp ?? 0} offi={r.official.distinctHcp ?? 0} unit="인" />
              </td>
              <td className={`${TD} mono text-navy/60`}>{r.provisional.distinctRegions}</td>
              <td className={TD}>
                {r.hypothesisIds.length > 0 ? (
                  <Link href="/hypotheses" className="mono text-orange-deep underline underline-offset-2">
                    {r.hypothesisIds.join(", ")}
                  </Link>
                ) : <span className="text-navy/25">—</span>}
              </td>
              <td className={`${TD} mono text-navy/55`}>{day(r.lastMentionAt)}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
      <p className="mt-2 text-[0.8125rem] leading-[1.8] text-muted">
        <b className="text-ink">In-label</b> — 현재 허가된 적응증 범위 <b className="text-ink">안</b>.<br />
        <b className="text-ink">Off-label</b> — 허가 범위 <b className="text-ink">밖</b>. 전문조직 검토 대상으로만
        전달되고, 이 값을 근거로 한 가설은 자동으로 Development 경로로 갑니다.
      </p>
      <PairLegend />
      {un && (
        <Panel tone="note" pad="md" className="mt-3 text-[0.875rem] leading-[1.75] text-ink">
          <b className="text-navy">미분류 {un.provisional.claimCount.toLocaleString("ko-KR")}건</b>
          {" "}({un.provisional.distinctHcp}인 · {un.provisional.distinctRegions}개 권역) — 계약에
          담을 칸이 없어 <code className="mono text-[0.8125rem]">UNSPECIFIED</code>로 떨어진 발언입니다.{" "}
          <b className="text-navy">이것이 구조 루프의 재료입니다</b> — 반복되는 것이 있으면
          처리 라인의 <Link href="/pipeline" className="font-medium text-orange-deep underline underline-offset-2">
          [라인 밖 도구 · 환자군 공백 해소]</Link>에서 새 환자군 후보로 올립니다.
        </Panel>
      )}
    </>
  );
}

async function Safety() {
  // 이 엔드포인트만 배열을 그대로 준다 (다른 analytics 는 {rows}). 둘 다 받는다 —
  // 모양을 화면에서 맞춰 두면, 스펙이 정리될 때 여기만 지우면 된다.
  const [raw, sum] = await Promise.all([
    api<Saf[] | { rows: Saf[] }>("/safety/candidates", { role: "SAFETY" }),
    api<SafSum>("/analytics/safety-summary", { role: "SAFETY" })
      .catch(() => null),
  ]);
  const rows = Array.isArray(raw) ? raw : (raw.rows ?? []);
  const named = rows.filter((r) => (r.eventTerms ?? "").trim().length > 0);
  return (
    <>
      <Head
        title="안전성 신호"
        desc="부작용 의심 발언은 발견 즉시 이 경로로 분리됩니다. 가설·심의·집계 어디에도 섞이지 않습니다."
        tone="safety"
      />
      <Panel tone="note" pad="md" className="mt-3 text-[0.875rem] leading-[1.7] text-ink">
        <b className="text-rust">안전성 담당자 전용 뷰입니다.</b> 여기 있는 발언은 다른 어떤
        탭의 숫자에도 들어가지 않습니다. 등급 판정은 이 화면이 하지 않습니다 — PV 관할입니다.
      </Panel>
      <Kpis
        items={[
          { label: "분리된 발언", value: rows.length, note: "자동 탐지 후 즉시 이관 · 사람 확인 대기", tone: "orange" },
          { label: "이상반응 용어 붙음", value: named.length, note: "언급된 표현 그대로 · 판정하지 않습니다" },
          { label: "심의 반영", value: 0, note: "설계상 항상 0 — 가설·집계와 섞이지 않습니다" },
        ]}
      />
      {sum?.tiers && sum.tiers.length > 0 && (
        <SafetyTiers tiers={sum.tiers} total={sum.total} reference={sum.reference} />
      )}
      {sum && (
        <>
          <Figure
            title="언급된 표현"
            hint="표현을 그대로 셉니다 — 등급도 인과도 매기지 않습니다. 같은 표현이 여러 번 나오면 그것이 볼 이유입니다."
          >
            <Bars tone="rust" unit="건"
              rows={sum.byTerm.map((t) => ({ key: t.term, label: t.term, value: t.count }))}
            />
            {sum.unnamedCount > 0 && (
              <p className="mono mt-3 text-[0.75rem] text-navy/40">
                표현이 붙지 않은 건 {sum.unnamedCount}건 — 분리는 됐지만 어떤 말인지는 사람이 원문에서 봅니다.
              </p>
            )}
          </Figure>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <Panel pad="lg">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Eyebrow>언제 나왔나</Eyebrow>
                <span className="text-[0.8125rem] text-muted">의료진이 말한 달 기준 · 이관은 탐지 즉시</span>
              </div>
              <div className="mt-3">
                <Heatmap
                  months={sum.monthly.map((m) => m.month)}
                  rows={[{ key: "safety", label: "분리된 발언", accent: false,
                           byMonth: Object.fromEntries(sum.monthly.map((m) => [m.month, m.count])) }]}
                  cell={16}
                />
              </div>
              <p className="mt-3 text-[0.8125rem] leading-[1.7] text-muted">
                한 줄뿐인 것이 요점입니다 — 이 경로에는 <b className="text-ink">환자군도 신호 유형도 붙지
                않습니다.</b> 붙이는 순간 다른 집계와 이어질 길이 생깁니다.
              </p>
            </Panel>
            <Panel pad="lg">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Eyebrow>어디서 나왔나</Eyebrow>
                <span className="text-[0.8125rem] text-muted">권역별 건수</span>
              </div>
              <div className="mt-3">
                <Bars tone="rust" unit="건"
                  rows={sum.byRegion.map((r) => ({ key: r.region, label: r.region, value: r.count }))}
                />
              </div>
            </Panel>
          </div>
        </>
      )}

      <TableFrame className="mt-4">
        <thead>
          <tr>
            <th className={TH}>참조 ID</th>
            <th className={TH}>언급된 표현</th>
            <th className={TH}>원문 위치</th>
            <th className={TH}>이관</th>
            <th className={TH}>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={`${TD} mono font-medium text-navy`}>{r.id}</td>
              <td className={TD}>
                {r.eventTerms
                  ? <b className="font-medium text-rust">{r.eventTerms}</b>
                  : <span className="text-navy/30">표현 없음</span>}
              </td>
              <td className={`${TD} mono text-[0.75rem] text-navy/50`}>
                {r.evidence?.docId ?? r.interactionId}
                {r.evidence?.charStart != null && ` ${r.evidence.charStart}–${r.evidence.charEnd}`}
              </td>
              <td className={`${TD} mono text-navy/55`}>{day(r.routedAt)}</td>
              <td className={`${TD} mono text-[0.75rem] text-orange-deep`}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
      {rows[0] && (
        <div className="mt-4">
          <Eyebrow>원문 그대로 — 요약하지 않습니다</Eyebrow>
          <div className="mt-2 flex flex-col gap-2">
            {rows.slice(0, 3).map((r) => (
              <Quote key={r.id}>{r.verbatimQuote}</Quote>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** KOL 탐색 — **어디서 듣고 있고, 어디를 아직 안 물어봤나** (08/29 재구성 · 08/30 지도 편입).
 *
 * 이전에는 발언이 많은 사람 순으로 줄을 세우는 것이 전부였다. 그건 이미 가진 것을
 * 다시 보여주는 일이라 **화면을 보고 나서 할 일이 생기지 않는다.**
 * 그래서 비어 있는 칸을 먼저 놓는다 — 그 칸이 다음 현장 수집이 갈 곳이다.
 *
 * **08/30 팀장 지시로 미국 지도가 이 탭으로 들어왔다** (그전에는 `/collection` 별도
 * 화면). 08/29에 지도를 뺐던 이유는 «51칸으로 값 4개를 칠하느라 캡션 4줄이 해명하고
 * 있었다»인데, 그 문제가 08/30에 해소됐다: 칸에 올리면 **그 권역에서 무엇이 얼마나
 * 얻어지는지**(질환·신호 상위, 전문 분야 분포)가 팝업으로 나온다 — 칸이 색 하나가
 * 아니라 창(窓)이 됐다. 여전히 주 단위 수치를 지어내지 않는다: 팝업의 값도 전부
 * 권역 해상도다.
 *
 * 두 그림이 한 화면에 있는 이유는 **묻는 것이 다르기 때문**이다 —
 *   지도(코퍼스 집계) = «지금 어디서 듣고 있나» · 판독과 무관해 항상 정확하다
 *   격자(claim 집계)  = «어느 환자군을 어느 권역에서 못 들었나» · 판독이 돌아야 선다
 * 그래서 판독 전 로컬에서도 이 탭이 비어 보이지 않는다.
 *
 * **수집 지시는 이 화면에서 나가지 않는다** (08/29 팀장). «서부에 가서 물어봐»는
 * 실행이고, 실행은 AI Board 심의 → 사람 승인 → Action Item 으로만 내려간다.
 * 분석 화면에서 바로 나가면 다섯 단계 중 «전략적 제안»과 «승인된 실행»의 경계가
 * 무너진다 (절대 규칙 #8). 이 격자는 **심의에 올릴 근거를 세어 두는 데까지**다.
 */
type Collection = {
  corpus: { documents: number; blocks: number; distinctHcp: number;
            firstMonth: string; lastMonth: string; recentHcp: number };
  recentSince: string;
  monthly: MonthPoint[];
  regions: RegionRow[];
};

async function KolTab() {
  const [d, cov, coll, ment] = await Promise.all([
    api<{ rows: Kol[]; totalHcps: number }>("/analytics/kol?limit=40"),
    api<Cov>("/analytics/coverage").catch(
      () => ({ rows: [], regions: [], threshold: { repeat: 5, hcp: 3 } } as Cov)),
    // 코퍼스 집계 — claim 과 무관하다. 죽어도 아래 격자·표는 그대로 뜬다.
    api<Collection>("/analytics/collection").catch(() => null),
    api<{ byRegion: Record<string, RegionMentions> }>("/analytics/mentions")
      .then((m) => m.byRegion).catch(() => undefined),
  ]);
  // 임계에 못 미친 환자군 — 이 화면의 결론이 되는 행. 숫자 판정은 서버가 했다.
  const gaps = cov.rows.filter((r) => r.belowThreshold);
  const regionKo = (g: string) => cov.regions.find((x) => x.region === g)?.labelKo ?? g;

  return (
    <>
      <Head
        title="KOL 탐색"
        desc="어디서 얼마나 듣고 있는지를 보고, 그다음 어느 환자군을 어느 권역에서 아직 못 들었는지를 봅니다.
              비어 있는 칸이 다음 현장 수집이 갈 곳입니다.
              실명·소속·연락처는 이 시스템에 들어오지 않습니다 — 가명 참조 ID뿐입니다."
      />

      {/* ── 수집 현실 (코퍼스 집계 · 판독과 무관) ── */}
      {coll && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "면담 블록", value: coll.corpus.blocks.toLocaleString("ko-KR"), unit: "건" },
              { label: "원문 문서", value: coll.corpus.documents.toLocaleString("ko-KR"), unit: "건" },
              { label: "면담 의료진", value: String(coll.corpus.distinctHcp), unit: "인" },
              { label: "최근 1년 접촉", value: String(coll.corpus.recentHcp), unit: "인" },
            ].map((k) => (
              <Panel key={k.label} pad="lg">
                <Eyebrow>{k.label}</Eyebrow>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-[1.5rem] font-medium leading-none tabular-nums text-ink">{k.value}</span>
                  <span className="mono text-[0.8125rem] text-faint">{k.unit}</span>
                </div>
              </Panel>
            ))}
          </div>
          <CollectionView
            regions={coll.regions}
            mentions={ment}
            monthly={coll.monthly}
            recentSince={coll.recentSince}
            showTrend={false}   /* 월별 추이는 홈에 있다 — 같은 그림을 두 곳에 두지 않는다 */
          />
        </>
      )}

      {cov.rows.length > 0 && (
        <Figure title="수집 공백 — 환자군 × 권역" hint="칸 = 발언 수 / 독립 의료진 수 · 위 지도가 «어디서 듣고 있나»라면 이 격자는 «무엇을 못 들었나»입니다">
          <CoverageGrid rows={cov.rows} regions={cov.regions} threshold={cov.threshold} />
          <CoverageLegend threshold={cov.threshold} />
        </Figure>
      )}

      {/* 결론 — 격자가 만든 질문 하나를 문장으로. 숫자는 전부 위 격자와 같은 SQL 값이다. */}
      {gaps.map((r) => (
        <Panel key={r.segment} tone="note" pad="lg" className="mt-4">
          <Eyebrow>이 격자가 말하는 것</Eyebrow>
          <p className="mt-2 max-w-[76ch] break-keep text-[0.9375rem] leading-[1.75] text-body">
            <b className="font-bold text-navy">{r.labelKo}</b>만 가설이 없습니다. 사람은 이미{" "}
            <b className="font-bold text-navy">{r.total.distinctHcp}인</b>으로 임계를 채웠고{" "}
            <b className="font-bold text-navy">
              반복이 {Math.max(0, cov.threshold.repeat - r.total.claimCount)}건 모자랍니다
            </b>
            ({r.total.claimCount}회/{cov.threshold.repeat}회).
            {r.emptyRegions.length > 0 && (
              <>
                {" "}그리고 권역 {cov.regions.length} 중{" "}
                <b className="font-bold text-navy">
                  {r.emptyRegions.map(regionKo).join(" · ")}만 0건
                </b>
                입니다 — 없어서 0인지 안 물어봐서 0인지는 이 화면이 답할 수 없습니다.
                <b className="font-bold text-navy"> 다음 면담이 그리로 가면 그 답이 나옵니다.</b>
              </>
            )}
          </p>
          {r.sample && (
            <Quote
              meta={
                <>
                  {r.sample.claimId} · {r.sample.hcpRef} · {regionKo(r.sample.region)} ·{" "}
                  {day(r.sample.occurredOn)} · {SIGNAL_KO[r.sample.signalType] ?? r.sample.signalType}
                  {r.sample.reviewGrade === "HIGH" && " · 검증 전부 통과"}
                  {r.sample.evidence.docId &&
                    ` · ${r.sample.evidence.docId}:${r.sample.evidence.charStart}`}
                </>
              }
            >
              “{r.sample.quote}”
            </Quote>
          )}
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[0.8125rem] leading-[1.7] text-muted">
            <span className="rounded-md border border-dashed border-line-2 bg-fill-1 px-2 py-[3px] text-navy/70">
              여기서 수집을 지시하지 않습니다
            </span>
            <span className="max-w-[62ch] break-keep">
              수집 대상 지정은 <b className="font-medium text-ink">AI Board 심의 → 사람 승인 → Action Item</b>{" "}
              경로로만 내려갑니다. 이 화면이 하는 일은{" "}
              <b className="font-medium text-ink">심의에 올릴 수 있게 세어 두는 것</b>까지입니다.
            </span>
          </p>
        </Panel>
      ))}

      <TableFrame className="mt-4">
        <thead>
          <tr>
            <th className={TH}>참조 ID</th>
            <th className={TH}>전문 분야</th>
            <th className={TH}>권역</th>
            <th className={TH}>발언 (잠정/공식)</th>
            {/* 08/30: 「원문 확인된 발언」이었다. 원문 대조(체크 ①)는 실패하면 저장 자체가
                안 되므로 **저장된 모든 claim 이 이미 통과한 조건**이고, 이 칸이 세는
                `highGradeCount` 는 거기에 ②용어 매핑 ∧ ③계약 검증까지 통과한 등급이다 —
                «전부여야 할 수»를 세 조건 통과분으로 축소해 보여주고 있었다. */}
            <th className={TH} title="review_grade = HIGH — 원문 대조 ∧ 용어 매핑 ∧ 계약 검증 셋 다 통과">
              검증 전부 통과
            </th>
            <th className={TH}>다룬 환자군</th>
            <th className={TH}>최근 발언</th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.hcpRef}>
              <td className={`${TD} mono font-medium text-navy`}>{r.hcpRef}</td>
              <td className={TD}>{r.specialty}</td>
              <td className={`${TD} text-navy/60`}>{regionKo(r.region)}</td>
              <td className={TD}><Pairs prov={r.provisional.claimCount} offi={r.official.claimCount} /></td>
              <td className={`${TD} mono`}>{r.provisional.highGradeCount}</td>
              <td className={`${TD} mono text-navy/60`}>{r.provisional.distinctSegments}</td>
              <td className={`${TD} mono text-navy/55`}>{day(r.lastClaimAt)}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
      <PairLegend />
      <p className="mt-1 max-w-[78ch] text-[0.8125rem] leading-[1.7] text-muted">
        참조 의료진 <b className="text-ink">{d.totalHcps.toLocaleString("ko-KR")}인</b> 중 발언이 많은 40인입니다.
        점수를 만들지 않습니다 — <b className="text-ink">센 값으로 줄을 세운 것</b>뿐입니다.
        &ldquo;검증 전부 통과&rdquo;는 <b className="text-ink">H등급</b> 건수입니다 — 원문 대조에
        더해 용어 매핑과 계약 검증까지 통과한 것. 원문 대조만이라면 <b className="text-ink">저장된
        전건</b>이 통과입니다(못 하면 저장 자체가 안 됩니다).
      </p>
    </>
  );
}

async function Trend() {
  const d = await api<{ rows: Sig[] }>("/aggregates/signals");
  const rows = d.rows
    .filter((r) => r.signalType !== "OTHER")
    .sort((a, b) => b.provisional.claimCount - a.provisional.claimCount);
  const span = [...new Set(rows.flatMap((r) => r.provisional.monthly.map((m) => m.month)))].sort();
  // 달을 빠짐없이 채운다 — 발언이 없던 달이 열에서 빠지면 "비어 있던 시기"가 안 보인다
  const months: string[] = [];
  if (span.length) {
    let [y, mo] = span[0].split("-").map(Number);
    const [ey, em] = span[span.length - 1].split("-").map(Number);
    while (y < ey || (y === ey && mo <= em)) {
      months.push(`${y}-${String(mo).padStart(2, "0")}`);
      mo += 1; if (mo > 12) { mo = 1; y += 1; }
    }
  }
  const heatRows = rows.slice(0, 16).map((r) => ({
    key: `${r.patientSegment}::${r.signalType}`,
    label: SIGNAL_KO[r.signalType] ?? r.signalType,
    sub: r.patientSegment,
    accent: r.claimCount > 0,
    byMonth: Object.fromEntries(r.provisional.monthly.map((m) => [m.month, m.count])),
  }));
  return (
    <>
      <Head
        title="추이 분석"
        desc="환자군 × 신호 유형 조합이 시간에 따라 어떻게 쌓였는지입니다. 의료진이 실제로 말한 달 기준입니다 — 판독을 돌린 날이 아닙니다."
      />
      <Kpis
        items={[
          { label: "신호 조합", value: rows.length, note: "그 밖(OTHER)은 신호가 아니므로 제외" },
          { label: "관측 구간", value: span.length ? `${span[0]} – ${span[span.length - 1]}` : "—", note: "발언이 있었던 달의 범위" },
          { label: "공식 집계 반영", value: rows.filter((r) => r.claimCount > 0).length, note: "승인된 값이 있는 조합", tone: "orange" },
        ]}
      />
      <Figure
        title="달별 강도 — 언제 무엇이 올라왔나"
        hint="행이 신호 조합, 열이 달입니다. 같은 열이 같은 달이라 여러 신호가 동시에 올라온 시기가 보입니다. 오렌지 행은 승인된 값이 있는 조합."
      >
        <Heatmap months={months} rows={heatRows} />
      </Figure>

      <TableFrame className="mt-4">
        <thead>
          <tr>
            <th className={TH}>환자군</th>
            <th className={TH}>신호 유형</th>
            <th className={TH}>언급 (잠정/공식)</th>
            <th className={TH}>독립 의료진</th>
            <th className={TH}>권역</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.patientSegment}::${r.signalType}`}>
              <td className={`${TD} font-medium text-navy`}>{r.patientSegment}</td>
              <td className={TD}>
                {SIGNAL_KO[r.signalType] ?? r.signalType}
                <span className="mono ml-1.5 text-[0.6875rem] text-navy/30">{r.signalType}</span>
              </td>
              <td className={TD}><Pairs prov={r.provisional.claimCount} offi={r.claimCount} /></td>
              <td className={`${TD} mono`}>{r.provisional.distinctHcp}</td>
              <td className={`${TD} mono text-navy/60`}>{r.provisional.distinctRegions}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
      <PairLegend />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════ */

// 08/29: `conditions` 를 뺐다 — 질환 표현은 별도 축이 아니라 환자군의 표기 변이였다.
// 옛 주소(`?tab=conditions`)로 들어오면 아래 기본값이 받아 「환자군 확장」으로 보낸다.
const PANELS: Record<string, () => Promise<React.ReactElement>> = {
  segments: Segments, safety: Safety, kol: KolTab, trend: Trend,
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "segments" } = await searchParams;
  const key = PANELS[tab] ? tab : "segments";
  const meta = ANALYTICS_TABS.find((t) => t.id === key);

  let body: React.ReactElement;
  try {
    body = await PANELS[key]();
  } catch (e) {
    body = (
      <Panel tone="note" pad="lg" className="mt-6 text-[0.9375rem] leading-[1.7] text-rust">
        <b>이 집계를 불러오지 못했습니다.</b>
        <p className="mono mt-2 text-[0.8125rem] text-navy/60">
          {e instanceof Error ? e.message : String(e)}
        </p>
        <p className="mt-2 text-[0.875rem] text-ink">
          백엔드가 이 엔드포인트를 아직 모르면(배포 전) 이 자리가 비어 있는 것이 정상입니다.
        </p>
      </Panel>
    );
  }

  return (
    <>
      <Topbar title={meta?.label ?? "분석"} right={<Chip tone="orange">SQL 집계</Chip>} />
      <div className="mx-auto max-w-6xl">
        <Eyebrow>홈 대시보드 · 분석</Eyebrow>
        <AnalyticsTabs current={key} />
        {body}
      </div>
    </>
  );
}
