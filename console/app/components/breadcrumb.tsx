"use client";

/**
 * 상단 바 이동 경로 — **지금 어느 메뉴에 있는지**를 말한다 (08/30 팀장 지시:
 * "저 상단 바에 전부 다 다른 정보가 들어가고 있는데 … 차라리 지금 내가 어떤 메뉴에
 * 들어와 있는지 보여주는 건 어때? 'Resources > Icons' 처럼").
 *
 * 그전에는 화면마다 다른 요약(`canonical 12 · 표면형 …`, `호출 1,204건`, `In-label 3 ·
 * Development 5`)이 같은 자리에 들어와 있었다. 자리는 하나인데 뜻이 열두 가지라
 * 상단 바를 읽는 습관이 생기지 않았다 — 위치 표시라는 **한 가지 뜻**으로 통일한다.
 *
 * 구획 이름은 사이드바(`nav.tsx` GROUPS)에서 그대로 가져온다. 메뉴에 새 화면이
 * 추가되면 경로도 따라온다 — 두 벌을 손으로 맞추면 반드시 어긋난다.
 */

import { usePathname, useSearchParams } from "next/navigation";
import { GROUPS } from "@/app/nav";

/** 메뉴에 자기 항목이 없지만 **어느 메뉴 안에 있는** 화면. 왼쪽을 오른쪽으로 보고 찾는다.
 *  `/analytics` 는 홈의 서브탭(개요·환자군 확장·안전성 신호·KOL 탐색·추이 분석)이라
 *  독립 메뉴가 아니다 — 그래도 «지금 홈 안의 어느 탭인가»는 말해 줘야 한다. */
const ALIAS: Record<string, string> = { "/analytics": "/" };

/** 현재 주소가 속한 구획과 화면 이름. 쿼리까지 보는 이유: 「다중 에이전트 검증」과
 *  「심의」는 `/hypotheses` 하나를 `?stage=` 로 나눠 쓰는 서로 다른 메뉴다. */
function locate(path: string, stage: string | null) {
  let best: { section: string; label: string; score: number } | null = null;
  for (const g of GROUPS) {
    for (const it of g.items) {
      const [base, query = ""] = it.href.split("?");
      const wantStage = new URLSearchParams(query).get("stage");
      if (base !== path && !(base !== "/" && path.startsWith(base + "/"))) continue;
      if (wantStage && wantStage !== stage) continue;
      // 더 구체적인 것이 이긴다: 쿼리까지 맞으면 +2, 주소가 정확히 같으면 +1
      const score = (wantStage ? 2 : 0) + (base === path ? 1 : 0);
      if (!best || score > best.score) {
        best = { section: g.title ?? "", label: it.label, score };
      }
    }
  }
  return best;
}

export default function Breadcrumb({ leaf }: { leaf?: string }) {
  const raw = usePathname();
  const path = ALIAS[raw] ?? raw;
  const stage = useSearchParams().get("stage");
  const hit = locate(path, stage);

  // 메뉴에 없는 화면(`/board/[id]`·`/contract/provenance`·`/review/field` 등)도 주소로 열린다 —
  // 그때는 호출부가 준 이름만 놓는다. "메뉴에 없다"를 빈 칸으로 말하지 않는다.
  // 마지막 칸은 메뉴명이 못 담는 것이 있을 때만 붙인다 — 「홈 › 홈 대시보드」처럼
  // 같은 말을 두 번 놓지 않는다. 한쪽이 다른 쪽을 품으면 더 짧은 쪽(메뉴명)이 이긴다.
  // 구획 이름과도 견준다 — `/contract` 는 메뉴가 「활성 스키마」인데 화면 제목이
  // 「Data Contract」라 「DATA CONTRACT › 활성 스키마 › Data Contract」가 됐다.
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, "");
  const echoes = (a: string, b: string) => {
    const [x, y] = [norm(a), norm(b)];
    return x === y || x.startsWith(y) || y.startsWith(x);
  };
  const crumbs = hit
    ? [hit.section, hit.label,
       ...(leaf && !echoes(leaf, hit.label) && !echoes(leaf, hit.section) ? [leaf] : [])]
    : [leaf ?? ""];

  return (
    <nav aria-label="이동 경로" className="flex min-w-0 items-center gap-2">
      {crumbs.filter(Boolean).map((c, i) => (
        <span key={`${c}-${i}`} className="flex min-w-0 items-center gap-2">
          {i > 0 && <span aria-hidden className="text-faint">›</span>}
          <span className={`truncate text-[0.8125rem] ${
            i === crumbs.length - 1 ? "font-semibold text-ink" : "text-muted"}`}>
            {c}
          </span>
        </span>
      ))}
    </nav>
  );
}
