"use client";

/**
 * 수집 캘린더 — 전체 수집 기간의 점 (08/30). 진하기는 그 달의 블록 수(서버 값 그대로),
 * 점에 올리면 그 달의 블록·의료진 수가 팝업으로 뜬다 (native title → 커스텀 팁, 팀장 요청).
 *
 * 팁은 **점에 고정**한다 (08/30 2차 팀장 피드백) — 커서를 따라다니면 옆 칸으로 넘어갈 때
 * 팁이 미끄러져 어느 달을 읽고 있었는지 놓친다.
 */

import { useState } from "react";
import { anchorTip } from "./anchor";
import { TipHead, TipRow } from "./hover-tip";
import type { MonthPoint } from "./collect-trend";

export default function HeatDots({ monthly }: { monthly: MonthPoint[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; m: MonthPoint } | null>(null);
  const max = Math.max(1, ...monthly.map((x) => x.blocks));
  return (
    <>
      {/* 08/30 (팀장: "dot 들이 더 커도 될 것 같은데 지금 너무 작아서 카드 반도 안 차잖아"):
          17열 고정이라 68개월이 4줄로 눌려 카드 아래가 비었다. 열 수를 12(=1년)로 줄이면
          줄이 늘어 카드를 채우고, **한 줄 = 한 해**라 세로로 같은 달끼리 서서 계절성이
          눈에 들어온다 — 크기만 키우는 것보다 읽히는 것이 늘어난다. 모양도 점에서
          둥근 네모로 바꿨다(팀장 제안) — 칸이 커지면 원보다 격자가 안정적으로 보인다. */}
      <div className="grid h-full auto-rows-fr grid-cols-12 gap-[3px]">
        {monthly.map((x) => {
          const t = x.blocks / max;
          const bg =
            t > 0.72 ? "var(--orange)" : t > 0.45 ? "var(--orange-bright)" :
            t > 0.2 ? "var(--orange-soft)" : "rgba(22,38,97,0.10)";
          return (
            <span
              key={x.month}
              /* 정사각을 풀었다 — 12열을 지키면 좁은 타일에서 칸이 9px 까지 줄어 카드가
                 3분의 1도 안 찼다. 세로로 늘리면 «둥근 네모»(팀장 제안)가 되면서 칸이
                 두 배 이상 커지고, 한 줄 = 한 해라는 뜻은 그대로 남는다. */
              className="w-full rounded-[4px] transition-transform
                         hover:scale-110 hover:outline hover:outline-2 hover:outline-offset-1 hover:outline-navy"
              style={{ background: bg }}
              onMouseEnter={(e) =>
                setTip({ ...anchorTip(e.currentTarget, { w: 200, h: 88, gap: 8 }), m: x })}
              onMouseLeave={() => setTip(null)}
            />
          );
        })}
      </div>
      {tip && (
        <div className="tip-glass pointer-events-none fixed z-50 w-max rounded-2xl px-3.5 py-2.5
                        text-[0.75rem] leading-[1.65] text-on-navy"
             style={{ left: tip.x, top: tip.y }}>
          <TipHead>{tip.m.month}</TipHead>
          <TipRow k="면담 블록" v={`${tip.m.blocks}블록`} />
          <TipRow k="독립 의료진" v={`${tip.m.distinctHcp}인`} />
        </div>
      )}
    </>
  );
}
