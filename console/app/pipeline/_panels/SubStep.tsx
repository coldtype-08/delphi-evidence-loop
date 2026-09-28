"use client";

import { useEffect, useState } from "react";
import { Eyebrow, Chip } from "@/app/components/ui";

/** 하위 단계 하나 — 진행 스파인 + 접히는 본문 (08/26).
 *
 * 왜 필요한가. ① 단계는 실제로는 세 걸음(읽는다 → 고른다 → 확정한다)인데 화면은
 * 평평한 나열이었고, 게다가 **순서가 거꾸로**였다 — 조립 표가 분할 독해보다 위에
 * 있어서 위에서 아래로 읽으면 "재료가 생기기 전에 고르라"고 나왔다.
 *
 * 규칙 둘:
 *  - 끝난 걸음은 **한 줄 영수증**으로 접힌다. 눌러서 다시 펼칠 수 있다.
 *  - 지금 할 걸음만 펼쳐진다. 상태가 바뀌면 저절로 따라간다(사람이 직접 접었다면 존중).
 *
 * 높이를 재지 않는다 — `grid-template-rows: 0fr → 1fr`이라 내용이 길어져도 잘리지 않는다.
 */
export type SubStepState = "wait" | "active" | "done";

const CHIP: Record<SubStepState, { ko: string; tone: "orange" | "green" | "plain" }> = {
  wait: { ko: "대기", tone: "plain" },
  active: { ko: "지금", tone: "orange" },
  done: { ko: "완료", tone: "green" },
};

export default function SubStep({
  mark, title, state, receipt, last, children,
}: {
  mark: string;                    // a · b · c — 순서를 눈으로
  title: string;
  state: SubStepState;
  receipt?: React.ReactNode;       // 접혔을 때 보이는 한 줄
  last?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(state === "active");
  const [touched, setTouched] = useState(false);

  // 상태가 바뀌면 따라 열리고 닫힌다 — 단, 사람이 직접 접었다면 그 뜻을 존중한다
  useEffect(() => {
    if (!touched) setOpen(state === "active");
  }, [state, touched]);

  const node =
    state === "done" ? "border-transparent bg-green text-white"
    : state === "active" ? "border-transparent bg-orange text-navy"
    : "border-line bg-card text-faint";

  return (
    <div className="grid grid-cols-[26px_1fr] gap-x-4">
      {/* 진행 스파인 — 노드와 실 */}
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className={`mono mt-3.5 grid size-[26px] flex-none place-items-center rounded-full border-[1.5px] text-[0.75rem] font-bold transition-[background-color,border-color,color,box-shadow] duration-300 ${node}`}
        >
          {state === "done" ? "✓" : mark}
        </span>
        {!last && (
          <span
            aria-hidden
            className={`w-px flex-1 transition-colors duration-500 ${
              state === "done" ? "bg-green" : "bg-fill-2"}`}
          />
        )}
      </div>

      <div
        className={`my-2 overflow-hidden rounded-lg border bg-card transition-opacity duration-300 ${
          state === "active" ? "border-orange/50" : "border-glass-line"
        } ${state === "wait" ? "opacity-55" : ""}`}
      >
        <button
          type="button"
          onClick={() => { setTouched(true); setOpen((o) => !o); }}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <Eyebrow>1-{mark}</Eyebrow>
            <span className="mt-0.5 block text-[0.9375rem] font-bold leading-tight text-navy">{title}</span>
            {receipt && (
              <span className="mt-1 block text-[0.8125rem] leading-[1.6] text-muted">{receipt}</span>
            )}
          </span>
          <Chip tone={CHIP[state].tone}>{CHIP[state].ko}</Chip>
          <span
            aria-hidden
            className={`flex-none text-[0.75rem] text-faint transition-transform duration-300 ${
              open ? "rotate-90" : ""}`}
          >
            ▶
          </span>
        </button>

        {/* 높이를 재지 않는 접힘 — 내용이 길어져도 잘리지 않는다 */}
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col gap-3 px-4 pb-4 pt-0.5">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
