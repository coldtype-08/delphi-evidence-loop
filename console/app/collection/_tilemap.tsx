"use client";

/**
 * US 주(州) 타일맵 — NYT 배치 (08/30, 팀장 확정 목업).
 *
 * 칸 하나 = 주 하나, 색 농도 = 그 주가 속한 권역의 1인당 면담 밀도(진할수록 촘촘).
 * 주 단위 수치는 시스템에 없으므로(수집은 권역 단위) 주 칸은 **권역 해상도의 값**을
 * 입는다 — 칸에 없는 정밀도를 지어내지 않는다 (절대 규칙 #1의 정신).
 * 클릭 = 권역 선택(같은 권역 재클릭 = 해제) — 옆의 권역 리포트와 연동된다.
 *
 * 08/30 팀장 요청 — 호버 인터랙션: 마우스를 올리면 그 권역의 칸이 **떠오르고**
 * **상세 팝업**이 뜬다: 밀도·접촉·공백, 많이 얻어지는 언급(/analytics/mentions
 * byRegion — 결정론 집계), 신호 상위, 전문 분야 분포. 팝업의 숫자도 전부 서버
 * 값이다 — 여기는 그리기만 한다.
 *
 * 08/30 2차 — 팝업은 **올린 칸에 고정**한다(커서 추적 폐기, 팀장: "마우스를 대면 너무
 * 많이 움직여서 엄청 불편해"). 칸을 옮길 때만 팝업이 옮겨가므로, 한 권역을 읽는 동안은
 * 완전히 멈춰 있다. 칸이 떠오르는 것(-4px·1.06배)은 «지금 이 칸» 표시라 그대로 둔다.
 */

import { useMemo, useRef, useState } from "react";
import { anchorWithin } from "@/app/components/anchor";

export type RegionRow = {
  region: string; blocks: number; distinctHcp: number;
  recentBlocks: number; recentHcp: number; gapHcp: number;
  specialties: { specialty: string; hcpCount: number }[];
};

/** `/analytics/mentions` byRegion 한 칸 — 지도 팝업의 언급 상위 재료. */
export type RegionMentions = {
  diseases: { key: string; ko: string; labelScope: string; blocks: number; distinctHcp: number }[];
  signals: { key: string; ko: string; blocks: number; distinctHcp: number }[];
};

const REGION_KO: Record<string, string> = {
  NORTHEAST: "북동부", MIDWEST: "중서부", SOUTH: "남부", WEST: "서부",
};
const SPEC_KO: Record<string, string> = {
  NEUROLOGY: "신경과", EPILEPTOLOGY: "뇌전증 전문", PSYCHIATRY: "정신건강의학과", GENERAL: "일반의",
};

/** NYT 타일맵 배치 (12열 × 8행) — 북동부 계단(ME·MA·RI 외곽열, MI–NY 공백) 포함. */
const STATES: Record<string, [number, number]> = {
  AK: [0, 0], ME: [11, 0],
  VT: [9, 1], NH: [10, 1], MA: [11, 1],
  WA: [1, 2], MT: [2, 2], ND: [3, 2], SD: [4, 2], MN: [5, 2], WI: [6, 2], MI: [7, 2],
  NY: [9, 2], CT: [10, 2], RI: [11, 2],
  OR: [1, 3], ID: [2, 3], WY: [3, 3], NE: [4, 3], IA: [5, 3], IL: [6, 3], IN: [7, 3],
  OH: [8, 3], PA: [9, 3], NJ: [10, 3],
  CA: [0, 4], NV: [1, 4], UT: [2, 4], CO: [3, 4], KS: [4, 4], MO: [5, 4], KY: [6, 4],
  WV: [7, 4], DC: [8, 4], MD: [9, 4], DE: [10, 4],
  AZ: [2, 5], NM: [3, 5], OK: [4, 5], AR: [5, 5], TN: [6, 5], VA: [7, 5], NC: [8, 5],
  TX: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6], SC: [8, 6],
  HI: [0, 7], FL: [7, 7],
};
const STATE_REGION: Record<string, string[]> = {
  WEST: ["AK", "HI", "WA", "OR", "CA", "MT", "ID", "NV", "WY", "UT", "CO", "AZ", "NM"],
  MIDWEST: ["ND", "SD", "NE", "KS", "MN", "IA", "MO", "WI", "IL", "IN", "MI", "OH"],
  SOUTH: ["TX", "OK", "AR", "LA", "MS", "AL", "TN", "KY", "GA", "FL", "SC", "NC", "VA", "WV", "MD", "DE", "DC"],
  NORTHEAST: ["PA", "NJ", "NY", "CT", "RI", "MA", "VT", "NH", "ME"],
};

/** 팝업 안의 이름+바+숫자 한 줄 */
function PopRow({ name, ratio, n, hot }: { name: React.ReactNode; ratio: number; n: number; hot?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_60px_34px] items-center gap-2 py-px text-[0.75rem]">
      <span className="truncate text-body">{name}</span>
      <span className="h-[6px] overflow-hidden rounded-md bg-fill-2">
        <span className="block h-full rounded-md"
              style={{
                width: `${(ratio * 100).toFixed(0)}%`,
                background: hot
                  ? "linear-gradient(90deg, var(--orange-bright), var(--orange-deep))"
                  : "#5E71A8",
              }} />
      </span>
      <b className="text-right tabular-nums text-ink">{n}</b>
    </div>
  );
}

export default function TileMap({
  regions,
  mentions,
  selected,
  onSelect,
}: {
  regions: RegionRow[];
  mentions?: Record<string, RegionMentions>;
  selected: string | null;
  onSelect: (r: string | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [tipAt, setTipAt] = useState<{ x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const byRegion = useMemo(
    () => Object.fromEntries(regions.map((r) => [r.region, r])),
    [regions],
  );
  // 색 농도 = 밀도 순위 — 값은 서버 것, 순위 매김만 표시 가공이다.
  const ranked = useMemo(
    () =>
      regions
        .slice()
        .sort((a, b) => b.blocks / Math.max(1, b.distinctHcp) - a.blocks / Math.max(1, a.distinctHcp))
        .map((r, i) => [r.region, i] as const),
    [regions],
  );
  const rankOf = Object.fromEntries(ranked);
  const FILL = ["#162661", "#33487F", "#5E71A8", "#97A2C4"]; // 진함 = 밀도 1위

  const regionOf = (st: string) =>
    Object.keys(STATE_REGION).find((k) => STATE_REGION[k].includes(st))!;

  const hd = hover ? byRegion[hover] : null;
  const hm = hover ? mentions?.[hover] : null;
  const dMax = Math.max(1, ...(hm?.diseases ?? []).map((x) => x.blocks));
  const sMax = Math.max(1, ...(hd?.specialties ?? []).map((x) => x.hcpCount));

  const CELL = 100 / 12;
  return (
    // 팝업 좌표의 기준 컨테이너 — 지도 밖(카드 패딩)까지 팝업이 나갈 수 있게 relative 는 여기다.
    <div className="relative" ref={boxRef}>
      <div className="relative w-full" style={{ aspectRatio: "12 / 8" }}>
        {Object.entries(STATES).map(([st, [c, r]]) => {
          const reg = regionOf(st);
          const isSel = selected === reg;
          const dim = selected !== null && !isSel;
          const isHover = hover === reg;
          return (
            <button
              key={st}
              type="button"
              onClick={() => onSelect(isSel ? null : reg)}
              onMouseEnter={(e) => {
                setHover(reg);
                // 칸 오른쪽에 팝업(288px) — 넘치면 왼쪽으로 뒤집고, 세로는 카드 안으로 접는다
                if (boxRef.current) {
                  setTipAt(anchorWithin(e.currentTarget, boxRef.current, { w: 288, h: 210 }));
                }
              }}
              onMouseLeave={() => setHover(null)}
              className="absolute flex items-center justify-center rounded-lg text-[0.6875rem] font-semibold
                         transition-[transform,opacity,box-shadow] duration-150 motion-reduce:transition-none
                         motion-reduce:transform-none"
              style={{
                left: `${c * CELL + 0.35}%`,
                top: `${(r * 100) / 8 + 0.5}%`,
                width: `${CELL - 0.7}%`,
                height: `${100 / 8 - 1}%`,
                background: isSel ? "var(--orange)" : FILL[rankOf[reg] ?? 3],
                color: isSel ? "var(--navy)" : "rgba(252,252,250,0.92)",
                opacity: dim ? 0.55 : 1,
                zIndex: isHover ? 2 : undefined,
                transform: isHover && !dim ? "translateY(-4px) scale(1.06)" : undefined,
                boxShadow: isHover && !dim ? "0 12px 22px rgba(22,38,97,0.30)" : "0 2px 0 rgba(22,38,97,0.14)",
              }}
            >
              {st}
            </button>
          );
        })}
      </div>

      {/* 권역 상세 팝업 — **올린 칸에 고정**. 숫자는 전부 서버 값(collection + mentions byRegion)이다. */}
      {hd && tipAt && (
        <div
          className="pointer-events-none absolute z-10 w-[288px] rounded-[14px] border border-line-2
                     bg-card p-3.5 pb-3 shadow-[0_18px_44px_rgba(22,38,97,0.20)]"
          style={{ left: tipAt.x, top: tipAt.y }}
        >
          <div className="flex items-baseline gap-2">
            <b className="text-[1rem] text-ink">{REGION_KO[hd.region] ?? hd.region}</b>
            <span className="mono text-[0.75rem] tabular-nums text-faint">{hd.blocks}블록</span>
            <b className="ml-auto text-[0.875rem] tabular-nums text-orange-deep">
              {(hd.blocks / Math.max(1, hd.distinctHcp)).toFixed(2)}건/인
            </b>
          </div>
          <div className="mt-0.5 text-[0.75rem] leading-[1.6] text-muted">
            의료진 {hd.distinctHcp}인 · 최근 1년 접촉{" "}
            <b className="tabular-nums text-ink">{hd.recentHcp}</b>인 · 2년+ 공백{" "}
            <b className="tabular-nums text-ink">{hd.gapHcp}</b>인
          </div>
          {hm && hm.diseases.length > 0 && (
            <>
              <div className="mono mt-2.5 mb-1 text-[0.625rem] uppercase tracking-[0.12em] text-faint">
                많이 얻어지는 언급 · 결정론 집계
              </div>
              {hm.diseases.map((x) => (
                <PopRow key={x.key} n={x.blocks} ratio={x.blocks / dMax}
                        hot={x.labelScope === "OUT_OF_LABEL"}
                        name={<>{x.ko}{x.labelScope === "OUT_OF_LABEL" &&
                          <b className="ml-1 text-orange-deep">밖</b>}</>} />
              ))}
            </>
          )}
          {hm && hm.signals.length > 0 && (
            <>
              <div className="mono mt-2.5 mb-1 text-[0.625rem] uppercase tracking-[0.12em] text-faint">
                신호 상위
              </div>
              <div className="flex flex-wrap gap-1">
                {hm.signals.map((x) => (
                  <span key={x.key}
                        className="rounded-full border border-line bg-card px-2 py-px text-[0.6875rem] text-muted">
                    {x.ko} <b className="tabular-nums text-navy">{x.blocks}</b>
                  </span>
                ))}
              </div>
            </>
          )}
          {hd.specialties.length > 0 && (
            <>
              <div className="mono mt-2.5 mb-1 text-[0.625rem] uppercase tracking-[0.12em] text-faint">
                전문 분야 분포 · 의료진 수
              </div>
              {hd.specialties.map((x) => (
                <div key={x.specialty}
                     className="grid grid-cols-[minmax(0,1fr)_60px_34px] items-center gap-2 py-px text-[0.75rem]">
                  <span className="truncate text-body">{SPEC_KO[x.specialty] ?? x.specialty}</span>
                  <span className="h-[6px] overflow-hidden rounded-md bg-fill-2">
                    <span className="block h-full rounded-md bg-line-2"
                          style={{ width: `${((x.hcpCount / sMax) * 100).toFixed(0)}%` }} />
                  </span>
                  <b className="text-right tabular-nums text-ink">{x.hcpCount}</b>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { REGION_KO, SPEC_KO };
