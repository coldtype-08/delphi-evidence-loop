"use client";

/**
 * 월별 수집 추이 — 68개월 area 차트 (08/30, 홈·수집 현장 공용).
 *
 * 숫자는 `/analytics/collection` 의 SQL 집계 그대로다 — 이 컴포넌트는 그리기만 한다
 * (절대 규칙 #1). 호버 십자선과 「전체/최근 24개월」 토글만 클라이언트 상태다.
 */

import { useMemo, useRef, useState } from "react";

export type MonthPoint = { month: string; blocks: number; distinctHcp: number };

export default function CollectTrend({ monthly }: { monthly: MonthPoint[] }) {
  const [range, setRange] = useState<"all" | "24">("all");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const m = range === "24" ? monthly.slice(-24) : monthly;
  const W = 960, H = 210, PL = 36, PR = 12, PT = 12, PB = 26;
  const IW = W - PL - PR, IH = H - PT - PB;
  const max = Math.max(1, ...m.map((x) => x.blocks));
  const X = (i: number) => PL + (i / Math.max(1, m.length - 1)) * IW;
  const Y = (v: number) => PT + IH - (v / max) * IH;

  const line = useMemo(
    () => m.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(x.blocks).toFixed(1)}`).join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m, max],
  );
  const years = useMemo(() => {
    const seen = new Set<string>();
    return m
      .map((x, i) => ({ y: x.month.slice(0, 4), i }))
      .filter(({ y }) => (seen.has(y) ? false : (seen.add(y), true)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m]);

  const onMove = (e: React.MouseEvent) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(m.length - 1, Math.round(((sx - PL) / IW) * (m.length - 1))));
    setHover(i);
  };

  return (
    <div>
      <div className="flex items-center gap-1.5">
        {(["all", "24"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { setRange(k); setHover(null); }}
            className={`rounded-lg border px-2.5 py-1 text-[0.75rem] font-medium transition-colors ${
              range === k
                ? "border-navy bg-navy text-on-navy"
                : "border-line bg-card text-muted hover:text-ink"
            }`}
          >
            {k === "all" ? `전체 ${monthly.length}개월` : "최근 24개월"}
          </button>
        ))}
        {hover !== null && m[hover] && (
          <span className="mono ml-auto text-[0.75rem] tabular-nums text-muted">
            {m[hover].month} · <b className="text-ink">{m[hover].blocks}</b>블록 · 의료진{" "}
            {m[hover].distinctHcp}인
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block w-full"
        role="img"
        aria-label={`월별 면담 블록 수 추이 (${m[0]?.month} ~ ${m[m.length - 1]?.month})`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="ct-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--orange)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--orange)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PL} x2={W - PR} y1={PT + IH - f * IH} y2={PT + IH - f * IH}
                  stroke="var(--line)" strokeWidth="1" />
            <text x={PL - 6} y={PT + IH - f * IH + 3.5} textAnchor="end"
                  className="fill-[var(--faint)] text-[9px] tabular-nums">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {years.map(({ y, i }) => (
          <text key={y} x={X(i)} y={H - 8} className="fill-[var(--faint)] text-[9.5px] tabular-nums">
            {y}
          </text>
        ))}
        <path d={`${line} L${X(m.length - 1)} ${PT + IH} L${PL} ${PT + IH} Z`} fill="url(#ct-fill)" />
        <path d={line} fill="none" stroke="var(--orange-deep)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
        {m.length > 0 && (
          <circle cx={X(m.length - 1)} cy={Y(m[m.length - 1].blocks)} r="4"
                  fill="var(--orange-deep)" stroke="var(--paper)" strokeWidth="2" />
        )}
        {hover !== null && m[hover] && (
          <g pointerEvents="none">
            <line x1={X(hover)} x2={X(hover)} y1={PT} y2={PT + IH}
                  stroke="var(--navy)" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
            <circle cx={X(hover)} cy={Y(m[hover].blocks)} r="3.5"
                    fill="var(--navy)" stroke="var(--paper)" strokeWidth="1.5" />
          </g>
        )}
      </svg>
    </div>
  );
}
