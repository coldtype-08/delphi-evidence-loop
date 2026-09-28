"use client";

/**
 * 라인 현황 스트립 — 이 화면이 지금 **어디까지 와 있나** (08/30).
 *
 * 왜 필요했나: 이 화면은 «무엇을 하는 곳인가»(제목·리드)와 «어떻게 하나»(⓪①② 카드)는
 * 말하는데, **지금 상태**를 맨 아래 실행 결과(StripBar)에서만 말했다. 그래서 라인을
 * 한 번도 안 돌린 세션에서는 화면이 통째로 «아직 아무것도 없습니다»로 읽혔다 —
 * 실제로는 문서 470건이 이미 DB 에 있고 계약도 확정돼 있는데도.
 *
 * **결과 숫자는 여기 두지 않는다** (08/30 팀장). 블록·claim 은 라인이 돌아서 나온
 * 것이라 아래 실행 결과의 몫이고, 여기 남는 둘은 라인이 돌기 **전에도 참인 것**이다.
 *
 * 홈·신호의 여정과 **같은 재질**을 쓴다: 카드 여러 장이 아니라 헤어라인 한 장
 * (`gap-px + bg-line`), 위계는 테두리가 아니라 라벨(0.6875rem)과 숫자(1.9rem)의
 * 크기 대비가 만든다. `KpiStrip` 과 같은 규약이되, 그쪽은 **파이프라인 네 걸음**을
 * 세고 여기는 **이 화면의 재료**를 센다.
 *
 * 숫자는 전부 `/aggregates/pipeline` 의 SQL 값이다 — 여기서는 **포맷만** 한다
 * (절대 규칙 #1). 잠정과 공식은 **나란히** 놓고 더하지 않는다 (절대 규칙 #3).
 */

import Link from "next/link";
import type { Strip } from "../_lib/types";

const fmt = (n: number | undefined | null) =>
  typeof n === "number" ? n.toLocaleString("ko-KR") : "—";

type Tile = {
  label: string;
  value: string;
  unit: string;
  note: string;
  href?: string;
};

export default function LineStatus({
  strip, contractVersion,
}: {
  strip: Strip | null;
  /** 확정 스키마 버전 — 없으면 «없음(v0.0)» 으로 그린다 (계약 없는 상태가 데모의 시작점) */
  contractVersion?: string | null;
}) {
  // 08/30 팀장: **원본 문서와 지금 계약 둘만** 남긴다.
  // 뺀 둘(면담 블록·추출된 Claim)은 **라인이 돌아서 나온 결과**라 아래 실행 결과가
  // 말하는 자리다 — 여기서 한 번 더 말하면 같은 숫자가 화면에 두 번 나온다.
  // 여기 남는 둘은 라인이 돌기 **전에도 참인 것**이다: 무엇을 재료로 쓰고(원본),
  // 어떤 규칙으로 읽는가(계약).
  const tiles: Tile[] = [
    {
      label: "원본 문서",
      value: fmt(strip?.rawDocuments),
      unit: "건",
      note: "서버에 적재된 비정형 데이터 — docx · pdf 원본 그대로",
    },
    {
      label: "확정 스키마",
      value: contractVersion ? `v${contractVersion}` : "v0.0",
      unit: contractVersion ? "활성" : "없음",
      // 이 제품이 파는 문장을 한 줄로 (CLAUDE.md 「헤더 두 층」).
      note: contractVersion
        ? "사람의 도메인 지식(고정 헤더) + AI가 문서에서 찾아낸 것(발견 헤더)"
        : "아직 계약이 없습니다 — 사람이 확정해야 구조화가 시작됩니다",
      href: "/contract",
    },
  ];


  return (
    <div className="mt-6">
      {/* gap-px + bg-line: 2열 줄바꿈에서도 성립하는 1px 헤어라인 (KpiStrip 과 같은 규약).
          overflow-hidden 이 없으면 모서리에서 바탕이 삐져나온다. */}
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
        {tiles.map((t) => {
          const body = (
            <>
              <div className="mono text-[0.6875rem] uppercase tracking-[0.12em] text-faint">
                {t.label}
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-[1.9rem] font-medium leading-none tabular-nums text-navy">
                  {t.value}
                </span>
                <span className="mono text-[0.75rem] text-faint">{t.unit}</span>
              </div>
              <p className="mt-2 text-[0.72rem] leading-[1.6] text-muted">{t.note}</p>
            </>
          );
          return t.href ? (
            <Link key={t.label} href={t.href}
                  className="group bg-card px-4 py-4 transition-colors hover:bg-fill-1">
              {body}
            </Link>
          ) : (
            <div key={t.label} className="bg-card px-4 py-4">{body}</div>
          );
        })}
      </div>
      <p className="mono mt-2 text-[0.68rem] text-navy/40">
        전부 서버가 센 값입니다 (computedBy {strip?.computedBy ?? "SQL"}) — 화면은 세지 않습니다.
      </p>
    </div>
  );
}
