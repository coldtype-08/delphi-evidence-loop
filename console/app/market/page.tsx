import { api } from "@/lib/api";
import { Panel, Placeholder } from "@/app/components/ui";

/** 시장·경쟁 — 공개 규제·근거 데이터 화면 (docs/01 §5 · 04 §4.5 · 09).
 *
 * 담기는 것은 openFDA **허가 라벨(규제 정보)**이다 — 매출·처방 데이터가 아니다.
 * 경쟁 약물 목록은 사람이 고르지 않고 FDA 적응증 검색이 도출한다 (docs/09 §4 보완 3).
 * 모든 수치는 코드 계산, 해석 문장만 AI — 5단계 라벨로 구분 표기한다 (절대 규칙 #1·#8).
 */

type LabelRow = {
  subject: string;
  minAge: number | null;
  indication: string;
  sourceUrl: string | null;
  caveatKo: string | null;
  isOurs: boolean | null;
  brandName: string | null;
  applicationNumber: string | null;
  isNda: boolean | null;
  labelCount: number | null;
  // PENDING_READ = LLM 판독 미실행 (키 없는 환경) — "읽었으나 판정 불가"인 UNDETERMINED와 다르다
  status: "CONFIRMED" | "ADULT_ONLY_EXPLICIT" | "UNDETERMINED" | "PENDING_READ";
  covers12to17: boolean | null;
  coverage: "FULL" | "PARTIAL" | "NONE" | null;   // 완전(12세 이하) / 부분(13~17세) / 불가
  evidenceQuote: string | null;
  readingNoteKo: string | null;
  reasonKo: string | null;
};

type TrialRow = {
  subject: string;
  sourceUrl: string | null;
  caveatKo: string | null;
  isOurs: boolean;
  totalTrials: number;
  adolescentTrials: number;
  industryTrials: number;
  adolescentIndustryTrials: number;
  ownDrugTrials: number;
  firstAdolescentYear: number | null;
  firstAdolescentIndustryYear: number | null;
  latestAdolescentOwn: string | null;
};

type TrialData = {
  asOf: string | null;
  rows: TrialRow[];
  interpretation: { headlineKo: string; interpretationKo: string; caveatKo: string } | null;
};

type LitRow = {
  subject: string; sourceUrl: string | null; caveatKo: string | null;
  isOurs: boolean; total: number; recent: number; recentWindow: string;
};
type LitData = {
  asOf: string | null; rows: LitRow[];
  interpretation: { headlineKo: string; interpretationKo: string; caveatKo: string } | null;
};

type SpendRow = {
  subject: string; sourceUrl: string | null; caveatKo: string | null; isOurs: boolean;
  byYear: Record<string, { spend: number; claims: number; beneficiaries: number }>;
  growthPctSince2020: number | null;
};
type SpendData = {
  asOf: string | null; rows: SpendRow[];
  interpretation: { headlineKo: string; interpretationKo: string; caveatKo?: string } | null;
};

type LabelAgeData = {
  asOf: string | null;
  refType: string;
  rows: LabelRow[];
  interpretation: {
    headlineKo: string;
    interpretationKo: string;
    caveatKo: string;
    stats: {
      totalDrugs: number; covering12to17: number; notCovering: number; undetermined: number;
      fullCoverage?: number; partialCoverage?: number;
    };
    computedBy: string;
  } | null;
};

export const dynamic = "force-dynamic";

const AGE_MAX = 18; // 축 상한 — 18=성인선

function ageLabel(r: LabelRow): string {
  if (r.status === "PENDING_READ") return "판독 대기";
  if (r.status === "UNDETERMINED") return "판정 보류";
  if (r.minAge == null) return "—";
  if (r.minAge >= 18) return "성인만";
  if (r.minAge < 1) return `${Math.round(r.minAge * 12)}개월+`;
  return `${r.minAge}세+`;
}

/** 허가 연령 막대 — minAge에서 성인선(18)까지 채운다. 12–17 구간은 눈금으로 표시. */
function AgeBar({ r }: { r: LabelRow }) {
  if (r.minAge == null) {
    return (
      <div className="relative h-4 w-full rounded-sm bg-sky-soft/60">
        <span className="absolute inset-0 flex items-center justify-center text-[0.75rem] font-bold text-muted">
          {r.status === "PENDING_READ" ? "AI 판독 미실행" : "판정 보류"}
        </span>
      </div>
    );
  }
  // 성인 전용(18세+)은 폭이 0이 되어 막대가 사라진다 — 오른쪽 끝 조각으로 보이게 한다
  const startRaw = Math.min(r.minAge, AGE_MAX) / AGE_MAX;
  const start = startRaw >= 1 ? 0.9 : startRaw;
  const fill =
    r.isOurs ? "bg-orange"
    : r.coverage === "FULL" ? "bg-navy/70"
    : r.coverage === "PARTIAL" ? "bg-navy/35"
    : "bg-rust/60";
  return (
    <div className="relative h-4 w-full rounded-sm bg-sky-soft/60">
      {/* 12–17세 구간 가이드 */}
      <div
        className="absolute inset-y-0 border-x border-dashed border-line"
        style={{ left: `${(12 / AGE_MAX) * 100}%`, width: `${(5 / AGE_MAX) * 100}%` }}
      />
      <div
        className={`absolute inset-y-0 right-0 rounded-sm ${fill}`}
        style={{ left: `${start * 100}%` }}
      />
    </div>
  );
}

export default async function MarketPage() {
  let data: LabelAgeData | null = null;
  let trials: TrialData | null = null;
  let error: string | null = null;
  try {
    data = await api<LabelAgeData>("/market/refs?refType=LABEL_AGE");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  try {
    trials = await api<TrialData>("/market/refs?refType=TRIAL_REG");
  } catch {
    trials = null;   // 시험 데이터는 없을 수 있다 — 라벨 화면은 그대로 뜬다
  }
  let lit: LitData | null = null;
  try {
    lit = await api<LitData>("/market/refs?refType=LIT_COUNT");
  } catch {
    lit = null;
  }
  let spend: SpendData | null = null;
  try {
    spend = await api<SpendData>("/market/refs?refType=SPENDING");
  } catch {
    spend = null;
  }

  const rows = data?.rows ?? [];
  const interp = data?.interpretation ?? null;
  const stats = interp?.stats;

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-bold tracking-widest text-orange-deep">PUBLIC EVIDENCE</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-navy">시장·경쟁</h1>
      <p className="mt-1 text-sm text-muted">
        공개 규제·근거 데이터로 보는 경쟁 지형 — 개인은 한 명도 등장하지 않으며, 가설과 연결되지 않아
        COMMERCIAL 롤에도 열린다.
      </p>

      {error && <div className="mt-4 rounded-lg bg-rust-soft px-4 py-2 text-sm text-rust">{error}</div>}

      {!error && rows.length === 0 && (
        <div className="mt-8">
          <Placeholder title="스냅샷 대기">
            아직 openFDA 스냅샷이 적재되지 않았습니다. 추정값을 채우지 않습니다. 적재:{" "}
            <code className="mono text-[0.875rem]">POST /api/market/refresh</code>
          </Placeholder>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* 코드가 센 집계 — 관찰된 사실 */}
          {stats && (
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "같은 적응증 약물 (FDA 자동 도출)", value: stats.totalDrugs, unit: "종", note: null },
                {
                  label: "12–17세 접근 가능",
                  value: stats.covering12to17,
                  unit: "종",
                  // 2단으로 접으면 zonisamide(16세+)를 어디 넣느냐로 총계가 갈린다 — 둘 다 보인다
                  note: stats.partialCoverage
                    ? `완전 ${stats.fullCoverage} + 부분 ${stats.partialCoverage}`
                    : null,
                },
                { label: "커버 불가 (성인 전용)", value: stats.notCovering, unit: "종", note: null },
                { label: "판정 보류", value: stats.undetermined, unit: "건", note: null },
              ].map((k) => (
                <Panel key={k.label} pad="md">
                  <div className="text-3xl font-extrabold tabular-nums text-navy">
                    {k.value}
                    <span className="ml-0.5 text-sm font-bold text-muted">{k.unit}</span>
                  </div>
                  <div className="mt-1 text-[0.75rem] font-bold text-muted">{k.label}</div>
                  {k.note && <div className="mt-0.5 text-[0.75rem] text-muted">{k.note}</div>}
                </Panel>
              ))}
            </div>
          )}

          {/* AI의 해석 — 5단계 구분 표기 */}
          {interp && (
            <Panel pad="lg" className="mt-4">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-orange-soft px-2 py-0.5 text-[0.75rem] font-bold text-orange-deep">
                  AI의 해석
                </span>
                <span className="text-[0.75rem] text-muted">
                  수치는 전부 코드 계산({interp.computedBy}) — AI는 해석 문장만 작성
                </span>
              </div>
              <p className="mt-2 font-bold leading-snug text-navy">{interp.headlineKo}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{interp.interpretationKo}</p>
              <p className="mt-2 text-[0.75rem] text-muted">⚠ {interp.caveatKo}</p>
            </Panel>
          )}

          {/* 허가 연령 지도 — 관찰된 사실 */}
          <Panel pad="lg" className="mt-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="font-bold text-navy">허가 연령 지도</h2>
              <span className="rounded-full border border-line px-2 py-0.5 text-[0.75rem] font-bold text-muted">
                관찰된 사실
              </span>
              <span className="text-[0.75rem] text-muted">
                FDA 허가 라벨(규제 문서) 기준 · 적응증 &ldquo;partial-onset seizures&rdquo; · NDA 오리지널
                문서 우선 · openFDA {data?.asOf} 스냅샷
              </span>
            </div>

            <div className="mt-4 space-y-1.5">
              {/* 축 눈금 */}
              <div className="flex items-center gap-3 text-[0.75rem] font-bold text-muted">
                <div className="w-52 shrink-0" />
                <div className="relative h-3 w-full">
                  {[0, 6, 12, 17].map((a) => (
                    <span key={a} className="absolute -translate-x-1/2" style={{ left: `${(a / AGE_MAX) * 100}%` }}>
                      {a}세
                    </span>
                  ))}
                  <span className="absolute right-0">성인</span>
                </div>
                <div className="w-16 shrink-0" />
              </div>

              {rows.map((r) => (
                <details key={r.subject} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-1 py-0.5 hover:bg-sky-soft/50">
                    <div className="w-52 shrink-0">
                      <div className="truncate text-xs font-semibold">
                        <span className={r.isOurs ? "font-extrabold text-orange-deep" : "text-navy"}>
                          {r.subject}
                          {r.isOurs && " (우리)"}
                        </span>
                      </div>
                      {/* FDA에서 실제로 받아온 값 — 판독(LLM) 없이도 확인되는 사실이므로 접지 않고 노출 */}
                      <div className="truncate text-[0.75rem] text-muted">
                        {r.brandName ?? "—"} · {r.applicationNumber ?? "—"}
                        {r.isNda === false && " (제네릭)"} · 라벨 {r.labelCount ?? 0}건
                      </div>
                    </div>
                    <AgeBar r={r} />
                    <div className="w-16 shrink-0 text-right text-[0.75rem] font-bold tabular-nums text-muted">
                      {ageLabel(r)}
                    </div>
                  </summary>
                  {/* 근거 원문 — 판독의 증거. 인용은 라벨 원문과 문자열 대조를 통과한 것만 저장된다 (#2) */}
                  <div className="mb-2 ml-52 mr-16 mt-1 rounded-lg bg-sky-soft/40 px-3 py-2 text-[0.75rem] leading-relaxed">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
                      {r.brandName && <span>브랜드 {r.brandName}</span>}
                      {r.applicationNumber && (
                        <span>
                          {r.applicationNumber} {r.isNda ? "(NDA 오리지널)" : "(제네릭 폴백)"}
                        </span>
                      )}
                      {r.labelCount != null && <span>라벨 등재 {r.labelCount}건</span>}
                    </div>
                    {r.evidenceQuote && (
                      <p className="mt-1 text-ink">
                        <mark className="evidence">&ldquo;{r.evidenceQuote}&rdquo;</mark>
                      </p>
                    )}
                    {r.readingNoteKo && <p className="mt-1 text-muted">판독: {r.readingNoteKo}</p>}
                    {r.reasonKo && <p className="mt-1 font-semibold text-rust">보류 사유: {r.reasonKo}</p>}
                    {r.sourceUrl && (
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block font-semibold text-sky underline underline-offset-2"
                      >
                        FDA 원문 라벨 ↗
                      </a>
                    )}
                  </div>
                </details>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] font-semibold text-muted">
              <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-navy/70 align-middle" />12–17세 완전 커버</span>
              <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-navy/35 align-middle" />부분 (13–17세만)</span>
              <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-rust/60 align-middle" />커버 불가</span>
              <span><i className="mr-1 inline-block h-2 w-3 rounded-sm bg-orange align-middle" />XCOPRI (우리)</span>
              <span><i className="mr-1 inline-block h-2 w-3 rounded-sm border border-dashed border-line-2 align-middle" />12–17세 구간</span>
            </div>
            <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
              {rows[0]?.caveatKo} · &ldquo;라벨 등재 수&rdquo;는 그 성분으로 나온 허가 문서 수이며 점유율이
              아닙니다. 판정 보류 항목은 추정값으로 채우지 않고 사유와 FDA 원문 링크로 남깁니다.
            </p>
          </Panel>
        </>
      )}

      {trials && trials.rows.length > 0 && <TrialTimeline data={trials} />}
      {lit && lit.rows.length > 0 && <LitCounts data={lit} />}
      {spend && spend.rows.length > 0 && <SpendingTrend data={spend} />}
    </div>
  );
}

/** 질문 ④ — 경쟁사 동향: 이미 뒤처진 시장이 블루오션인가 레드오션인가 (CMS Part D 실사용·지출).
 *  숫자는 CMS 실적 + 코드 산수 — 예측선 없음 (절대 규칙 #7). */
function SpendingTrend({ data }: { data: SpendData }) {
  const rows = data.rows;
  const max = Math.max(...rows.map((r) => r.byYear["2023"]?.spend ?? 0), 1);
  const fmtM = (v: number) => `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M`;
  return (
    <Panel pad="lg" className="mt-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-bold text-navy">시장 실사용·경쟁 강도</h2>
        <span className="rounded-full border border-line px-2 py-0.5 text-[0.75rem] font-bold text-muted">
          관찰된 사실
        </span>
        <span className="text-[0.75rem] text-muted">
          CMS Medicare Part D {data.asOf} 스냅샷 · 2023 지출액(막대) · 성장률 = 2020→2023 실적 (예측 아님)
        </span>
      </div>
      {data.interpretation && (
        <div className="mt-3 rounded-xl bg-orange-soft/60 px-4 py-2">
          <span className="mr-1.5 rounded-full bg-orange-soft px-2 py-0.5 text-[0.75rem] font-bold text-orange-deep">
            AI의 해석
          </span>
          <span className="text-[0.8125rem] leading-relaxed text-ink">{data.interpretation.headlineKo}</span>
        </div>
      )}
      <div className="mt-4 space-y-1.5">
        {rows.map((r) => {
          const s23 = r.byYear["2023"]?.spend ?? 0;
          const g = r.growthPctSince2020;
          return (
            <div key={r.subject} className="flex items-center gap-3">
              <div className="w-52 shrink-0 truncate text-xs font-semibold">
                <span className={r.isOurs ? "font-extrabold text-orange-deep" : "text-navy"}>
                  {r.subject}{r.isOurs && " (우리)"}
                </span>
              </div>
              <div className="relative h-4 w-full rounded-sm bg-sky-soft/50">
                <div
                  className={`absolute inset-y-0 left-0 rounded-sm ${r.isOurs ? "bg-orange" : "bg-navy/60"}`}
                  style={{ width: `${(s23 / max) * 100}%` }}
                />
              </div>
              <div className="w-40 shrink-0 text-right text-[0.75rem] font-bold tabular-nums">
                <a href={r.sourceUrl ?? "#"} target="_blank" rel="noreferrer"
                   className="text-muted underline-offset-2 hover:text-sky hover:underline">
                  {fmtM(s23)}
                </a>
                {g != null && (
                  <span className={`ml-1.5 ${g > 0 ? "text-green" : g < 0 ? "text-rust" : "text-muted"}`}>
                    {g > 0 ? "▲" : g < 0 ? "▼" : ""}{Math.abs(g)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[0.75rem] leading-relaxed text-muted">
        {rows[0]?.caveatKo} 성장률 하락(▼)은 대체로 특허 만료·제네릭 전환 신호 — 브랜드 지출이 줄어도
        처방 자체가 준 것은 아닐 수 있습니다.
      </p>
    </Panel>
  );
}

/** 질문 ③ — 문헌은 얼마나 쌓였나 (PubMed). 건수는 PubMed가 세고 코드가 받아 적는다 (LLM 없음).
 *  총량(회색)은 오래된 약일수록 크므로, "지금 쌓이는가"는 최근 구간(남색)으로 읽는다. */
function LitCounts({ data }: { data: LitData }) {
  const rows = data.rows;
  const maxRecent = Math.max(...rows.map((r) => r.recent), 1);
  return (
    <Panel pad="lg" className="mt-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-bold text-navy">문헌 추이</h2>
        <span className="rounded-full border border-line px-2 py-0.5 text-[0.75rem] font-bold text-muted">
          관찰된 사실
        </span>
        <span className="text-[0.75rem] text-muted">
          PubMed {data.asOf} 스냅샷 · 약물 AND epilepsy 검색 건수 · 막대는 최근({rows[0]?.recentWindow}) 기준
        </span>
      </div>
      {data.interpretation && (
        <div className="mt-3 rounded-xl bg-orange-soft/60 px-4 py-2">
          <span className="mr-1.5 rounded-full bg-orange-soft px-2 py-0.5 text-[0.75rem] font-bold text-orange-deep">
            AI의 해석
          </span>
          <span className="text-[0.8125rem] leading-relaxed text-ink">{data.interpretation.headlineKo}</span>
        </div>
      )}
      <div className="mt-4 space-y-1.5">
        {rows.map((r) => (
          <div key={r.subject} className="flex items-center gap-3">
            <div className="w-52 shrink-0 truncate text-xs font-semibold">
              <span className={r.isOurs ? "font-extrabold text-orange-deep" : "text-navy"}>
                {r.subject}{r.isOurs && " (우리)"}
              </span>
            </div>
            <div className="relative h-4 w-full rounded-sm bg-sky-soft/50">
              <div
                className={`absolute inset-y-0 left-0 rounded-sm ${r.isOurs ? "bg-orange" : "bg-navy/60"}`}
                style={{ width: `${(r.recent / maxRecent) * 100}%` }}
              />
            </div>
            <a href={r.sourceUrl ?? "#"} target="_blank" rel="noreferrer"
               className="w-28 shrink-0 text-right text-[0.75rem] font-bold tabular-nums text-muted underline-offset-2 hover:text-sky hover:underline">
              {r.recent} <span className="font-normal">/ 전체 {r.total}</span>
            </a>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.75rem] leading-relaxed text-muted">{rows[0]?.caveatKo}</p>
    </Panel>
  );
}

/** 질문 ② — 경쟁사는 청소년 시험을 언제 시작했나 (ClinicalTrials.gov).
 *  이 섹션은 **LLM이 관여하지 않는다** — 건수·최초 연도는 전부 코드 계산 (절대 규칙 #1). */
function TrialTimeline({ data }: { data: TrialData }) {
  const rows = data.rows;
  const years = rows.map((r) => r.firstAdolescentYear).filter((y): y is number => y != null);
  const minYear = Math.min(...years, 1990);
  const maxYear = Math.max(...years, 2026);
  const span = Math.max(maxYear - minYear, 1);
  const ours = rows.find((r) => r.isOurs);

  return (
    <Panel pad="lg" className="mt-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-bold text-navy">청소년 시험 타임라인</h2>
        <span className="rounded-full border border-line px-2 py-0.5 text-[0.75rem] font-bold text-muted">
          관찰된 사실
        </span>
        <span className="text-[0.75rem] text-muted">
          ClinicalTrials.gov {data.asOf} 스냅샷 · 12–17세가 포함되는 시험의 최초 시작 연도 ·
          건수는 전부 코드 계산(LLM 없음)
        </span>
      </div>

      {ours && ours.firstAdolescentYear && (
        <p className="mt-3 rounded-xl bg-orange-soft px-4 py-2 text-[0.8125rem] leading-relaxed text-orange-deep">
          <b>우리 약은 {ours.firstAdolescentYear}년에 이미 청소년 시험을 시작했습니다</b> — 시작이 늦어서
          라벨이 없는 것이 아닙니다. 자사·라이선스 파트너 주도 시험 {ours.ownDrugTrials}건 확인.
        </p>
      )}

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center gap-3 text-[0.75rem] font-bold text-muted">
          <div className="w-40 shrink-0" />
          <div className="relative h-3 w-full">
            {[minYear, Math.round((minYear + maxYear) / 2), maxYear].map((y) => (
              <span key={y} className="absolute -translate-x-1/2"
                    style={{ left: `${((y - minYear) / span) * 100}%` }}>{y}</span>
            ))}
          </div>
          <div className="w-24 shrink-0 text-right">회사주도 / 전체</div>
        </div>

        {rows.map((r) => (
          <div key={r.subject} className="flex items-center gap-3">
            <div className="w-40 shrink-0 truncate text-xs font-semibold">
              <span className={r.isOurs ? "font-extrabold text-orange-deep" : "text-navy"}>
                {r.subject}{r.isOurs && " (우리)"}
              </span>
            </div>
            <div className="relative h-4 w-full rounded-sm bg-sky-soft/50">
              {r.firstAdolescentYear != null && (
                <>
                  <div
                    className={`absolute inset-y-0 rounded-sm ${r.isOurs ? "bg-orange" : "bg-navy/60"}`}
                    style={{
                      left: `${((r.firstAdolescentYear - minYear) / span) * 100}%`,
                      right: 0,
                    }}
                  />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-full pr-1 text-[0.75rem] font-bold tabular-nums text-muted"
                    style={{ left: `${((r.firstAdolescentYear - minYear) / span) * 100}%` }}
                  >
                    {r.firstAdolescentYear}
                  </span>
                </>
              )}
            </div>
            <a
              href={r.sourceUrl ?? "#"} target="_blank" rel="noreferrer"
              className="w-24 shrink-0 text-right text-[0.75rem] font-bold tabular-nums text-muted underline-offset-2 hover:text-sky hover:underline"
            >
              {r.adolescentIndustryTrials} / {r.adolescentTrials}
            </a>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[0.75rem] leading-relaxed text-muted">
        {rows[0]?.caveatKo} 오른쪽 숫자는 <b>회사(INDUSTRY) 주도 / 전체</b> 청소년 포함 시험 수 —
        연구자 주도 연구를 섞어 세면 &ldquo;개발이 활발하다&rdquo;는 잘못된 신호가 됩니다.
        자사·라이선스 파트너 시험은 경쟁으로 세지 않고 별도 표시합니다 (같은 성분을 파트너가 다른
        코드명으로 개발하는 경우).
      </p>
    </Panel>
  );
}
