"use client";

/**
 * 수집 현장 — 타일맵 + 권역 리포트의 연동 뷰 (08/30).
 * 데이터는 서버 페이지가 `/analytics/collection` 에서 받아 그대로 내려준다 —
 * 여기서는 선택 상태와 그리기만 한다 (절대 규칙 #1).
 *
 * 08/30 오후: 「KOL 탐색」 탭(`/analytics?tab=kol`)이 이 뷰를 그대로 재사용한다
 * (팀장 지시 — 미국 지도는 KOL 탐색 서브탭으로). 그 탭에는 월별 추이가 홈과
 * 겹치므로 `showTrend={false}` 로 끈다 — **같은 그림을 두 곳에 두지 않는다.**
 */

import { useState } from "react";
import { Panel, Eyebrow, Chip } from "@/app/components/ui";
import TileMap, { REGION_KO, SPEC_KO, type RegionMentions, type RegionRow } from "./_tilemap";
import CollectTrend, { type MonthPoint } from "@/app/components/collect-trend";

export default function CollectionView({
  regions,
  mentions,
  monthly,
  recentSince,
  showTrend = true,
}: {
  regions: RegionRow[];
  mentions?: Record<string, RegionMentions>;
  monthly: MonthPoint[];
  recentSince: string;
  showTrend?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const maxRate = Math.max(...regions.map((r) => r.blocks / Math.max(1, r.distinctHcp)));

  return (
    <>
      <div className="mt-8 grid gap-3.5 lg:grid-cols-12">
        {/* 좌 — 권역 리포트 */}
        <Panel pad="lg" className="lg:col-span-4">
          <div className="flex items-baseline gap-2.5">
            <Eyebrow>권역 리포트 · 통계적 패턴</Eyebrow>
          </div>
          <div className="mt-3 space-y-2.5">
            {regions.map((r) => {
              const rate = r.blocks / Math.max(1, r.distinctHcp);
              const on = selected === r.region;
              const dim = selected !== null && !on;
              return (
                <button
                  key={r.region}
                  type="button"
                  onClick={() => setSelected(on ? null : r.region)}
                  className={`block w-full rounded-xl border px-3.5 py-3 text-left transition-all ${
                    on
                      ? "border-line-2 bg-orange-soft"
                      : "border-line bg-card hover:border-line-2"
                  } ${dim ? "opacity-60" : ""}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[0.9375rem] font-semibold text-ink">
                      {REGION_KO[r.region] ?? r.region}
                    </span>
                    <span className="mono text-[0.75rem] tabular-nums text-faint">
                      {r.blocks}블록
                    </span>
                    <span className="mono ml-auto text-[0.8125rem] font-semibold tabular-nums text-navy">
                      {rate.toFixed(2)}건/인
                    </span>
                  </div>
                  <div className="mt-2 h-[7px] overflow-hidden rounded-md bg-fill-2">
                    <span
                      className="block h-full rounded-md"
                      style={{
                        width: `${((rate / maxRate) * 100).toFixed(1)}%`,
                        background: "linear-gradient(90deg, var(--orange-bright), var(--orange-deep))",
                      }}
                    />
                  </div>
                  <div className="mt-2 text-[0.75rem] leading-[1.6] text-faint">
                    의료진 {r.distinctHcp}인 · 최근 1년 접촉 {r.recentHcp}인 · 2년+ 공백 {r.gapHcp}인
                  </div>
                  {on && r.specialties.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
                      {r.specialties.map((s) => (
                        <Chip key={s.specialty}>
                          {SPEC_KO[s.specialty] ?? s.specialty}{" "}
                          <b className="tabular-nums text-navy">{s.hcpCount}</b>
                        </Chip>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Panel>

        {/* 우 — 타일맵 */}
        <Panel pad="lg" className="lg:col-span-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <Eyebrow>US 주(州) 타일맵 · 통계적 패턴</Eyebrow>
            <span className="text-[0.75rem] text-faint">
              칸 = 주 · 진할수록 권역의 1인당 면담 밀도가 높습니다 ·{" "}
              <b className="text-ink">올리면 권역이 떠오르며 상세 팝업</b> · 클릭 = 고정
            </span>
            <span className="ml-auto"><Chip>SQL 집계</Chip></span>
          </div>
          <div className="mx-auto mt-5 max-w-[720px]">
            <TileMap regions={regions} mentions={mentions} selected={selected} onSelect={setSelected} />
          </div>
          <p className="mt-4 text-[0.75rem] leading-[1.6] text-faint">
            주 단위 수치는 시스템에 없어(수집은 권역 단위) 칸은 권역 값을 입습니다 — 칸에 없는
            정밀도를 지어내지 않습니다. 최근 = {recentSince} 이후.
          </p>
        </Panel>
      </div>

      {showTrend && (
        <Panel pad="lg" className="mt-3.5">
          <Eyebrow>월별 수집량 · 관찰된 사실</Eyebrow>
          <div className="mt-3">
            <CollectTrend monthly={monthly} />
          </div>
        </Panel>
      )}
    </>
  );
}
