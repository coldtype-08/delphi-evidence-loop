"use client";

/**
 * 접이식 사이드바 셸 (08/30 — 대시보드 개편).
 *
 * 접으면 아이콘 레일(64px)만 남고, 펼치면 기존 메뉴(220px) 그대로다 — 팀장 요청
 * ("접었을 경우에는 아이콘 정도로만, 펼치면 세부 내용"). 구조는 untitledui의
 * SidebarNavigation(simple↔slim) 패턴을 우리 토큰으로 옮긴 것이고, 새 라이브러리는
 * 들이지 않는다 (현재 전 컴포넌트 수제 구현 방침 유지).
 *
 * 상태는 localStorage("delphi:nav-collapsed")에 남는다 — 레이아웃은 라우트 이동에도
 * 살아 있으므로(App Router) 플래시는 전체 새로고침 때 한 번뿐이다.
 *
 * ── 08/31 ① 접기 버튼을 머리로 올리고 스크롤 영역을 갈랐다 ──────────────
 * 08/30에 이 버튼을 하단(`mt-auto`)에 두며 "메뉴가 길어져도 항상 손 닿는 곳에"라고
 * 적었는데, 실측은 반대였다: 1440×750 뷰포트에서 메뉴 내용이 **978px**이라 228px가
 * 넘치고 버튼은 top 923px — **화면 밖**이었다. 978px면 1920×1080 모니터에서도
 * 브라우저 크롬을 빼면 아슬아슬하다.
 *
 * 위로 올리는 것만으로는 부족하다 — `aside` 전체가 스크롤 영역이면 머리도 같이
 * 흘러간다. 그래서 **머리(로고+토글)는 고정(flex-none), 메뉴만 스크롤**로 나눴다.
 *
 * ── 08/31 ② 토스 UX 가이드 대조로 화살표 자체를 다시 봤다 ───────────────
 * 참고: 앱인토스 consumer-ux-guide. 문서 대부분(탭바·바텀시트·논리 해상도)은 모바일
 * 미니앱 규격이라 이 데스크톱 대시보드와 무관하고, **토스 아이콘 세트는 저작권상
 * 제휴 환경 밖에서 못 쓴다** — 그래서 아이콘은 그대로 Untitled UI 에서 고른다.
 * 걸린 것은 세 가지였고 셋 다 이 버튼의 문제였다:
 *
 *  ① **크기** — 화살표가 14px 이었다. 토스 하한(24px)은 *터치* 기준이라 그대로
 *     따르지 않는다(따르면 메뉴 아이콘 15px 옆에서 토글이 제일 큰 그림이 된다).
 *     **아이콘 20px · 클릭 영역 32px** — 43% 키우되 사이드바의 아이콘 언어는 지킨다.
 *  ② **모호한 CTA 금지** — ①에서 자리를 옮기며 「접기」 글자를 지웠는데, 이건 후퇴다.
 *     로고 줄에 글자를 넣을 폭이 없으므로 **호버 툴팁**으로 되살린다.
 *  ③ **정확한 상황 전달** — `‹` 홑화살표는 웹에서 «뒤로 가기»의 기호다. 패널을
 *     밀어 넣는 동작은 **겹화살표 «**(ChevronLeftDouble)가 정확하고, 회전 하나로
 *     접힘/펼침 방향까지 말한다.
 *
 * 같은 문서의 «나갈 수 있는 선택지 부재 금지» 정신도 하나 적용했다 — 접힌 64px
 * 레일에서 되돌릴 길을 못 찾으면 사용자가 갇히므로, 접힘에서는 버튼에 옅은 면을
 * 깔아 «누를 수 있는 것»으로 먼저 읽히게 한다.
 *
 * ── 08/31 ③ 막대를 감추고 로고를 홈으로 (팀장 요청 두 건) ────────────────
 * "왼쪽 사이드바에 세로 스크롤바가 없는게 더 깔끔할거 같은데" — ①의 스크롤 상자는
 * 넘칠 때 막대를 띄운다. 220px 기둥에서 **16px**(실측)를 막대가 가져가면 그만큼
 * 라벨이 밀리고, 좁은 기둥일수록 티가 난다. 막대만 감추고 스크롤은 살린다
 * (`.no-scrollbar`, globals.css). 감춰도 휠·트랙패드·키보드는 그대로 동작한다.
 *
 * "로고 누르면 홈화면으로 갈 수 있게" — 펼침에서는 로고 묶음, 접힘에서는 「D」 심벌이
 * 홈 링크다. 대시보드에서 로고는 관례적으로 홈이고, 접힘 레일에는 「홈」 메뉴가
 * 아이콘 하나로만 남아 이 길이 하나 더 있는 편이 낫다.
 */

import Image from "next/image";
import Link from "next/link";
import { ChevronLeftDouble } from "@untitledui/icons";
import { Suspense, useEffect, useState } from "react";
import Nav from "../nav";

const KEY = "delphi:nav-collapsed";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setCollapsed(true);
    } catch {
      /* 프라이빗 모드 등 — 기본값(펼침)으로 둔다 */
    }
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(KEY, v ? "0" : "1");
      } catch {
        /* 저장 실패는 무해 — 세션 안에서는 상태로 동작한다 */
      }
      return !v;
    });
  };

  const label = collapsed ? "사이드바 펼치기" : "사이드바 접기";

  /* 토글 — 로고 줄의 오른쪽(펼침) / 심벌 아래(접힘). 두 자리 모두 머리 안이라 고정된다.
     툴팁은 버튼 오른쪽으로 나가므로 `aside` 에 overflow-hidden 을 걸지 않는다
     (자르는 것은 메뉴 쪽 스크롤 상자 하나뿐이다 — 아래 참조). */
  const Toggle = (
    <span className="group relative flex-none">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className={`grid size-8 place-items-center rounded-lg transition-colors
                    hover:bg-fill-1 hover:text-ink focus-visible:bg-fill-1 focus-visible:text-ink
                    ${collapsed ? "bg-fill-1 text-body" : "text-muted"}`}
      >
        <ChevronLeftDouble size={20} strokeWidth={1.8}
                           className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
      </button>
      {/* 라벨 — 「접기」 글자를 대신한다. **마우스를 올렸을 때만** 뜬다.
          초점(focus-within)에도 띄웠다가 뺐다: 버튼을 누르면 초점이 그대로 남아
          팁이 안 사라지는데, 그때 라벨은 이미 **반대 상태**로 바뀌어 있다 —
          「사이드바 접기」를 눌렀는데 화면에는 「사이드바 접기」가 계속 떠 있는 꼴.
          읽어 주는 쪽은 버튼의 aria-label 이므로 스크린리더가 잃는 것은 없다. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-30
                   -translate-y-1/2 whitespace-nowrap rounded-lg bg-navy px-2 py-1
                   text-[0.75rem] font-medium text-on-navy opacity-0 shadow-card
                   transition-opacity duration-150 group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  );

  return (
    <aside
      /* z-30 — `position: sticky` 는 그 자체로 쌓임 맥락을 만든다. 그래서 이 안에서
         아무리 z 를 올려도 **DOM 상 뒤에 오는 `main` 이 위에 그려진다** — 툴팁이
         상단바(z-20)에 가려지던 원인이다. 올려야 할 것은 툴팁이 아니라 사이드바다.
         40(계약 배지)·50(툴팁·모달)에는 안 걸리는 자리다. */
      className={`sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-line
                  bg-side transition-[width]
                  duration-300 md:flex ${collapsed ? "w-[64px]" : "w-[220px]"}`}
    >
      {/* 머리 — 스크롤되지 않는다(flex-none). 로고와 접기 버튼이 여기 산다. */}
      <div className={`flex-none pt-5 ${collapsed ? "px-2.5" : "px-3.5"}`}>
        {/* 로고 — 접힘에서는 심벌만. 원본 로고는 가로형이라 접힘 폭에 안 들어간다. */}
        {collapsed ? (
          <div className="mb-4 flex flex-col items-center gap-2">
            <Link
              href="/"
              aria-label="DELPHi 홈"
              className="mono flex size-8 items-center justify-center rounded-lg bg-navy
                         text-[0.875rem] font-bold text-on-navy transition-opacity
                         hover:opacity-85"
              title="DELPHi Console — 홈"
            >
              D
            </Link>
            {Toggle}
          </div>
        ) : (
          <div className="mb-4 flex items-start justify-between gap-2 px-2">
            {/* 로고 = 홈 (08/31 팀장 요청). 접힘에서는 「D」 심벌이 그 역할을 물려받는다. */}
            <Link href="/" aria-label="DELPHi 홈"
                  className="flex min-w-0 flex-col gap-1 transition-opacity hover:opacity-75">
              <Image src="/logo-navy.png" alt="DELPHi" width={640} height={84}
                     priority className="h-[19px] w-auto self-start" />
              <span className="mono text-[0.75rem] tracking-[0.16em] text-muted">CONSOLE</span>
            </Link>
            {Toggle}
          </div>
        )}
      </div>
      {/* 메뉴 — 자르고 스크롤하는 것은 여기 하나뿐이다.
          min-h-0 이 없으면 flex 자식이 줄지 않아 넘침이 부모로 샌다. */}
      {/* 08/31 (팀장: "세로 스크롤바가 없는게 더 깔끔할거 같은데") — 막대만 감추고
          스크롤은 살린다. 실측: 220px 기둥에서 막대가 16px 를 가져가 라벨을 밀었다. */}
      <div className={`no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-5
                       ${collapsed ? "px-2.5" : "px-3.5"}`}>
        {/* useSearchParams 는 Suspense 경계가 필요하다 (Next 16) */}
        <Suspense fallback={<div className="h-64" />}>
          <Nav collapsed={collapsed} />
        </Suspense>
      </div>
    </aside>
  );
}
