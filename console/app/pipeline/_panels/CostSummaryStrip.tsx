"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CostSummary } from "../_lib/types";
import { MODE_KO } from "../_lib/const";
import { Panel, Eyebrow, Chip } from "@/app/components/ui";

export default function CostSummaryStrip({ refreshKey }: { refreshKey: number }) {
  const [c, setC] = useState<CostSummary | null>(null);
  useEffect(() => {
    api<CostSummary>("/system/cost-summary").then(setC).catch(() => {});
  }, [refreshKey]);
  if (!c || c.totalCalls === 0) return null;
  const savedPct = c.fullPriceUsd > 0 ? Math.round((c.savedUsd / c.fullPriceUsd) * 100) : 0;
  return (
    <Panel as="section" pad="lg">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Eyebrow>비용 구조 — 실측</Eyebrow>
        <span className="mono text-[0.75rem] text-muted">
          호출 {c.totalCalls.toLocaleString()}건의 실제 과금액 · SQL 집계 · {c.noteKo}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <Eyebrow>실제 지출</Eyebrow>
          <div className="mt-2 text-[1.0625rem] font-medium tabular-nums leading-none text-navy">${c.spentUsd.toFixed(4)}</div>
        </div>
        <div>
          <Eyebrow>전부 정가 실호출이었다면</Eyebrow>
          <div className="mt-2 text-[1.0625rem] font-medium tabular-nums leading-none text-faint line-through">${c.fullPriceUsd.toFixed(4)}</div>
        </div>
        <div>
          <Eyebrow>절감</Eyebrow>
          <div className="mt-2 text-[1.0625rem] font-medium tabular-nums leading-none text-green">
            ${c.savedUsd.toFixed(4)} {savedPct > 0 && <span className="text-[0.9375rem]">({savedPct}%)</span>}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {Object.entries(c.byMode).map(([mode, v]) => {
            const m = MODE_KO[mode] ?? { label: mode, icon: "•" };
            return (
              <Chip key={mode} tone={mode === "BATCH" ? "orange" : "plain"}>
                <span aria-hidden>{m.icon}</span>{m.label} {v.calls.toLocaleString()}건
                {v.costUsd > 0 && <span className="text-faint">· ${v.costUsd.toFixed(4)}</span>}
              </Chip>
            );
          })}
          {c.promptCacheHitTokens > 0 && (
            <span title="프롬프트 캐싱으로 재사용된 입력 토큰 — 이 부분은 정가의 10%로 과금됩니다">
              <Chip><span aria-hidden>♻️</span>프롬프트 캐시 적중 {(c.promptCacheHitTokens / 1000).toFixed(0)}k 토큰</Chip>
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}
