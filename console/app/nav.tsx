"use client";

/**
 * 좌측 내비 — 파이프라인 순서로 묶는다 (08/26 개편).
 *
 * 지금까지는 화면이 만들어진 순서대로 평평하게 나열돼 있었다. Sense → Screen →
 * AI Board 라는 실제 흐름이 메뉴에서 안 보였고, 어느 단계에 몇 건이 기다리는지도
 * 알 수 없었다. 배지 숫자는 `GET /hypotheses/pipeline` 의 SQL 집계를 그대로 쓴다 —
 * 화면이 세지 않는다 (절대 규칙 #1).
 */

import Link from "next/link";
import { NAV_ICON } from "@/app/components/icons";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Stage = { all: number; sense: number; screen: number; board: number; decided: number; blocked: number };
type Item = { href: string; label: string; sub?: boolean; badge?: keyof Stage | "unmapped" | number };

// 배지마다 세는 대상이 다르다 — 공통 문구 "새로 확인할 건수"는 절반이 거짓이었다 (08/28).
// `all` 은 전체 건수고 `unmapped` 는 첫 판독부터 쌓인 **누적 재고**다. "새로 뜬 일"이 아니다.
// 팀장이 「온톨로지 86」을 보고 "갑자기 86개가 새로 생겼다"고 읽은 것이 이 문구 때문이다.
/** 접힘 레일 아이콘 — href(쿼리 포함) 기준.
 *
 * 08/30 (팀장: "아이콘이 허접한데 니가 직접 그리지 말고 여기서 골라서 써줘"):
 * 손으로 옮겨 그리던 path 를 **Untitled UI Icons** 로 교체했다. 매핑과 선정 이유는
 * `app/components/icons.tsx` 에 모여 있다 — 같은 개념이 사이드바와 여정 보드에서
 * 다른 그림으로 나오지 않도록. */
function NavIcon({ href }: { href: string }) {
  const Icon = NAV_ICON[href];
  if (!Icon) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.8" className="flex-none" aria-hidden>
        <circle cx="12" cy="12" r="8" />
      </svg>
    );
  }
  return <Icon size={15} strokeWidth={1.8} className="flex-none" />;
}

const BADGE_MEANS: Record<string, string> = {
  all: "가설 전체 건수 (단계 무관)",
  screen: "근거 검증 화면에 있는 가설 — 검증 완료·근거 부족을 포함합니다",
  // 08/30: 「심의로 넘어간 가설」이었다. 배지가 IN_REVIEW 만 세는데 링크가 여는 화면은
  // 결정 난 가설까지 보여줘서 배지 1 · 카드 7 로 벌어졌다 — 칸을 화면에 맞췄다.
  board: "심의 화면이 보여주는 가설 — 심의 중과 결정된 것(승인·보류·기각)을 함께 셉니다",
  unmapped: "계약 사전에 없어 매핑 못 한 표현의 **누적** 가짓수 — 새로 생긴 수가 아닙니다",
};

const RAW_GROUPS: { title?: string; sub?: string; items: Item[] }[] = [
  // 08/28 IA 개편 — 규칙: **레이어는 그룹 헤더, 항목은 한국어 화면명.**
  //
  // 새 규칙을 만든 게 아니라 팀이 이미 쓰던 규칙을 메뉴에 적용한 것이다. 페이지들은
  // 전부 `SENSE · 처리 라인` 형태의 Eyebrow 를 쓰는데 메뉴만 그것을 안 따랐다:
  // 같은 화면을 메뉴는 `Screen 검증`, 페이지는 `SCREEN · 외부 근거 교차검증`이라 불렀다.
  //
  // 이전 메뉴가 가진 문제 넷:
  //  ① 라벨의 축이 넷 섞임 — 레이어명만(`Sense`) / 레이어+동작(`Screen 검증`) /
  //     수식어+레이어(`AI Board`) / 기능명(`처리 라인`)
  //  ② `Sense` 와 `처리 라인` 이 **같은 URL** 이라 항상 둘 다 활성으로 켜졌다
  //  ③ **"보드"가 두 뜻** — 게시판(`가설 보드`)과 이사회(`AI Board`)
  //  ④ 화면은 있는데 메뉴에 없던 것 다섯 — 그중 `유래`는 docs/01 §5 가
  //     "심사위원이 처음 여는 URL"이라고 못 박은 투어 진입점이었다
  //
  // 화면명은 전부 README.md 의 모듈 역할어에서 가져왔다 (새로 지어내지 않았다).
  // 기타 통(`MORE`)은 만들지 않는다 — 그 자리에 들 `안전`은 절대 규칙 #6 의 유일한
  // 증거 화면이고 `실행 기록`은 재현 가능성의 증거다. "안 봐도 되는 것"으로 읽히면 안 된다.
  {
    title: "OVERVIEW", sub: "현황",
    items: [
      { href: "/", label: "홈" },
      // 08/30 신설 — 파이프라인 여정. 숫자는 /aggregates/pipeline 의 SQL 집계다 (#1).
      // 같은 날 오후 「수집 현장」(/collection)은 여기서 빠졌다: 미국 지도가
      // 「KOL 탐색」 탭으로 들어가면서(팀장 지시) 그 탭이 «어디서 듣고 있나»와
      // «어디를 못 들었나»를 함께 답한다. 주소는 리다이렉트로 살아 있다.
      { href: "/journey", label: "신호의 여정" },
    ],
  },
  {
    title: "SENSE", sub: "정제 · 구조화",
    items: [
      // **배지를 뗐다 (08/28).** 여기 붙어 있던 `sense` 는 파이프라인 상태가 아니라
      // **DRAFT 가설 수**다 (`PIPELINE_STAGES["sense"] = ("DRAFT",)`). 그래서 코퍼스를
      // 보충하고 가설이 둘 늘자 「AI Readable 전환 (2)」가 떴다 — 이 화면과 무관한 숫자다.
      // 이 항목에 붙일 만한 "지금 볼 것"이 없다: 판독은 사람이 눌러 돌리는 단계고
      // 대기 건수라는 개념이 없다. 없는 뜻을 만들지 말고 비워 둔다.
      { href: "/pipeline", label: "AI Readable 전환" },
      // `/review`(추출값 승인)는 **08/31 에 삭제됐다.** 08/28 에 메뉴에서 내렸는데
      // (전수 승인을 하지 않기로 한 흐름 — 절대 규칙 #3 단서), 주소로만 열리는 화면이
      // 남아 있어 «사이드바에 없는 메뉴가 있다»는 질문을 받았다. 승인은 가설이 근거로
      // 쓸 값에 대해서만, 그 가설 화면에서 들어간다. Field 수집분 검토(`/review/field`)는
      // 남아 있다 — 홈과 여정 보드에서 링크로 들어가는 살아 있는 화면이다.
      { href: "/hypotheses", label: "신호와 가설", badge: "all" },
    ],
  },
  {
    // 08/28: 그룹 부제와 항목이 둘 다 "근거 검증"이라 같은 단어가 두 줄 연속이었다.
    // 그리고 README 가 이 모듈을 부르는 이름은 **"다중 에이전트 근거 검증"**(README:83·98)인데
    // 메뉴가 "다중 에이전트"를 잘라, 검토관 4인이 교차검증한다는 것이 동선에서 사라졌다.
    // 라벨에 숫자("4인")는 넣지 않는다 — 이 항목에는 이미 건수 배지가 붙는다.
    title: "SCREEN", sub: "외부 공개 근거 대조",
    items: [{ href: "/hypotheses?stage=screen", label: "다중 에이전트 검증", badge: "screen" }],
  },
  {
    title: "AI BOARD", sub: "심의 · 승인",
    items: [{ href: "/hypotheses?stage=board", label: "심의", badge: "board" }],
  },
  {
    // 08/28: 헤더를 키우니 여기만 한국어 부제가 없는 것이 드러났다. docs/02 는
    // §2 스키마(칸)와 §3 어휘(칸에 들어갈 말)를 같은 문서의 형제로 둔다 — 그 말을 쓴다.
    title: "DATA CONTRACT", sub: "스키마 · 어휘",
    items: [
      { href: "/contract", label: "활성 스키마" },
      // 08/30 팀장 지시로 「유래」(/contract/provenance)를 메뉴에서 뺐다.
      // 화면과 라우트는 그대로 살아 있고 주소로 열린다 — **동선에서만** 내린 것이다.
      // (같은 처리를 받았던 `/review` 는 08/31 에 아예 삭제됐다: 주소로만 열리는 화면을
      //  오래 두면 «메뉴에 없는 페이지»가 되어 결국 누가 묻는다.)
      { href: "/contract/evolve", label: "변경 심사" },
      { href: "/contract/ontology", label: "온톨로지", badge: "unmapped" },
    ],
  },
  {
    title: "AUDIT", sub: "추적 · 증빙",
    // `/market` 은 여기 없다 (08/28 결정) — Screen 검토관 4인과 같은 커넥터 4개
    // (openfda·ctgov·pubmed·cms)를 쓰는 부분 중복이라 **「근거 검증」 안 탭으로 흡수**한다.
    // 화면과 API는 살아 있고 주소로는 열린다. 흡수는 근거 검증 화면 작업에서 한다.
    items: [
      { href: "/safety", label: "안전" },
      { href: "/audit", label: "실행 기록" },
      // 08/30 신설 — 실DB 사본에서 파이프라인을 회차 반복해 재현성을 증명하는 화면.
      // 실행 기록이 "0원으로 다시 재생할 수 있다"의 증거라면, 여기는 실제로 다시
      // 돌려 같은 답이 나옴을 보이는 자리다 — 같은 AUDIT(증빙) 성격이라 이 그룹.
      { href: "/simulate", label: "재현 시뮬레이션" },
    ],
  },
];

export default function Nav({ collapsed = false }: { collapsed?: boolean }) {
  const path = usePathname();
  const params = useSearchParams();
  const here = params.get("stage") ?? "";
  const [stage, setStage] = useState<Stage | null>(null);
  // 08/28 시안 복원: 온톨로지 미매핑 건수. 구조 루프의 입구에 밀린 일이 있다는 상시 신호다.
  const [unmapped, setUnmapped] = useState<number | null>(null);

  // 배지는 서버가 센 숫자다. 실패해도 메뉴는 그대로 뜬다 — 숫자만 사라진다.
  //
  // 경로 변화만 보면 **같은 페이지에서 단계를 넘길 때 숫자가 안 따라온다** (08/27 실사고 —
  // [AI Board로 보내기]를 눌렀는데 옆 카운트가 그대로였다). 전이한 쪽이 이벤트로 알려 준다.
  useEffect(() => {
    let alive = true;
    const load = () => api<{ stages: Stage }>("/hypotheses/pipeline")
      .then((d) => { if (alive) setStage(d.stages); })
      .catch(() => { if (alive) setStage(null); });
    api<{ totalTerms?: number }>("/analytics/unmapped?limit=1", { role: "DATA_STEWARD" })
      .then((d) => { if (alive) setUnmapped(d.totalTerms ?? null); })
      .catch(() => {});
    load();
    const onChanged = () => { load(); };
    window.addEventListener("delphi:pipeline-changed", onChanged);
    return () => { alive = false; window.removeEventListener("delphi:pipeline-changed", onChanged); };
  }, [path, params.toString()]);

  const count = (b: Item["badge"]) =>
    b === undefined ? null : typeof b === "number" ? b : b === "unmapped" ? unmapped : (stage?.[b] ?? null);

  /**
   * 활성 항목은 **가장 구체적인 경로 하나**다 (08/28 버그 수정).
   *
   * `path.startsWith(base)` 만 보면 부모가 자식 경로에서도 켜진다 — `/contract/ontology`
   * 에서 `활성 스키마`(/contract)와 `온톨로지`가 **동시에 네이비로** 칠해졌다.
   * DATA CONTRACT 아래에 자식이 넷 생기면서 드러난 문제다.
   *
   * 그래서 현재 경로에 맞는 base 중 **가장 긴 것**을 먼저 구하고 그것만 활성으로 본다.
   * prefix 매칭 자체는 남긴다 — 하위 페이지에서 부모 메뉴가 켜지는 것은 맞는 동작이다
   * (예: `/contract/provenance` 에서 `활성 스키마`).
   */
  const bestBase = GROUPS
    .flatMap((g) => g.items)
    .map((it) => it.href.split("?")[0])
    .filter((b) => (b === "/" ? path === "/" : path === b || path.startsWith(b + "/")))
    .reduce((a, b) => (b.length > a.length ? b : a), "");

  return (
    <nav className="flex flex-col gap-px">
      {GROUPS.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {/* 그룹 헤더 — 08/28: 구획이 안 보인다는 지적을 받아 헤어라인 구분선을 넣고
              라벨을 네이비 굵게로 올렸다. 흐린 눈썹 라벨만으로는 SENSE·SCREEN·AI BOARD가
              층으로 읽히지 않았다 (실측: --faint 가 2.9:1로 AA 미달이었던 것도 원인). */}
          {g.title && collapsed && gi > 0 && <div className="mx-2 mb-2 mt-5 border-b border-line" />}
          {g.title && !collapsed && (
            <div className="mx-3 mb-2 mt-6 flex items-baseline gap-2 border-b border-line pb-1.5">
              {/* 08/28 팀장: 레이어 이름이 조금 더 커도 된다 — 11px → 12.5px.
                  항목 라벨(13px)보다는 작게 두어 위계는 유지한다(대문자·굵게·자간·구분선). */}
              <span className="text-[0.875rem] font-bold tracking-[0.12em] text-ink">{g.title}</span>
              {/* 부제는 확대에서 제외한다 (08/30) — 248px 레일에서 「외부 공개 근거 대조」·
                  「스키마 · 어휘」가 두 줄로 접혀 구획 머리가 들쭉날쭉해졌다. */}
              {g.sub && <span className="text-[0.6875rem] text-faint">{g.sub}</span>}
            </div>
          )}
          {g.items.map((it, i) => {
            const [base, query = ""] = it.href.split("?");
            const want = new URLSearchParams(query).get("stage") ?? "";
            // 같은 경로를 쿼리로 나눠 쓰므로(신호와 가설·근거 검증·심의) 단계까지 맞춰야
            // 한 항목만 활성이 된다 — 경로만 보면 셋이 동시에 켜진다 (08/26 수정)
            const active = base === bestBase && here === want;
            const n = count(it.badge);
            return (
              <Link
                key={`${it.href}-${i}`}
                href={it.href}
                title={collapsed ? it.label : undefined}
                /* 08/28: 항목마다 붙어 있던 점을 없앴다 (구분 기능 0 — 활성은 네이비 fill 이 표시).
                   08/30: 접힘 레일이 생기며 **아이콘이 그 자리를 물려받았다** — 접으면 아이콘만
                   남아야 하므로 모든 항목이 아이콘을 갖는다 (untitledui 패턴). */
                className={`relative flex items-center gap-2.5 rounded-lg py-[7px] text-[0.875rem] transition-colors ${
                  collapsed ? "justify-center px-0" : it.sub ? "pl-6 pr-3 text-muted" : "pl-3 pr-3 text-body"
                } ${active ? "bg-ink font-semibold text-on-navy" : "hover:bg-fill-1"}`}
              >
                <NavIcon href={it.href} />
                {!collapsed && <span className="flex-1 whitespace-nowrap">{it.label}</span>}
                {collapsed && n !== null && n > 0 && (
                  /* 접힘에서는 숫자 대신 점 — 숫자는 펼치면 보인다. 점의 뜻은 title 로. */
                  <span className="absolute right-1.5 top-1 size-1.5 rounded-full bg-orange-bright"
                        title={BADGE_MEANS[it.badge as string] ?? "건수"} />
                )}
                {/* 08/28 팀장 피드백: 이 숫자는 **새로 뜬 일**의 개수다 — 그것이 보이게
                    강조색 원 안에 넣는다. 사이드바에서 유일한 오렌지이므로 남발이 아니고,
                    강조색이 원래 해야 할 일(사람이 볼 차례라는 신호)을 한다.
                    채움을 틴트가 아니라 꽉 찬 밝은 오렌지로 한 이유는 대비다 —
                    오렌지 숫자 × 오렌지 틴트는 2.91:1(현재 회색 배지 5.69:1 보다 낮다).
                    밝은 오렌지 면 위 네이비 숫자는 **6.97:1**. 활성 행(네이비 면)에서도
                    같은 원이 그대로 도드라진다(원 대 행 5.65:1). 두 자리 이상은 알약으로 늘어난다. */}
                {!collapsed && n !== null && n > 0 && (
                  <span className="mono inline-flex min-w-5 items-center justify-center rounded-full
                                   bg-orange-bright px-1.5 py-px text-[0.75rem] font-semibold
                                   tabular-nums text-navy"
                        title={BADGE_MEANS[it.badge as string] ?? "건수"}>
                    {n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/* 이 배포에서 숨기는 화면 — 백엔드가 그 API를 아직 제공하지 않는다. 라우트는 살아 있다. */
const HIDDEN = new Set(["/pipeline", "/contract", "/contract/evolve", "/contract/ontology", "/contract/provenance",
                        "/simulate", "/market", "/collection", "/review/field", "/analytics"]);
export const GROUPS = RAW_GROUPS
  .map((g) => ({ ...g, items: g.items.filter((i) => !HIDDEN.has(i.href.split("?")[0])) }))
  .filter((g) => g.items.length > 0);
