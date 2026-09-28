"use client";

/**
 * 실행 기록 (AUDIT) — 08/28 신설.
 *
 * 여기 있는 것은 전부 **AI Readable 전환 화면에서 옮겨온 것**이다. 그 화면은 ⓪①②의
 * 순서를 걸어가는 자리인데, 호출 기록과 비용은 순서의 걸음이 아니라 **이미 끝난 일의
 * 증빙**이다. 순서 안에 끼어 있으면 "지금 이걸 해야 하나"로 읽힌다 — 위치로 성격을 말한다.
 *
 * 그리고 이 화면이 재현 가능성의 증거다: 실호출(정가)·배치(반값)·캐시 재생(0원)이
 * 구분돼 남으므로, 같은 결과를 0원으로 다시 재생할 수 있음을 숫자로 보인다.
 * 숫자는 전부 서버가 센 것이다 (llm_runs 테이블 · SQL 집계).
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Panel, Eyebrow, Chip, Btn, Topbar, TabBar } from "@/app/components/ui";

type Mode = "REALTIME" | "BATCH" | "CACHE";
type CostSummary = {
  computedBy: string; totalCalls: number; spentUsd: number; fullPriceUsd: number;
  savedUsd: number; promptCacheHitTokens: number; noteKo: string;
  byMode: Record<string, { calls: number; costUsd: number; inputTokens: number; outputTokens: number; cacheReadTokens: number }>;
};
type Run = {
  id: number; createdAt: string; purpose: string; model: string; promptVersion: string;
  latencyMs: number; cached: boolean; callMode: string; costUsd?: number | null; cacheReadTokens?: number | null;
};

const MODE: Record<string, { label: string; icon: string; tone: "orange" | "plain" }> = {
  REALTIME: { label: "실호출 (정가)", icon: "⚡", tone: "plain" },
  BATCH:    { label: "배치 (반값)",   icon: "📦", tone: "orange" },
  CACHE:    { label: "캐시 재생 (0원)", icon: "🔁", tone: "plain" },
};
const hhmm = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

export default function AuditPage() {
  const [tab, setTab] = useState<"cost" | "runs">("cost");
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<CostSummary>("/system/cost-summary").then(setCost)
      .catch((e) => setErr(e instanceof ApiError ? e.message : String(e)));
    api<Run[]>("/llm-runs?limit=60").then(setRuns).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const savedPct = cost && cost.fullPriceUsd > 0 ? Math.round((cost.savedUsd / cost.fullPriceUsd) * 100) : 0;

  return (
    <>
      <Topbar
        title="실행 기록"
        right={<Btn size="sm" onClick={load}>새로고침</Btn>}
      />

      <div className="mx-auto max-w-5xl">
        <Eyebrow>AUDIT</Eyebrow>
        <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
          모델을 언제 얼마나 불렀는가
        </h1>
        <p className="mt-1.5 max-w-[70ch] text-[0.9375rem] leading-[1.7] text-body">
          화면이 세지 않습니다 — 서버가 남긴 호출 기록(<code className="mono text-[0.875rem]">llm_runs</code>)의 SQL 집계입니다.
        </p>

        <TabBar
          active={tab}
          onSelect={(id) => setTab(id as "cost" | "runs")}
          items={[{ id: "cost", label: "API 사용 금액" }, { id: "runs", label: "호출 하나씩" }]}
        />

        {err && (
          <Panel tone="note" pad="md" className="mt-4 text-[0.9375rem] leading-[1.7] text-rust">{err}</Panel>
        )}

        {/* ── API 사용 금액 ─────────────────────────────────────────── */}
        {tab === "cost" && (
          !cost || cost.totalCalls === 0 ? (
            <Panel pad="lg" className="mt-5 border-dashed">
              <p className="text-[0.9375rem] leading-[1.7] text-muted">
                아직 호출 기록이 없습니다 — <b className="text-ink">AI Readable 전환</b>에서 판독을 돌리면 여기 쌓입니다.
              </p>
            </Panel>
          ) : (
            <>
              <Panel as="section" pad="lg" className="mt-5">
                <div className="flex flex-wrap items-end gap-x-12 gap-y-5">
                  <div>
                    <Eyebrow>실제 지출</Eyebrow>
                    <div className="mt-2 text-[2.6rem] font-bold leading-none tabular-nums tracking-tight text-navy">
                      ${cost.spentUsd.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <Eyebrow>전부 정가였다면</Eyebrow>
                    <div className="mt-2 text-[1.5rem] font-bold leading-none tabular-nums tracking-tight text-faint line-through">
                      ${cost.fullPriceUsd.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <Eyebrow>절감</Eyebrow>
                    <div className="mt-2 text-[1.5rem] font-bold leading-none tabular-nums tracking-tight text-green">
                      ${cost.savedUsd.toFixed(2)}
                      {savedPct > 0 && <span className="ml-1.5 text-[0.9375rem] font-medium">{savedPct}%</span>}
                    </div>
                  </div>
                </div>
                <p className="mt-5 border-t border-line pt-3.5 text-xs leading-[1.7] text-muted">{cost.noteKo}</p>
              </Panel>

              <Panel as="section" pad="lg" className="mt-3">
                <Eyebrow>호출 방식별</Eyebrow>
                <div className="mt-3.5 overflow-x-auto">
                  <table className="w-full text-left text-[0.875rem]">
                    <thead>
                      <tr className="border-b border-line-2">
                        {["방식", "호출", "비용", "입력 토큰", "출력 토큰", "캐시 읽기"].map((h) => (
                          <th key={h} className="bg-fill-1 px-3 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-faint">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(cost.byMode).map(([mode, v]) => {
                        const m = MODE[mode] ?? { label: mode, icon: "•", tone: "plain" as const };
                        return (
                          <tr key={mode} className="border-b border-line last:border-0">
                            <td className="px-3 py-2.5"><Chip tone={m.tone}><span aria-hidden>{m.icon}</span>{m.label}</Chip></td>
                            <td className="mono px-3 py-2.5 tabular-nums text-navy">{v.calls.toLocaleString()}</td>
                            <td className="mono px-3 py-2.5 tabular-nums text-navy">${v.costUsd.toFixed(4)}</td>
                            <td className="mono px-3 py-2.5 tabular-nums text-muted">{v.inputTokens.toLocaleString()}</td>
                            <td className="mono px-3 py-2.5 tabular-nums text-muted">{v.outputTokens.toLocaleString()}</td>
                            <td className="mono px-3 py-2.5 tabular-nums text-muted">{v.cacheReadTokens.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {cost.promptCacheHitTokens > 0 && (
                  <p className="mt-3.5 text-xs leading-[1.7] text-muted">
                    프롬프트 캐시로 재사용된 입력{" "}
                    <b className="text-ink">{(cost.promptCacheHitTokens / 1_000_000).toFixed(1)}M 토큰</b>
                    {" "}— 이 부분은 정가의 10%로 과금됩니다.
                  </p>
                )}
              </Panel>
            </>
          )
        )}

        {/* ── 호출 하나씩 ───────────────────────────────────────────── */}
        {tab === "runs" && (
          !runs || runs.length === 0 ? (
            <Panel pad="lg" className="mt-5 border-dashed">
              <p className="text-[0.9375rem] leading-[1.7] text-muted">
                아직 호출 기록이 없습니다 — <b className="text-ink">AI Readable 전환</b>에서 판독을 돌리면 여기 쌓입니다.
              </p>
            </Panel>
          ) : (
            <Panel as="section" pad="lg" className="mt-5">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <Eyebrow>최근 {runs.length}건</Eyebrow>
                <span className="text-xs text-muted">실호출·배치·캐시 재생을 구분해 기록합니다</span>
              </div>
              <div className="mono mt-3.5 max-h-[28rem] overflow-auto text-[0.75rem] leading-relaxed">
                {runs.map((r) => {
                  const mode = r.callMode === "BATCH" ? "BATCH" : r.cached ? "CACHE" : "REALTIME";
                  const m = MODE[mode];
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-line py-1.5 last:border-0">
                      <span className="text-faint">#{r.id}</span>
                      <span className="text-faint">{hhmm(r.createdAt)}</span>
                      <b className="font-medium text-ink">{r.purpose}</b>
                      <code className="text-navy">{r.model}</code>
                      <span className="text-faint">{r.promptVersion}</span>
                      {(r.cacheReadTokens ?? 0) > 0 && (
                        <Chip><span aria-hidden>♻️</span>{((r.cacheReadTokens ?? 0) / 1000).toFixed(1)}k</Chip>
                      )}
                      {(r.costUsd ?? 0) > 0 && <span className="tabular-nums text-muted">${(r.costUsd ?? 0).toFixed(5)}</span>}
                      <span className="ml-auto">
                        <Chip tone={m.tone}>
                          <span aria-hidden>{m.icon}</span>{m.label}
                          {mode === "REALTIME" && <span className="text-faint"> {r.latencyMs.toLocaleString()}ms</span>}
                        </Chip>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )
        )}
      </div>
    </>
  );
}
