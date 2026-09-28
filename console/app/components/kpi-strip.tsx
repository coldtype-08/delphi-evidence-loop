"use client";

/**
 * 홈 KPI 계기판 스트립 (08/29).
 *
 * 카드 4장을 버리고 **헤어라인 한 장**으로 눕힌다 — 위계는 재질이 아니라
 * 크기 대비(라벨 0.6875rem ↔ 숫자 3.25rem)가 만든다.
 *
 * ⚠ **승인 관문 서사를 그리지 않는다** (08/29 팀장 재확인 · 절대 규칙 #3).
 * 앞판은 여기에 「사람 승인선」 점선과 「Field 승인 대기」 오렌지를 그렸는데
 * **그런 관문은 제품에 없다** — Claim은 사람 승인 없이 쌓이고, 현장 수집분도
 * Field 앱에서 확인해 보내므로 콘솔은 그대로 적재한다. 사람이 손대는 곳은
 * 파이프라인 끝의 **Board 심의 하나**이고, 오렌지는 거기에만 켠다.
 *
 * 숫자는 전부 서버가 센 스칼라다 — 여기서는 **포맷만** 한다 (절대 규칙 #1).
 */

import { useEffect, useState } from "react";
import Link from "next/link";

export type KpiStage = {
  n: number;
  label: string;
  /** 서버가 센 값. API 실패면 null — «—» 로 그린다. */
  value: number | null;
  unit: string;
  /** 상태 꼬리표. 승인 관문이 아니라 **그 숫자가 어떤 집계인지**를 말한다 */
  tag: string | null;
  tagTone?: "quiet" | "navy" | "orange";
  note: string;
  href: string;
  /** 사람이 볼 차례 — 숫자가 오렌지로 켜진다. 화면에 한 곳뿐이다 */
  accent?: boolean;
};

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

/** 카운트업 — 서버 최종값을 SSR 로 먼저 그리고, 마운트 뒤 한 번 올라간다 (docs/05 §5).
 *  래치(ref)를 두지 않는다 — StrictMode 가 effect 를 두 번 돌릴 때 첫 실행의 rAF 는
 *  cleanup 이 취소하고 래치가 두 번째를 막아 **모션이 통째로 죽는다**. 의존성 [value] 가
 *  재실행을 이미 값 단위로 묶어 준다. */
function CountUp({ value }: { value: number }) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    if (value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(fmt(value));
      return;
    }
    const t0 = performance.now();
    const DUR = 700;
    let raf = requestAnimationFrame(function tick(t: number) {
      const p = Math.min(1, (t - t0) / DUR);
      setText(fmt(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{text}</>;
}

function Tag({ s }: { s: KpiStage }) {
  if (!s.tag || s.value === null) return null;
  // 오렌지 면 + 네이비 글자 — 오렌지 틴트 위 오렌지 글자는 2.9:1로 안 읽힌다
  // (좌측 내비 배지 08/28 결정과 같은 짝, 6.97:1).
  const cls =
    s.tagTone === "orange"
      ? "bg-orange-bright font-semibold text-navy"
      : s.tagTone === "navy"
        ? "bg-navy/90 text-on-navy"
        : "border border-line text-muted";
  return (
    <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[0.75rem] font-medium ${cls}`}>
      {s.tag}
    </span>
  );
}

export default function KpiStrip({ stages, footnote }: { stages: KpiStage[]; footnote?: string }) {
  const base =
    footnote ??
    "칸에 올리면 그 숫자가 무엇을 세는지 여기 나옵니다 · 누르면 해당 화면으로 이동합니다.";
  const [note, setNote] = useState(base);

  return (
    <div>
      {/* gap-px + bg-line: 2열 줄바꿈에서도 저절로 성립하는 1px 헤어라인.
          divide-x 는 줄바꿈에서 깨진다. overflow-hidden 은 모서리 삐짐 방지 — 필수. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line xl:grid-cols-4">
        {stages.map((s, i) => {
          const hot = s.accent && (s.value ?? 0) > 0;
          return (
            <Link
              key={s.n}
              href={s.href}
              aria-describedby={`kpi-note-${s.n}`}
              onMouseEnter={() => setNote(s.note)}
              onMouseLeave={() => setNote(base)}
              onFocus={() => setNote(s.note)}
              onBlur={() => setNote(base)}
              className={`rise rise-${i + 1} relative flex min-h-[150px] flex-col bg-card px-6 pb-[22px] pt-5
                          transition-colors duration-150 hover:bg-fill-1
                          focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-deep`}
            >
              {/* 스크린리더용 설명 — 시각 각주는 아래 공유 한 줄이 맡고, 낭독은 포커스한
                  링크의 aria-describedby 가 맡는다. aria-live 로 공유 각주를 읽게 하면
                  Tab 이동마다 기본 문구 복귀까지 최대 8번 낭독이 끼어든다. */}
              <span id={`kpi-note-${s.n}`} className="sr-only">
                {s.note}
              </span>
              <div className="flex items-center gap-2">
                <span className="mono text-[0.75rem] text-faint">{String(s.n).padStart(2, "0")}</span>
                <span className="break-keep text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-faint">
                  {s.label}
                </span>
                {i < stages.length - 1 && (
                  <span aria-hidden className="mono ml-auto text-[0.75rem] text-faint/50">
                    →
                  </span>
                )}
              </div>
              <div className="mt-[18px] flex items-baseline gap-2.5">
                <span
                  className={`mono text-[2.6rem] font-medium leading-none tabular-nums xl:text-[length:var(--fs-hero)]
                              ${hot ? "text-orange-deep" : "text-navy"}`}
                >
                  {s.value === null ? "—" : <CountUp value={s.value} />}
                </span>
                <span className="mono text-[0.8125rem] text-faint">{s.unit}</span>
              </div>
              <div className="mt-3">
                <Tag s={s} />
              </div>
            </Link>
          );
        })}
      </div>
      {/* 공유 각주 — 셀마다 3줄씩 넣던 설명을 한 자리로 모은다. 높이는 2줄
          (leading 1.7 × 2 = 3.4em) 기준으로 고정해, 좁은 폭에서 문장이 접혀도
          hover 때 아래 내용이 출렁이지 않는다. */}
      <p data-kpi-note className="mt-3 min-h-[3.4em] px-1 text-[0.8125rem] leading-[1.7] text-muted">
        {note}
      </p>
    </div>
  );
}
