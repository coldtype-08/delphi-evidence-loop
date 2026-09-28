"use client";

/**
 * 도식 카드 호버 상세 (08/30 팀장 요청) — 큰 숫자·바·칩에 마우스를 올리면 분해가 뜬다.
 *
 * 내용(tip)은 서버 컴포넌트가 계산해 내려준다 — 여기는 자리만 잡는다. 새 수치를
 * 만들지 않는다 (절대 규칙 #1): 팁에 실리는 것도 전부 서버 값이다. 터치 화면에는
 * hover 가 없으므로 이 팁은 부가 정보만 담는다 — 본문 없이 팁에만 있는 정보를 두지 말 것.
 *
 * 08/30 2차 (팀장: "마우스를 대면 너무 많이 움직여서 엄청 불편해"): 커서 추적을 버리고
 * **올린 카드에 고정**한다. 벤토 타일은 폭이 200~400px 이라 커서를 따라다니면 팝업이
 * 카드 폭만큼 휘저었다 — 읽는 동안 글자가 도망가는 셈이었다. 자리 계산은 실측 크기로
 * 하되 `useLayoutEffect` 라 그리기 전에 끝나므로 튀어 보이지 않는다.
 *
 * 08/31 3차 (팀장: "마우스가 조금만 움직여도 팝업이 사라져서 그 안에 링크를 누를 수조차
 * 없어"): 팝업이 **닫히기 전에 건너갈 다리**가 없었다. 팝업은 카드 밖에 뜨므로 그쪽으로
 * 가는 길에 커서가 카드를 벗어나고, 그 순간 `onMouseLeave` 가 즉시 닫았다. 게다가
 * `pointer-events-none` 이라 도착해도 잡히지 않았다 — 팝업 안의 링크는 누를 방법이 없었다.
 *
 * 두 가지를 고친다: ① 닫기를 **지연**시켜 사이 간격을 건널 시간을 준다(200ms).
 * ② 팝업이 커서를 받게 하고, 팝업 위에 있는 동안은 열어 둔다. 지연은 «가만히 있으면
 * 닫히는 시간»이 아니라 «건너가는 동안만 유지되는 시간»이라 짧아야 한다 — 길면 다른
 * 카드로 옮겼을 때 앞 팝업이 남는다.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { anchorTip, type TipPos } from "./anchor";

/* ── 팁의 골격 ────────────────────────────────────────────────────────
   08/30 팀장 피드백: "팝업 카드에 나오는 내용이 줄바꿈이 제대로 안 되어 있어서
   가독성이 상당히 떨어져". 원인은 줄바꿈 자체가 아니라 **구조가 없었던 것**이다 —
   「청소년·소아 91 · 전신발작 52 · 난치성 성인 44」처럼 이름과 숫자를 가운뎃점으로
   이어 붙이면, 폭이 좁아 아무 데서나 접히고 어느 숫자가 어느 이름의 것인지 흐려진다.
   이름은 왼쪽, 숫자는 오른쪽에 고정하는 **줄**로 바꾸면 접힐 일이 없다.

   같은 피드백의 다른 절반: "사용자가 안 봐도 되는 내용 — 절대 규칙 #5 같은 건 지워라".
   규칙 번호는 우리 문서의 각주지 화면을 보는 사람의 정보가 아니다. 뜻이 필요하면
   규칙을 인용하지 말고 **그 뜻을 한국어로** 쓴다. */

/** 팁 머리 — 무엇에 대한 팝업인지 한 줄. */
export function TipHead({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 border-b border-white/15 pb-1.5 text-[0.8125rem] font-semibold
                    leading-[1.45] text-orange-bright">
      {children}
    </div>
  );
}

/** 이름 ↔ 값 한 줄. 값은 오른쪽 정렬이라 여러 줄이 표처럼 읽힌다. */
export function TipRow({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-5 py-[1.5px]">
      <span className="min-w-0 text-on-navy-2">{k}</span>
      <span className="flex-none font-medium tabular-nums">{v}</span>
    </div>
  );
}

/** 줄 아래 덧붙이는 설명 한 문단 — 규칙 번호가 아니라 뜻을 쓴다. */
export function TipNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 border-t border-white/15 pt-1.5 leading-[1.6] text-on-navy-3">
      {children}
    </p>
  );
}

export default function HoverTip({ tip, children, className }: {
  tip: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TipPos | null>(null);

  /* 닫기 지연 — 카드와 팝업 사이 간격을 건너는 동안만 유지된다. */
  const closeT = useRef<number | null>(null);
  const hold = () => { if (closeT.current !== null) { clearTimeout(closeT.current); closeT.current = null; } };
  const show = () => { hold(); setOpen(true); };
  const hide = () => {
    hold();
    closeT.current = window.setTimeout(() => { setOpen(false); setPos(null); closeT.current = null; }, 200);
  };
  useEffect(() => hold, []);

  // 팁이 붙은 다음 실제 크기로 자리를 정한다 — 그리기 전에 끝난다(레이아웃 이펙트).
  useLayoutEffect(() => {
    if (!open || !hostRef.current || !tipRef.current) return;
    setPos(anchorTip(hostRef.current, {
      w: tipRef.current.offsetWidth,
      h: tipRef.current.offsetHeight,
    }));
  }, [open]);

  return (
    <div
      ref={hostRef}
      className={`cursor-help ${className ?? ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {open && (
        <div
          ref={tipRef}
          /* 폭을 넓혔다 — 「이름 … 값」 줄이 접히지 않을 만큼은 있어야 표로 읽힌다. */
          /* 재질은 `.tip-glass` 하나가 정한다 (globals.css) — 여정 보드 팝업과 같은 것 */
          /* 커서를 받는다 — 팝업 안의 링크를 누를 수 있어야 한다 (08/31). */
          onMouseEnter={show}
          onMouseLeave={hide}
          className="tip-glass fixed z-50 w-max max-w-[320px] break-keep rounded-2xl px-3.5 py-2.5
                     text-[0.75rem] leading-[1.65] text-on-navy"
          /* 자리를 잡기 전 한 프레임은 숨긴다 — 왼쪽 위에서 튀어나오지 않게 */
          style={pos ? { left: pos.x, top: pos.y } : { left: 0, top: 0, visibility: "hidden" }}
        >
          {tip}
        </div>
      )}
    </div>
  );
}
