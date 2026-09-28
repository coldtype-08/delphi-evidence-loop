"use client";

/**
 * 신호 지도 — 인터랙티브판 (08/29 리디자인).
 *
 * `_viz.tsx`의 SignalMap 을 클라이언트로 옮긴 것이다. 옮긴 이유는 셋:
 *  ① SVG <title> 툴팁은 1초쯤 걸려 뜨고 줄바꿈·강조가 안 된다 — 커서 추적 툴팁으로.
 *  ② 칸이 **가설로 들어가는 입구**가 된다 — 클릭하면 그 환자군의 가설(#앵커)로 이동.
 *  ③ hover 한 칸만 남기고 나머지를 물러나게 한다 (globals.css `.sigmap` 규칙).
 *
 * **props 로 받은 서버 값을 좌표로만 변환한다 — 여기서 숫자를 만들지 않는다 (절대 규칙 #1).**
 * 툴팁의 «잠정 N회 · N인 / 공식 N건»도 서버가 준 두 값을 나란히 보여줄 뿐, 더하거나
 * 빼지 않는다 (절대 규칙 #3). 임계도 «기준 대 현재» 병기만 한다 — 뺄셈 없음.
 */

import { useRef, useState } from "react";
import { anchorTip } from "@/app/components/anchor";
import { useRouter } from "next/navigation";
import { squarify, type SignalCell } from "./_viz";

const fmt = (n: number) => n.toLocaleString("ko-KR");

type Tip = {
  cell: SignalCell;
  passed: boolean;
  hypId: string | null;
};

export default function SignalMapInteractive({
  cells,
  hypBySegment = {},
  width = 980,
  height = 520,
  threshold = { count: 5, hcp: 3 },
}: {
  cells: SignalCell[];
  /** segment → 그 환자군이 만든 가설 ID들. 서버(/analytics/segments)가 준다. */
  hypBySegment?: Record<string, string[]>;
  width?: number;
  height?: number;
  threshold?: { count: number; hcp: number };
}) {
  const router = useRouter();
  const tipRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [tip, setTip] = useState<Tip | null>(null);

  if (!cells.length) return null;

  const HEAD = 26, GAP = 9;
  const groups = new Map<string, SignalCell[]>();
  for (const c of cells) groups.set(c.segment, [...(groups.get(c.segment) ?? []), c]);

  const outer = squarify(
    [...groups].map(([seg, kids]) => ({
      key: seg, value: kids.reduce((s, k) => s + k.count, 0),
      label: kids[0].segmentKo, accent: kids[0].outOfLabel,
    })),
    width, height);

  const maxHcp = Math.max(1, ...cells.map((c) => c.hcp));
  const minHcp = Math.min(...cells.map((c) => c.hcp));
  // 독립 의료진 수 → 채도. 최솟값도 보이게 바닥을 준다.
  const shade = (h: number) =>
    maxHcp <= minHcp ? 0.7 : 0.14 + 0.66 * ((h - minHcp) / (maxHcp - minHcp));

  /** 팁을 **칸에 고정**한다 — 마우스든 키보드든 같은 자리 (08/30 2차 팀장 피드백:
   *  "마우스를 대면 너무 많이 움직여서 엄청 불편해"). 커서 추적을 쓰던 때는 큰 칸
   *  위에서 팝업이 칸 폭만큼 미끄러졌다. 위치는 리렌더 없이 transform 직접 조작이고,
   *  rAF 를 한 번 미루는 것은 **바뀐 내용의 실측 크기**를 읽기 위해서다. */
  const anchorTo = (e: { currentTarget: Element }) => {
    const el = tipRef.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const { x, y } = anchorTip(r0(r), {
        w: el.offsetWidth || 280, h: el.offsetHeight || 170, prefer: "right",
      });
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
  };
  /** anchorTip 은 요소를 받으므로, 이미 읽어 둔 사각형을 그대로 넘기기 위한 얇은 껍데기. */
  const r0 = (r: DOMRect) => ({ getBoundingClientRect: () => r }) as Element;

  const show = (c: SignalCell) =>
    setTip({
      cell: c,
      passed: c.count >= threshold.count && c.hcp >= threshold.hcp,
      hypId: hypBySegment[c.segment]?.[0] ?? null,
    });

  const go = (c: SignalCell) => {
    const hyp = hypBySegment[c.segment]?.[0];
    router.push(hyp ? `/hypotheses#${hyp}` : "/analytics?tab=segments");
  };

  return (
    <div className="overflow-x-auto">
      {/* height 는 **속성으로 주지 않는다** — SVG 는 length 만 받아서 "auto" 는
          `<svg> attribute height: Expected length, "auto"` 로 거부된다(08/30).
          viewBox 가 비율을 잡으므로 CSS `h-auto` 로 충분하다. */}
      <svg viewBox={`0 0 ${width} ${height}`} width="100%"
           role="group" className="sigmap block h-auto min-w-[700px]"
           aria-label="환자군별 신호 지도 — 칸 크기는 반복 횟수, 진하기는 독립 의료진 수. 칸을 누르면 그 환자군의 가설로 이동합니다.">
        {outer.map((g) => {
          const kids = groups.get(g.key) ?? [];
          if (g.w < 4 || g.h < 4) return null;
          const inner = squarify(
            kids.map((k) => ({ key: `${k.segment}|${k.signal}`, value: k.count, label: k.signalKo })),
            Math.max(0, g.w - GAP), Math.max(0, g.h - HEAD - GAP / 2),
            g.x + GAP / 2, g.y + HEAD);
          const byKey = new Map(kids.map((k) => [`${k.segment}|${k.signal}`, k]));
          return (
            <g key={g.key}>
              <rect x={g.x + 1} y={g.y + 1} width={Math.max(0, g.w - 2)} height={Math.max(0, g.h - 2)}
                    rx="8" fill="var(--navy)" fillOpacity={0.05} />
              {/* 긴 이름은 칸 폭까지만 — 안 자르면 옆 칸을 침범한다 */}
              <text x={g.x + 11} y={g.y + 18} fontSize="13.5" fontWeight="700" fill="var(--navy)"
                    className="pointer-events-none">
                {(() => {
                  const room = g.w - 22;
                  const max = Math.floor(room / 13.2);
                  return g.label.length > max ? g.label.slice(0, Math.max(2, max - 1)) + "…" : g.label;
                })()}
              </text>

              {inner.map((t) => {
                const c = byKey.get(t.key)!;
                const op = shade(c.hcp);
                const passed = c.count >= threshold.count && c.hcp >= threshold.hcp;
                // 흰 글자는 채도 0.62를 넘어야 4.5:1 언저리가 나온다 (실측). 그 아래는
                // 네이비 글자 + 종이색 헤일로 — 중간 채도 칸에서도 글자가 잠기지 않는다.
                const fg = op > 0.62 ? "var(--on-navy)" : "var(--navy)";
                const halo = op > 0.62
                  ? undefined
                  : { paintOrder: "stroke" as const, stroke: "rgba(252,252,250,0.9)",
                      strokeWidth: 2.5, strokeLinejoin: "round" as const };
                const full = c.signalFull;
                const label = t.w > full.length * 13.5 ? full : c.signalKo;
                const hypId = hypBySegment[c.segment]?.[0];
                return (
                  <g key={t.key} data-cell tabIndex={0} role="link"
                     aria-label={`${c.segmentKo} × ${full} — 잠정 ${fmt(c.count)}회 · 독립 의료진 ${c.hcp}인, 공식 ${fmt(c.official)}건. `
                       + (passed ? "임계 충족. " : `임계 미달 — 기준 ${threshold.count}회·${threshold.hcp}인. `)
                       + (hypId ? `누르면 ${hypId} 가설로 이동.` : "누르면 환자군 확장 표로 이동.")}
                     onMouseEnter={(e) => { show(c); anchorTo(e); }}
                     onMouseLeave={() => setTip(null)}
                     onFocus={(e) => { show(c); anchorTo(e); }}
                     onBlur={() => setTip(null)}
                     onClick={() => go(c)}
                     onKeyDown={(e) => {
                       if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(c); }
                       if (e.key === "Escape") setTip(null);
                     }}>
                    <rect x={t.x + 2} y={t.y + 2} width={Math.max(0, t.w - 4)} height={Math.max(0, t.h - 4)}
                          rx="5" fill="var(--navy)" fillOpacity={op}
                          stroke={passed ? undefined : fg}
                          strokeOpacity={passed ? undefined : 0.55}
                          strokeWidth={passed ? undefined : 1.2}
                          strokeDasharray={passed ? undefined : "4 3"} />

                    {t.w > 86 && t.h > 40 && (
                      <text x={t.x + 10} y={t.y + 21} fontSize="12.5" fill={fg} style={halo}
                            className="pointer-events-none">{label}</text>
                    )}
                    {t.w > 86 && t.h > 62 && (
                      <text x={t.x + 10} y={t.y + 43} className="mono pointer-events-none"
                            fontSize="17" fontWeight="500" fill={fg} style={halo}>
                        {fmt(c.count)}
                        <tspan fontSize="11.5" fillOpacity={0.9}> · {c.hcp}인</tspan>
                      </text>
                    )}
                    {t.w > 46 && t.h > 26 && !(t.w > 86 && t.h > 40) && (
                      <text x={t.x + 8} y={t.y + 20} className="mono pointer-events-none"
                            fontSize="13" fontWeight="500" fill={fg} style={halo}>
                        {fmt(c.count)}
                      </text>
                    )}
                    {/* hover·focus 윤곽 전용 덧그림 — globals.css `.sigmap` 규칙이 켠다 */}
                    <rect className="cell-hl" x={t.x + 2} y={t.y + 2}
                          width={Math.max(0, t.w - 4)} height={Math.max(0, t.h - 4)} rx="5" />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* 커서 추적 툴팁 — 한 개를 재사용한다. 그림자 없음 (docs/05 §9). */}
      <div ref={tipRef} aria-hidden
           className={`pointer-events-none fixed left-0 top-0 z-50 w-max max-w-[272px] break-keep rounded-lg
                       border border-line-2 bg-card px-3.5 py-3 transition-opacity duration-100
                       ${tip ? "opacity-100" : "opacity-0"}`}>
        {tip && (
          <>
            <div className="text-[0.75rem] uppercase tracking-[0.1em] text-faint">
              {tip.cell.segmentKo}
            </div>
            <div className="mt-0.5 text-[0.9375rem] font-bold leading-snug text-navy">
              {tip.cell.signalFull}
            </div>
            <p className="mt-1 text-[0.8125rem] leading-[1.6] text-muted">{tip.cell.signalDef}</p>
            <div className="mono mt-2 text-[1.0625rem] font-medium text-navy">
              {fmt(tip.cell.count)}
              <span className="text-[0.8125rem] font-normal">회</span>
              <span className="text-[0.8125rem] font-normal text-muted"> · {tip.cell.hcp}인</span>
              <span className="mx-1.5 text-[0.8125rem] font-normal text-faint">|</span>
              {/* 공식은 오렌지 «면 + 네이비 글자» 짝 — 오렌지 글자는 이 크기에서 대비 미달 */}
              {tip.cell.official > 0 ? (
                <span className="rounded bg-orange-soft px-1.5 py-px text-[0.875rem] text-navy">
                  공식 {fmt(tip.cell.official)}건
                </span>
              ) : (
                <span className="text-[0.875rem] text-faint">공식 0건</span>
              )}
            </div>
            <div className="mt-2">
              {tip.passed ? (
                <span className="inline-flex rounded-md border border-green/40 px-2 py-0.5
                                 text-[0.75rem] font-medium text-green">
                  임계 충족 ({threshold.count}회 · {threshold.hcp}인)
                </span>
              ) : (
                <span className="inline-flex rounded-md border border-dashed border-navy/40 px-2 py-0.5
                                 text-[0.75rem] text-muted">
                  임계 미달 — 기준 {threshold.count}회·{threshold.hcp}인, 현재 {fmt(tip.cell.count)}회·{tip.cell.hcp}인
                </span>
              )}
            </div>
            <p className="mono mt-2 text-[0.75rem] text-faint">
              {tip.hypId ? `클릭 → ${tip.hypId} 가설로 이동` : "클릭 → 환자군 확장 표로 이동"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
