/**
 * 분석 탭의 도식 — 전부 손으로 그린 SVG다 (08/28).
 *
 * 왜 라이브러리를 안 쓰나. 이 화면들은 서버 컴포넌트고, 차트 라이브러리는 대부분 클라이언트
 * 훅을 요구한다. 그러면 숫자가 브라우저로 내려가 거기서 다시 계산되는 구조가 되는데,
 * 이 제품은 **숫자가 어디서 나왔는지**가 논지다 (절대 규칙 #1). 서버가 준 값을 좌표로만
 * 바꾸는 순수 함수면 그 논지가 유지된다.
 *
 * 색 규율 (docs/05 · globals.css):
 *  - 네이비 한 색의 **채도**로 크기를 말한다. 무지개 팔레트를 쓰지 않는다 —
 *    등급은 색이 아니라 채도로 가른다는 것이 이 제품의 규칙이다.
 *  - 오렌지는 **사람이 승인한 것**과 **지금 볼 것** 딱 두 가지에만 쓴다.
 *  - 러스트는 안전성 전용. 다른 탭에 나타나면 안 된다 (절대 규칙 #6이 눈에 보이게).
 */

/* 값 → 네이비 채도. 0이면 거의 안 보이고, 최대면 진하다. */
export const ink = (v: number, max: number, lo = 0.1, hi = 0.82) =>
  max <= 0 ? lo : lo + (hi - lo) * Math.sqrt(v / max);

const fmt = (n: number) => n.toLocaleString("ko-KR");

/* ── 트리맵 ────────────────────────────────────────────────────────
   "사각형 크기가 값" — 팀장이 말한 나스닥 지도(Finviz)의 그 형태.
   squarified 배치를 직접 구현한다: 남은 영역의 짧은 변을 기준으로 줄을 채우고,
   가로세로비가 나빠지기 직전에 줄을 끊는다. 긴 띠 대신 정사각형에 가까운 칸이 나온다. */
type Cell = { key: string; value: number; label: string; sub?: string; accent?: boolean };
type Placed = Cell & { x: number; y: number; w: number; h: number };

export function squarify(items: Cell[], W: number, H: number, X0 = 0, Y0 = 0): Placed[] {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];
  const scale = (W * H) / total;
  const out: Placed[] = [];
  let x = X0, y = Y0, w = W, h = H;
  let rest = [...items].sort((a, b) => b.value - a.value);

  const worst = (row: Cell[], side: number) => {
    const s = row.reduce((t, i) => t + i.value * scale, 0);
    const mx = Math.max(...row.map((i) => i.value * scale));
    const mn = Math.min(...row.map((i) => i.value * scale));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };

  while (rest.length) {
    const side = Math.min(w, h);
    const row: Cell[] = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) {
      row.push(rest[i]); i++;
    }
    const area = row.reduce((t, c) => t + c.value * scale, 0);
    const thick = area / side;
    let off = 0;
    for (const c of row) {
      const len = (c.value * scale) / thick;
      out.push(w >= h
        ? { ...c, x, y: y + off, w: thick, h: len }
        : { ...c, x: x + off, y, w: len, h: thick });
      off += len;
    }
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    rest = rest.slice(row.length);
  }
  return out;
}

export function Treemap({
  items, width = 980, height = 340, unit = "건",
}: { items: Cell[]; width?: number; height?: number; unit?: string }) {
  const cells = squarify(items.filter((i) => i.value > 0), width, height);
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}
           role="img" aria-label="질환별 언급 규모" className="block">
        {cells.map((c) => {
          const big = c.w > 96 && c.h > 34;
          const mid = c.w > 62 && c.h > 22;
          return (
            <g key={c.key}>
              <rect x={c.x + 1} y={c.y + 1} width={Math.max(0, c.w - 2)} height={Math.max(0, c.h - 2)}
                    rx="5" fill="var(--navy)" fillOpacity={ink(c.value, max)} />
              {c.accent && (
                <rect x={c.x + 1} y={c.y + 1} width={Math.max(0, c.w - 2)} height={Math.max(0, c.h - 2)}
                      rx="5" fill="none" stroke="var(--orange)" strokeWidth="2" />
              )}
              {mid && (
                <text x={c.x + 9} y={c.y + 19} fill="#fff" fillOpacity={ink(c.value, max) > 0.42 ? 0.96 : 0.001}
                      fontSize="11.5" fontWeight="500">
                  {c.label.length > Math.floor(c.w / 7.2) ? c.label.slice(0, Math.floor(c.w / 7.2) - 1) + "…" : c.label}
                </text>
              )}
              {mid && ink(c.value, max) <= 0.42 && (
                <text x={c.x + 9} y={c.y + 19} fill="var(--navy)" fontSize="11.5" fontWeight="500">
                  {c.label.length > Math.floor(c.w / 7.2) ? c.label.slice(0, Math.floor(c.w / 7.2) - 1) + "…" : c.label}
                </text>
              )}
              {big && (
                <text x={c.x + 9} y={c.y + 35} className="mono"
                      fill={ink(c.value, max) > 0.42 ? "#fff" : "var(--navy)"}
                      fillOpacity={ink(c.value, max) > 0.42 ? 0.75 : 0.55} fontSize="10.5">
                  {fmt(c.value)}{unit}{c.sub ? ` · ${c.sub}` : ""}
                </text>
              )}
              <title>{`${c.label} — ${fmt(c.value)}${unit}${c.sub ? ` · ${c.sub}` : ""}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── 생키 ──────────────────────────────────────────────────────────
   왼쪽 환자군 → 오른쪽 신호 유형. 띠의 두께가 발언 수다.
   "어느 환자군이 어떤 종류의 말을 하는가"는 표에서는 안 보이고 여기서만 보인다. */
type Flow = { from: string; to: string; value: number; accent?: boolean };

export function Sankey({
  flows, leftLabel, rightLabel, width = 980, rowH = 26, gap = 6,
}: {
  flows: Flow[];
  leftLabel: (k: string) => string;
  rightLabel: (k: string) => string;
  width?: number; rowH?: number; gap?: number;
}) {
  const lKeys = [...new Set(flows.map((f) => f.from))];
  const rKeys = [...new Set(flows.map((f) => f.to))];
  const sum = (k: string, side: "from" | "to") =>
    flows.filter((f) => f[side] === k).reduce((s, f) => s + f.value, 0);
  lKeys.sort((a, b) => sum(b, "from") - sum(a, "from"));
  rKeys.sort((a, b) => sum(b, "to") - sum(a, "to"));

  const total = flows.reduce((s, f) => s + f.value, 0);
  const H = Math.max(lKeys.length, rKeys.length) * (rowH + gap) + 40;
  const usable = H - 30;
  const px = (v: number) => Math.max(2.5, (v / total) * (usable - (Math.max(lKeys.length, rKeys.length) - 1) * gap));

  const nodeX = { l: 172, r: width - 172 };
  const place = (keys: string[], side: "from" | "to") => {
    const m: Record<string, { y: number; h: number }> = {};
    let y = 14;
    for (const k of keys) { const h = px(sum(k, side)); m[k] = { y, h }; y += h + gap; }
    return m;
  };
  const L = place(lKeys, "from"), R = place(rKeys, "to");
  const lOff: Record<string, number> = {}, rOff: Record<string, number> = {};
  const max = Math.max(...flows.map((f) => f.value));

  const ordered = [...flows].sort((a, b) =>
    lKeys.indexOf(a.from) - lKeys.indexOf(b.from) || b.value - a.value);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${H}`} width="100%" height={H} role="img"
           aria-label="환자군에서 신호 유형으로 흐르는 발언" className="block">
        {ordered.map((f) => {
          const l = L[f.from], r = R[f.to];
          const h = px(f.value);
          const y0 = l.y + (lOff[f.from] ?? 0), y1 = r.y + (rOff[f.to] ?? 0);
          lOff[f.from] = (lOff[f.from] ?? 0) + h;
          rOff[f.to] = (rOff[f.to] ?? 0) + h;
          const x0 = nodeX.l + 6, x1 = nodeX.r - 6, mid = (x0 + x1) / 2;
          const d = `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1}
                     L${x1},${y1 + h} C${mid},${y1 + h} ${mid},${y0 + h} ${x0},${y0 + h} Z`;
          return (
            <path key={`${f.from}->${f.to}`} d={d}
                  fill={f.accent ? "var(--orange)" : "var(--navy)"}
                  fillOpacity={f.accent ? 0.34 : ink(f.value, max, 0.07, 0.3)}>
              <title>{`${leftLabel(f.from)} → ${rightLabel(f.to)} · ${fmt(f.value)}건`}</title>
            </path>
          );
        })}
        {lKeys.map((k) => (
          <g key={`l-${k}`}>
            <rect x={nodeX.l} y={L[k].y} width="6" height={L[k].h} rx="2" fill="var(--navy)" fillOpacity="0.6" />
            <text x={nodeX.l - 10} y={L[k].y + L[k].h / 2 + 3.5} textAnchor="end"
                  fontSize="11" fill="var(--navy)" fontWeight="500">
              {leftLabel(k)}
            </text>
            <text x={nodeX.l - 10} y={L[k].y + L[k].h / 2 + 15} textAnchor="end" className="mono"
                  fontSize="9" fill="var(--faint)">{fmt(sum(k, "from"))}</text>
          </g>
        ))}
        {rKeys.map((k) => (
          <g key={`r-${k}`}>
            <rect x={nodeX.r - 6} y={R[k].y} width="6" height={R[k].h} rx="2" fill="var(--orange)" fillOpacity="0.7" />
            <text x={nodeX.r + 10} y={R[k].y + R[k].h / 2 + 3.5} fontSize="11" fill="var(--navy)" fontWeight="500">
              {rightLabel(k)}
            </text>
            <text x={nodeX.r + 10} y={R[k].y + R[k].h / 2 + 15} className="mono" fontSize="9" fill="var(--faint)">
              {fmt(sum(k, "to"))}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── 권역 지도 ─────────────────────────────────────────────────────
   미국 4개 인구조사 권역을 단순한 도형으로 그린다. 실제 주 경계를 그리지 않는 이유:
   이 데이터에 주 정보가 없다. 없는 정밀도를 그리면 화면이 데이터보다 많은 것을
   아는 척하게 된다 — 권역이 데이터의 해상도이므로 지도도 거기서 멈춘다. */
const REGION_KO: Record<string, string> = {
  WEST: "서부", MIDWEST: "중서부", NORTHEAST: "북동부", SOUTH: "남부",
};


/* ── 수집 공백 격자 (환자군 × 권역) ─────────────────────────────────
   「KOL 탐색」이 답하는 질문을 «누가 많이 말했나»에서 **«어디를 아직 안 물어봤나»**로
   바꾸는 그림 (08/29). 앞엣것은 이미 가진 것을 다시 보여주는 일이라 화면을 보고 나서
   할 일이 안 생긴다.

   **0 을 지우지 않는다.** 발언이 0 인 칸이 이 격자의 요점이다 — 흐리게 두면 «적다»로
   읽히므로 점선과 러스트로 **가장 눈에 띄게** 그린다. 격자에서 제일 중요한 칸이
   제일 옅은 칸이 되면 그림이 거꾸로 말한다.

   절대 규칙 #7 과 부딪히지 않는 이유: **사람을 세지 않고 빈 칸을 센다.** */
export type CoverageRow = {
  segment: string; labelKo: string; labelScope?: string; hypothesisIds: string[];
  total: { claimCount: number; distinctHcp: number };
  cells: { region: string; claimCount: number; distinctHcp: number }[];
  emptyRegions: string[]; belowThreshold: boolean;
};

export function CoverageGrid({
  rows, regions, threshold,
}: {
  rows: CoverageRow[];
  regions: { region: string; labelKo: string }[];
  threshold: { repeat: number; hcp: number };
}) {
  if (!rows.length) return null;
  const hcps = rows.flatMap((r) => r.cells.filter((c) => c.claimCount).map((c) => c.distinctHcp));
  const maxHcp = Math.max(1, ...hcps);
  const minHcp = Math.min(...hcps, 1);
  const shade = (h: number) =>
    maxHcp <= minHcp ? 0.7 : 0.12 + 0.62 * ((h - minHcp) / (maxHcp - minHcp));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-separate border-spacing-[3px]">
        <thead>
          <tr>
            <th className="whitespace-nowrap px-2 py-1.5 text-left text-[0.875rem] font-medium text-navy">환자군</th>
            {regions.map((g) => (
              <th key={g.region} className="px-2 py-1.5 text-center text-[0.875rem] font-normal text-faint">
                {g.labelKo}
              </th>
            ))}
            <th className="whitespace-nowrap px-2 py-1.5 text-right text-[0.875rem] font-normal text-muted">
              전체 · 임계
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.segment}>
              {/* 허가 범위(In-label/Off-label)는 여기 두지 않는다 — 「환자군 확장」의 표
                  한 열이 그 자리다 (08/29 팀장: "다섯 군데에 같은 말이 있으면 헷갈려").
                  이 격자에서 그 구분은 아무것도 바꾸지 않는다: 어느 쪽이든 실행은
                  Board 승인을 거쳐야 한다. */}
              <th className={`whitespace-nowrap px-2 py-1.5 text-left align-middle text-[0.9375rem]
                             font-medium leading-[1.35] ${r.belowThreshold ? "text-rust" : "text-navy"}`}>
                {r.labelKo}
              </th>
              {r.cells.map((c) => {
                if (!c.claimCount) return (
                  <td key={c.region}
                      className="min-w-[76px] rounded-[7px] border-[1.5px] border-dashed border-rust
                                 bg-rust-soft px-1.5 py-2 text-center align-middle"
                      title={`${r.labelKo} × ${regions.find((g) => g.region === c.region)?.labelKo}`
                             + " — 아직 들은 발언이 없습니다"}>
                    <b className="mono block text-[1.05rem] font-bold leading-[1.1] text-rust">0</b>
                    <em className="mt-px block text-[0.75rem] not-italic text-rust/80">아직 없음</em>
                  </td>
                );
                const op = shade(c.distinctHcp);
                return (
                  <td key={c.region} className="min-w-[76px] rounded-[7px] px-1.5 py-2 text-center align-middle"
                      style={{ background: `rgba(22,38,97,${op.toFixed(3)})`,
                               color: op > 0.48 ? "var(--on-navy)" : "var(--navy)" }}
                      title={`${r.labelKo} × ${regions.find((g) => g.region === c.region)?.labelKo}`
                             + ` — ${fmt(c.claimCount)}회 · 독립 의료진 ${c.distinctHcp}인`}>
                    <b className="mono block text-[1.15rem] font-medium leading-[1.1]">{fmt(c.claimCount)}</b>
                    <em className="mono mt-px block text-[0.75rem] not-italic opacity-[.78]">{c.distinctHcp}인</em>
                  </td>
                );
              })}
              <td className="whitespace-nowrap py-1.5 pl-2 text-right align-middle">
                <span className="mono text-[0.875rem] font-medium text-navy">
                  {fmt(r.total.claimCount)}회 / {r.total.distinctHcp}인
                </span>
                {r.belowThreshold ? (
                  <span className="ml-2 inline-block rounded-full border border-rust bg-rust-soft px-2
                                   py-[1px] align-[1px] text-[0.75rem] font-medium text-rust">
                    임계 미달 · {Math.max(0, threshold.repeat - r.total.claimCount)}건 부족
                  </span>
                ) : (
                  <span className="mono ml-2 inline-block rounded-full border border-line-2 px-2
                                   py-[1px] align-[1px] text-[0.75rem] text-faint">
                    {r.hypothesisIds.join(" · ") || "가설 없음"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 공백 격자의 범례 — 진하기가 무엇인지 말하지 않으면 그림이 안 읽힌다. */
export function CoverageLegend({ threshold }: { threshold: { repeat: number; hcp: number } }) {
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="block h-[13px] w-[74px] rounded"
              style={{ background: "linear-gradient(90deg,rgba(22,38,97,.12),rgba(22,38,97,.74))" }} />
        진하기 = 독립 의료진 수
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="block size-[13px] rounded border-[1.5px] border-dashed border-rust bg-rust-soft" />
        발언 0 — 아직 못 들은 칸
      </span>
      <span>임계 = 반복 {threshold.repeat}회 · 독립 의료진 {threshold.hcp}인</span>
    </div>
  );
}

/* 미국 타일 지도는 08/30에 **「KOL 탐색」 탭으로 되돌아갔다** — 다만 이 파일의
   UsTileMap 이 아니라 `app/collection/_tilemap.tsx` 의 NYT 배치판이다(호버 팝업으로
   그 권역의 언급 상위·전문 분야 분포를 보여준다). 여기 있던 옛 구현과 US_TILE 좌표표는
   **지웠다**: 좌표표가 두 벌 남아 있으면(튜플 순서가 [row,col] ↔ [col,row]로 반대였고
   51개 중 13개만 위치가 같았다) 다음 사람이 틀린 표를 집는다. 옛 표가 필요하면
   git log 로 이 파일의 08/29 판을 보라. */

const REGION_SHAPE: Record<string, { d: string; cx: number; cy: number; ko: string }> = {
  WEST:      { d: "M8,34 L96,10 L150,22 L156,120 L120,176 L36,166 L8,96 Z", cx: 74,  cy: 92,  ko: "서부" },
  MIDWEST:   { d: "M156,22 L268,14 L286,44 L280,124 L200,150 L156,120 Z",   cx: 218, cy: 78,  ko: "중서부" },
  NORTHEAST: { d: "M286,44 L360,26 L392,58 L376,104 L300,110 L280,84 Z",     cx: 336, cy: 66,  ko: "북동부" },
  SOUTH:     { d: "M156,120 L200,150 L280,124 L300,110 L376,104 L362,166 L250,192 L160,178 L120,176 Z", cx: 246, cy: 150, ko: "남부" },
};

export function RegionMap({
  rows, valueOf, unit = "건", secondary,
}: {
  rows: { region: string; provisional: { claimCount: number; distinctHcp: number; distinctSegments: number };
          official: { claimCount: number }; specialties: { specialty: string; hcpCount: number }[] }[];
  valueOf: (r: { provisional: { claimCount: number; distinctHcp: number } }) => number;
  unit?: string;
  secondary?: (r: { provisional: { distinctHcp: number; distinctSegments: number } }) => string;
}) {
  const known = rows.filter((r) => REGION_SHAPE[r.region]);
  const other = rows.filter((r) => !REGION_SHAPE[r.region]);
  const max = Math.max(1, ...known.map(valueOf));
  const min = Math.min(...known.map(valueOf));
  const thin = known.filter((r) => valueOf(r) === min);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <svg viewBox="0 0 400 200" width="100%" height="230" role="img"
             aria-label="권역별 발언 분포" className="block">
          {known.map((r) => {
            const sh = REGION_SHAPE[r.region];
            const v = valueOf(r);
            const o = ink(v, max, 0.12, 0.8);
            return (
              <g key={r.region}>
                <path d={sh.d} fill="var(--navy)" fillOpacity={o}
                      stroke="var(--paper)" strokeWidth="2" />
                <text x={sh.cx} y={sh.cy - 4} textAnchor="middle" fontSize="10.5" fontWeight="500"
                      fill={o > 0.45 ? "#fff" : "var(--navy)"}>{sh.ko}</text>
                <text x={sh.cx} y={sh.cy + 11} textAnchor="middle" className="mono" fontSize="12"
                      fontWeight="700" fill={o > 0.45 ? "#fff" : "var(--navy)"}>{fmt(v)}</text>
                <text x={sh.cx} y={sh.cy + 23} textAnchor="middle" className="mono" fontSize="8"
                      fill={o > 0.45 ? "#fff" : "var(--faint)"} fillOpacity={o > 0.45 ? 0.7 : 1}>
                  {secondary ? secondary(r) : `${unit}`}
                </text>
                <title>{`${sh.ko} (${r.region}) — ${fmt(v)}${unit} · 의료진 ${r.provisional.distinctHcp}인 · 환자군 ${r.provisional.distinctSegments}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex w-full flex-col gap-2 lg:w-[268px]">
        {known.slice().sort((a, b) => valueOf(b) - valueOf(a)).map((r) => {
          const sh = REGION_SHAPE[r.region];
          const v = valueOf(r);
          return (
            <div key={r.region} className="rounded-xl border border-glass-line bg-white/45 px-3 py-2">
              <div className="flex items-baseline gap-2">
                <b className="text-[0.875rem] font-medium text-navy">{sh.ko}</b>
                <span className="mono ml-auto text-[0.875rem] font-medium text-navy">{fmt(v)}</span>
                <span className="mono text-[0.75rem] text-faint">{unit}</span>
              </div>
              <div className="mt-1.5 h-[3px] w-full rounded-full bg-navy/10">
                <div className="h-[3px] rounded-full bg-navy" style={{ width: `${(v / max) * 100}%`, opacity: 0.55 }} />
              </div>
              <p className="mono mt-1.5 text-[0.6875rem] leading-[1.5] text-faint">
                {r.specialties.slice(0, 3).map((s) => `${s.specialty} ${s.hcpCount}`).join(" · ") || "—"}
              </p>
            </div>
          );
        })}
        {thin.length > 0 && thin.length < known.length && (
          <p className="text-[0.75rem] leading-[1.6] text-muted">
            가장 얇은 곳은 <b className="text-navy">{REGION_SHAPE[thin[0].region].ko}</b>입니다 —
            수집이 덜 닿은 곳인지, 실제로 말이 적은 곳인지는 이 화면이 답하지 않습니다.
          </p>
        )}
        {other.length > 0 && (
          <p className="mono text-[0.75rem] text-faint">
            지도 밖 권역 {other.length}개: {other.map((r) => r.region).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── 히트맵 ────────────────────────────────────────────────────────
   행 = 신호 조합, 열 = 달. 스파크라인 여러 줄보다 이쪽이 낫다:
   같은 열이 같은 달이라 **언제 여러 신호가 동시에 올라왔는지**가 보인다. */
export function Heatmap({
  rows, months, cell = 13, gap = 2,
}: {
  rows: { key: string; label: string; sub?: string; byMonth: Record<string, number>; accent?: boolean }[];
  months: string[]; cell?: number; gap?: number;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => Object.values(r.byMonth)));
  const W = months.length * (cell + gap);
  const years = months.reduce<Record<string, number>>((m, mo) => {
    const y = mo.slice(0, 4); m[y] = (m[y] ?? 0) + 1; return m;
  }, {});
  let acc = 0;
  const ticks = Object.entries(years).map(([y, n]) => { const x = acc; acc += n * (cell + gap); return { y, x, n }; });

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-3">
        <div className="flex flex-col" style={{ paddingTop: 18 }}>
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-end gap-2 pr-1"
                 style={{ height: cell + gap }}>
              <span className={`whitespace-nowrap text-[0.8125rem] ${r.accent ? "font-medium text-orange-deep" : "text-navy"}`}>
                {r.label}
              </span>
              {r.sub && <span className="mono whitespace-nowrap text-[0.6875rem] text-faint">{r.sub}</span>}
            </div>
          ))}
        </div>
        <div>
          <svg width={W} height={18} className="block" aria-hidden>
            {ticks.map((t) => (
              <text key={t.y} x={t.x + 1} y={12} className="mono" fontSize="9" fill="var(--faint)">{t.y}</text>
            ))}
          </svg>
          <svg width={W} height={rows.length * (cell + gap)} role="img"
               aria-label="달별 신호 강도" className="block">
            {rows.map((r, ri) =>
              months.map((mo, mi) => {
                const v = r.byMonth[mo] ?? 0;
                return (
                  <rect key={mo} x={mi * (cell + gap)} y={ri * (cell + gap)} width={cell} height={cell} rx="2.5"
                        fill={v === 0 ? "var(--navy)" : (r.accent ? "var(--orange)" : "var(--navy)")}
                        fillOpacity={v === 0 ? 0.045 : ink(v, max, 0.18, 0.85)}>
                    <title>{`${r.label} · ${mo} · ${v}건`}</title>
                  </rect>
                );
              }),
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ── 가로 막대 ─────────────────────────────────────────────────────
   순위가 있는 짧은 목록에 쓴다. 표보다 "얼마나 차이 나는지"가 먼저 읽힌다. */
export function Bars({
  rows, unit = "건", tone = "navy", max: given,
}: {
  rows: { key: string; label: string; value: number; sub?: string }[];
  unit?: string; tone?: "navy" | "rust" | "orange"; max?: number;
}) {
  const max = given ?? Math.max(1, ...rows.map((r) => r.value));
  const color = tone === "rust" ? "var(--rust)" : tone === "orange" ? "var(--orange)" : "var(--navy)";
  return (
    <div className="flex flex-col gap-[7px]">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[0.8125rem] text-navy">{r.label}</span>
              {r.sub && <span className="mono shrink-0 text-[0.6875rem] text-faint">{r.sub}</span>}
            </div>
            <div className="mt-1 h-[6px] w-full rounded-full bg-navy/[.07]">
              <div className="h-[6px] rounded-full transition-[width]"
                   style={{ width: `${(r.value / max) * 100}%`, background: color, opacity: 0.62 }} />
            </div>
          </div>
          <span className="mono w-12 text-right text-[0.8125rem] font-medium text-navy">
            {fmt(r.value)}<span className="text-[0.6875rem] text-faint">{unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── 잠정/공식 두 겹 막대 ──────────────────────────────────────────
   절대 규칙 #3을 **도형으로** 말한다: 공식은 잠정 안에 든 진한 조각이고,
   둘을 더하지 않는다는 것이 겹쳐 그린 모양에서 바로 읽힌다. */
export function StackedPair({
  rows, unit = "건",
}: {
  rows: { key: string; label: string; prov: number; offi: number; scope?: string }[];
  unit?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.prov));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[0.875rem] text-navy">{r.label}</span>
            {r.scope && (
              <span className={`shrink-0 rounded px-1.5 py-px text-[0.6875rem] font-bold ${
                r.scope === "OUT_OF_LABEL" ? "bg-orange-soft text-orange-deep" : "bg-navy/[.07] text-navy/55"}`}>
                {r.scope === "OUT_OF_LABEL" ? "범위 밖" : "범위 안"}
              </span>
            )}
            <span className="mono ml-auto shrink-0 text-[0.8125rem]">
              <b className="font-medium text-navy">{fmt(r.prov)}</b>
              <span className="text-faint"> / </span>
              <b className={r.offi > 0 ? "font-medium text-orange-deep" : "text-navy/30"}>{fmt(r.offi)}</b>
              <span className="text-[0.6875rem] text-faint">{unit}</span>
            </span>
          </div>
          <div className="relative mt-1.5 h-[9px] w-full rounded-full bg-navy/[.06]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-navy/45"
                 style={{ width: `${(r.prov / max) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-orange"
                 style={{ width: `${(r.offi / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 신호 지도 ─────────────────────────────────────────────────────
   홈에 있던 **시계열을 대체한다** (08/29 팀장). 시간축이 그 화면에서 결정에 쓰이지
   않았다 — 68개월에 474건이라 한 달 평균 7건이고, 최근이 솟은 것도 보충 코퍼스의
   날짜 분포이지 현장의 변화가 아니다. 시간은 「추이 분석」 탭이 이미 맡는다.

   대신 **크기와 진하기**로 두 축을 동시에 말한다 — 핀비즈가 섹터로 묶고 그 안에
   종목을 놓는 것과 같은 구조로, **환자군으로 묶고 그 안에 신호 유형**을 놓는다.
     · 칸 크기 = 반복 횟수      · 진하기 = 독립 의료진 수
   이 둘이 임계 판정의 두 축(5회·3인)이라, **크지만 옅은 칸 = 한 사람이 많이 말한 것**이
   한눈에 갈린다. 선 그래프로는 절대 안 보이던 구분이다.

   08/29 리디자인: 그리기는 `_signal-map.tsx`(클라이언트)로 옮겼다 — <title> 툴팁이
   느리고 안 읽혀서 커서 추적 툴팁·hover 딤·칸 클릭 이동이 필요했다. 타입만 여기 남는다. */
export type SignalCell = {
  segment: string; segmentKo: string; outOfLabel: boolean;
  signal: string; signalKo: string; signalFull: string; signalDef: string;
  count: number; hcp: number; official: number;
};

/* ── 신호 격자 ─────────────────────────────────────────────────────
   생키를 대체한다 (08/29 팀장: "어떻게 해석해야 할지 모르겠네").
   8개 환자군 × 6개 신호 유형이면 띠가 23개 교차해 어느 띠가 어디로 가는지 눈으로
   못 따라간다. 격자는 **가로로 훑으면 «이 환자군이 무슨 말을 하나»**,
   **세로로 훑으면 «이 신호를 누가 말하나»** 가 바로 나오고, 무엇보다
   **숫자가 칸 안에 그대로 적혀** 두께를 눈대중할 필요가 없다. */
export function SignalMatrix({
  cells, signals, threshold = { count: 5, hcp: 3 },
}: {
  cells: SignalCell[];
  signals: { key: string; ko: string }[];
  threshold?: { count: number; hcp: number };
}) {
  if (!cells.length) return null;
  const bySeg = new Map<string, SignalCell[]>();
  for (const c of cells) bySeg.set(c.segment, [...(bySeg.get(c.segment) ?? []), c]);
  const segs = [...bySeg.entries()]
    .map(([seg, kids]) => ({ seg, kids, total: kids.reduce((s, k) => s + k.count, 0) }))
    .sort((a, b) => b.total - a.total);
  const maxHcp = Math.max(1, ...cells.map((c) => c.hcp));
  const minHcp = Math.min(...cells.map((c) => c.hcp));
  const shade = (h: number) =>
    maxHcp <= minHcp ? 0.7 : 0.12 + 0.66 * ((h - minHcp) / (maxHcp - minHcp));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-[3px]">
        <thead>
          <tr>
            <th className="whitespace-nowrap px-2 py-1.5 text-left text-[0.875rem] font-medium text-navy">환자군</th>
            {signals.map((s) => (
              <th key={s.key} className="px-2 py-1.5 text-center text-[0.875rem] font-normal text-faint">{s.ko}</th>
            ))}
            <th className="px-2 py-1.5 text-center text-[0.875rem] font-normal text-muted">합계</th>
          </tr>
        </thead>
        <tbody>
          {segs.map(({ seg, kids, total }) => {
            const bySig = new Map(kids.map((k) => [k.signal, k]));
            return (
              <tr key={seg}>
                <th className="whitespace-nowrap px-2 py-1.5 text-left text-[0.9375rem] font-medium text-navy">
                  {kids[0].segmentKo}
                </th>
                {signals.map((s) => {
                  const c = bySig.get(s.key);
                  if (!c) return (
                    <td key={s.key} className="min-w-[78px] rounded-[7px] bg-navy/[.035] px-1.5 py-2 text-center text-faint"
                        title="언급 없음">·</td>
                  );
                  const op = shade(c.hcp);
                  const passed = c.count >= threshold.count && c.hcp >= threshold.hcp;
                  return (
                    <td key={s.key}
                        className={`min-w-[78px] rounded-[7px] px-1.5 py-2 text-center ${
                          passed ? "" : "outline outline-[1.5px] -outline-offset-2 outline-dashed outline-navy/30"}`}
                        style={{
                          background: `rgba(22,38,97,${op.toFixed(3)})`,
                          color: op > 0.48 ? "var(--on-navy)" : "var(--navy)",
                        }}
                        title={`${c.segmentKo} × ${c.signalFull} — ${fmt(c.count)}회 · 독립 의료진 ${c.hcp}인`
                          + (passed ? "" : ` · 임계 미달(${threshold.count}회·${threshold.hcp}인)`)}>
                      <b className="mono block text-[1.22rem] font-medium leading-[1.1]">{fmt(c.count)}</b>
                      <em className="mono mt-px block text-[0.8125rem] not-italic opacity-[.78]">{c.hcp}인</em>
                    </td>
                  );
                })}
                <td className="mono min-w-[70px] rounded-[7px] bg-navy/[.06] px-1.5 py-2 text-center text-[1.05rem] font-medium text-navy">
                  {fmt(total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
