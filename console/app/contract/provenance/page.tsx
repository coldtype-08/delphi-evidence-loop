/**
 * 유래 — 지금 계약이 어디서 왔는가 (08/31 전면 재작성).
 *
 * ## 왜 갈아엎었나
 *
 * 이 화면은 `contract_v0_1.yaml`(08/19 부트스트랩 초안)을 렌더링하고 있었는데, 활성 계약은
 * **v1.8** 이다. 08/26 축 재설계로 필드 구성이 전면 교체되면서 화면이 말하는 필드가 하나도
 * 남지 않았다 — `patient_segment`·`solicitation`·`event_terms`·`sentiment`·`credential`
 * 전부 v1.8 에 없다. 게다가 `POST_STROKE` 를 「v0.1엔 없음」으로 표시하는데 지금 계약에는
 * `post_stroke_epilepsy` 가 **있다.** 화면이 사실과 달랐다.
 *
 * ## 무엇으로 대체했나
 *
 * v0.1 이야기 대신 **지금 계약이 보유한 사실**을 쓴다. 계약 파일이 도메인 전문가가 정의한
 * 필드 목록을 명시하고 있으므로(`fixed_headers.yaml`), 두 계층의 구분은 해석이 아니라 기록이다.
 * 거기에 DB 의 실제 사용량을 붙이면 이 제품의 주장이 숫자로 선다:
 *
 *   도메인 전문가 정의 1,023  ·  AI 발견 1,580   — 약 1 : 1.5
 *
 * 규모는 비슷하고 갈리는 것은 **역할**이다. 개별 필드로 늘어놓으면 최대(397)와 최소(1)가 붙어
 * 「AI 쪽이 훨씬 크다」로 읽히므로 **범주 단위**로 묶어 보여준다 (`field_groups.yaml`).
 */

import type { Metadata } from "next";
import { api } from "@/lib/api";
import { Panel } from "@/app/components/ui";
import ContractTabs from "../tabs";
import { fmt, type SchemaView, type SchemaLayer } from "../_schema-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contract 유래 — DELPHi Console",
  description: "활성 계약의 필드를 누가 정의했는가 — 도메인 전문가 정의와 AI 발견의 두 계층",
};

/** 계층 카드 — 무엇을 담고 어떤 역할인지. 두 장을 나란히 놓아 규모가 비교된다. */
function LayerCard({ layer, hot }: { layer: SchemaLayer; hot: boolean }) {
  return (
    <Panel pad="lg" className={hot ? "border-orange-soft" : undefined}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[0.95rem] font-bold text-navy">{layer.labelKo}</h2>
        <span className="mono ml-auto text-[0.7rem] text-faint">{layer.fieldCount}개 필드</span>
      </div>
      <p className="mt-1.5 text-[0.78rem] leading-[1.7] text-muted">{layer.howKo}</p>
      <p className="mt-2 text-[0.78rem] leading-[1.7] text-muted">
        <b className="font-semibold text-ink">쓰임</b> — {layer.roleKo}
      </p>
    </Panel>
  );
}

/** 범주별 값 수 — 막대는 홈 개요와 같은 문법 (오렌지 그라데이션 = 전문가 · 네이비 = AI). */
function GroupBars({ layer, hot, max }: { layer: SchemaLayer; hot: boolean; max: number }) {
  return (
    <Panel pad="lg" className={hot ? "border-orange-soft" : undefined}>
      <div className="flex items-center gap-2 border-b border-line pb-2.5">
        <span className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold ${
          hot ? "bg-orange-soft text-orange-deep" : "bg-fill-2 text-navy"}`}>
          {layer.labelKo}
        </span>
        <b className="ml-auto text-[1.15rem] font-medium tabular-nums text-navy">
          {fmt(layer.storedValues)}
        </b>
      </div>
      <div className="mt-1.5">
        {layer.groups.map((g) => (
          <div key={g.labelKo}
               className="grid grid-cols-[minmax(0,1fr)_84px_46px] items-center gap-2.5 py-1">
            <span className="min-w-0 text-[0.775rem] text-body">
              {g.labelKo}
              {g.noteKo && <em className="not-italic text-[0.72rem] text-faint"> ({g.noteKo})</em>}
            </span>
            <span className="h-[9px] overflow-hidden rounded-md bg-fill-2">
              <span className="block h-full rounded-md"
                    style={{
                      width: `${((g.storedValues / Math.max(1, max)) * 100).toFixed(1)}%`,
                      background: hot
                        ? "linear-gradient(90deg, var(--orange-bright), var(--orange-deep))"
                        : "var(--navy)",
                      opacity: hot ? 1 : 0.78,
                    }} />
            </span>
            <b className={`text-right text-[0.8rem] font-semibold tabular-nums ${
              g.storedValues ? "text-ink" : "text-faint"}`}>{fmt(g.storedValues)}</b>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default async function ProvenancePage() {
  let view: SchemaView | null = null;
  let error: string | null = null;
  try {
    view = await api<SchemaView>("/contract/schema-view");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const fx = view?.layers.fixed;
  const ai = view?.layers.discovered;
  const max = Math.max(1, ...[...(fx?.groups ?? []), ...(ai?.groups ?? [])].map((g) => g.storedValues));

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mono text-[0.68rem] font-medium uppercase tracking-[0.13em] text-faint">
        DATA CONTRACT
      </p>
      <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
        이 스키마는 어디서 왔는가
      </h1>
      <p className="mt-1.5 max-w-[74ch] text-[0.9375rem] leading-[1.7] text-body">
        {view && fx && ai ? (
          <>
            전체 {fmt(view.fields.length)}개 필드 중{" "}
            <b className="text-ink">{fmt(fx.fieldCount)}개는 도메인 지식을 가진 담당자가 사전에 정의</b>했고,{" "}
            <b className="text-ink">{fmt(ai.fieldCount)}개는 AI 가 코퍼스 분석으로 발견</b>했습니다.
            두 계층은 서로 다른 역할을 맡으며, 어느 한쪽만으로는 이 스키마가 성립하지 않습니다.
          </>
        ) : (
          "활성 계약의 필드를 누가 정의했는가 — 두 계층의 규모와 역할."
        )}
      </p>

      <ContractTabs active="provenance" />

      {error && (
        <Panel tone="note" pad="md" className="mt-4 text-[0.9375rem] text-rust">{error}</Panel>
      )}

      {view && fx && ai && (
        <>
          <div className="mt-6 grid gap-3.5 lg:grid-cols-2">
            <LayerCard layer={fx} hot />
            <LayerCard layer={ai} hot={false} />
          </div>

          <h2 className="mt-8 text-[0.95rem] font-bold text-navy">두 계층의 규모와 역할 분담</h2>
          <p className="mt-1 max-w-[76ch] text-[0.82rem] leading-[1.7] text-muted">
            필드를 주제별로 묶어 저장된 값을 집계하면 두 계층의 규모는{" "}
            <b className="font-semibold text-ink">{fmt(fx.storedValues)} 대 {fmt(ai.storedValues)}</b>
            {" "}(약 1 : {(ai.storedValues / Math.max(1, fx.storedValues)).toFixed(1)})입니다.
            어느 한쪽이 부수적이지 않습니다.
          </p>

          <div className="mt-3 grid gap-3.5 lg:grid-cols-2">
            <GroupBars layer={fx} hot max={max} />
            <GroupBars layer={ai} hot={false} max={max} />
          </div>

          <Panel tone="note" pad="lg" className="mt-3.5">
            <p className="max-w-[80ch] text-[0.86rem] leading-[1.75] text-body">
              <b className="font-bold text-navy">두 역할은 다음과 같이 나뉩니다.</b> AI 는 비정형
              데이터에 실재하는 패턴을 빠짐없이 찾아내고, 도메인 전문가는 사업 판단에 필수적인 항목을{" "}
              <b className="font-bold text-navy">Domain Knowledge 기반으로 선정</b>합니다.
              두 계층을 결합함으로써{" "}
              <b className="font-bold text-navy">어느 한쪽만으로는 찾아낼 수 없는 insight</b> 를 추출합니다.
            </p>
          </Panel>

          <h2 className="mt-8 text-[0.95rem] font-bold text-navy">계약 버전 이력</h2>
          <p className="mt-1 max-w-[80ch] text-[0.82rem] leading-[1.7] text-muted">
            지금 적재된 claim {fmt(view.claimTotal)}건 가운데{" "}
            <b className="font-semibold text-ink">{fmt(view.readableUnderActive)}건이 활성 계약으로 읽힙니다.</b>
          </p>
          <div className="mt-2.5 overflow-hidden rounded-xl border border-glass-line bg-card">
            <div className="grid grid-cols-[132px_minmax(0,1fr)_70px_110px] gap-3 border-b border-line
                            bg-fill-1 px-4 py-2 text-[0.68rem] uppercase tracking-[0.06em] text-muted">
              <span className="mono">버전</span>
              <span className="mono">확정</span>
              <span className="mono text-right">필드</span>
              <span className="mono text-right">처음 판독</span>
            </div>
            {view.versions.map((v) => (
              <div key={v.version}
                   className={`grid grid-cols-[132px_minmax(0,1fr)_70px_110px] items-baseline gap-3
                               border-t border-line px-4 py-2.5 first:border-t-0 ${
                     v.status === "ACTIVE" ? "bg-orange/[.05]" : ""}`}>
                <span className="text-[0.86rem] font-semibold text-navy">
                  v{v.version}
                  {v.status === "ACTIVE" && (
                    <span className="ml-1.5 rounded bg-orange-soft px-1.5 py-px align-[1px]
                                     text-[0.62rem] font-bold text-orange-deep">활성</span>
                  )}
                </span>
                <span className="mono text-[0.75rem] text-muted">
                  {v.approvedAt ? v.approvedAt.slice(0, 10) : "—"}
                  {v.approvedBy && ` · ${v.approvedBy}`}
                </span>
                <span className="text-right text-[0.8rem] tabular-nums text-body">{v.fieldCount}</span>
                <b className="text-right text-[0.9375rem] font-semibold tabular-nums text-ink">
                  {fmt(v.claimCount)}건
                </b>
              </div>
            ))}
          </div>
          {/* 08/31 팀장 지적: 「이 버전으로 판독 — v1.8 활성 2건」이 "지금 계약은 2건밖에
              못 읽었다"로 읽혔다. 실제로는 v1.0→v1.8 이 라벨·정의만 고친 개정이라 필드
              구성이 같고(서버가 두 본문의 키 집합을 대조해 잰다), 그래서 이미 읽은 건을
              다시 읽을 이유가 없었다. 그 사실을 화면이 주장하지 않고 측정값으로 말한다. */}
          <p className="mt-2.5 max-w-[80ch] text-[0.75rem] leading-[1.7] text-muted">
            {view.versions.every((v) => v.sameShapeAsActive) ? (
              <>
                이력의 모든 버전이 <b className="font-medium text-ink">활성 계약과 필드 구성이 같습니다</b> —
                라벨과 정의만 정정한 개정이므로 이미 판독한 건을 다시 읽을 필요가 없었습니다.
                「처음 판독」은 각 건이 어느 버전에서 처음 읽혔는지를 남긴 기록입니다.{" "}
              </>
            ) : (
              <>
                필드 구성이 다른 버전으로 읽은 건은 그 버전의 정의를 따릅니다 — 과거 데이터는
                생성 당시 버전으로 보존됩니다.{" "}
              </>
            )}
            값 코드·필드 이름·축 선언은 <b className="font-medium text-ink">확정 뒤 바뀌지 않습니다</b> —
            저장된 값이 그것을 가리키기 때문입니다. 라벨과 정의는 변경 심사를 거쳐 정정할 수 있습니다.
            전부 서버가 센 값입니다.
          </p>
        </>
      )}
    </div>
  );
}
