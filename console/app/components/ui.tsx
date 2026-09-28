/**
 * 공용 UI 프리미티브 — Assets/ui-mockups/DELPHi UI.dc.html 의 값을 그대로 옮겼다.
 *
 * 규칙: 이 파일에 없는 카드/라벨/버튼 모양을 페이지에서 새로 짓지 않는다.
 * 필요하면 여기에 variant 를 하나 늘린다. 색은 네이비 #162661 · 오렌지 #EF8B1C 둘뿐이고
 * 신호 등급은 색이 아니라 점의 채도로 가른다 (globals.css `.grade` 규칙과 동일).
 *
 * 서버 컴포넌트에서 그대로 쓸 수 있다 — JsonFold 는 <details> 라 JS 가 필요 없다.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Breadcrumb from "./breadcrumb";

const cx = (...v: (string | false | null | undefined)[]) => v.filter(Boolean).join(" ");

/* ── 바탕 ──────────────────────────────────────────────────────────────
   목업의 흐릿한 원 두 개. layout.tsx 의 <body> 첫 자식으로 한 번만 깐다.
   @keyframes bub 은 globals.css 에 있다. */
export function Backdrop() {
  return (
    /* opacity 를 `--ambient` 로 묶는다 — flat 안에서 0 이 되어 블롭이 사라진다.
       DOM 을 지우지 않는 이유: 안을 갈아탈 때 레이아웃이 흔들리지 않아야 한다. */
    <div aria-hidden style={{ opacity: "var(--ambient)" }}
         className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* 08/30 리스킨 — 웜 크림 앰비언트. 파란 방울을 뺐다: 목업의 바탕은 크림 단색에
          가깝고, 남는 색 기운은 브랜드 오렌지 한 점이면 충분하다. */}
      <div className="absolute inset-0 bg-[linear-gradient(158deg,#F4F2EC_0%,#F2F0EA_52%,#F5EFE2_100%)]" />
      <i className="absolute -right-40 -top-44 size-[560px] rounded-full bg-[rgba(255,255,255,.75)] blur-[80px]" />
      <i className="absolute -bottom-40 -left-36 size-[480px] rounded-full bg-[rgba(239,139,28,.1)] blur-[90px] motion-safe:animate-[bub_30s_-14s_ease-in-out_infinite]" />
    </div>
  );
}

/* ── 유리 패널 ────────────────────────────────────────────────────────
   화면의 기본 단위. tone 으로 네 가지만 쓴다.
     glass  반투명 흰 카드 (기본)
     navy   결정·규칙처럼 못 박는 블록. 안의 글자는 자동으로 밝아진다
     note   배경에 살짝 잠긴 회색 블록 — 설명·주의
     inset  패널 안에 들어가는 얕은 줄 (표 행, 카운터) */
type Tone = "glass" | "navy" | "note" | "inset";
const TONE: Record<Tone, string> = {
  glass: "bg-card border border-glass-line shadow-card",
  navy: "bg-navy/90 text-on-navy border border-line-2 shadow-card",
  note: "bg-fill-1 border border-line",
  inset: "bg-card border border-transparent",
};

export function Panel({
  tone = "glass",
  pad = "md",
  active = false,
  as: Tag = "div",
  className,
  children,
  ...rest
}: {
  tone?: Tone;
  pad?: "none" | "sm" | "md" | "lg";
  /** 선택된 카드 — 오렌지로 물든다 */
  active?: boolean;
  /** 문단 구획이면 section 으로 — 재질은 같고 의미만 다르다 (08/26) */
  as?: "div" | "section";
  className?: string;
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <Tag
      {...rest}
      className={cx(
        "rounded-2xl",
        pad === "sm" && "px-4 py-3",
        pad === "md" && "px-5 py-4",
        pad === "lg" && "px-5 py-5",
        active ? "border border-line-2 bg-orange-soft" : TONE[tone],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/* ── 단계 표식 ────────────────────────────────────────────────────────
   파이프라인의 ⓪①②③ 처럼 순서가 있는 것에만 쓴다. 네이비 원은 이 화면 체계에서
   "행위자 한 명 / 단계 하나"를 뜻한다 (TraceTurn 의 아바타와 같은 재질). */
export function Step({ n, size = "md" }: { n: ReactNode; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "mono flex flex-none items-center justify-center rounded-full bg-navy/90 text-on-navy",
        size === "md" && "size-6 text-[0.8125rem]",
        size === "sm" && "size-5 text-[0.75rem]",
      )}
    >
      {n}
    </span>
  );
}

/* ── 눈썹 라벨 ────────────────────────────────────────────────────────
   패널마다 맨 위에 붙는 모노 대문자 한 줄. 화면에서 가장 자주 쓰인다. */
export function Eyebrow({
  children,
  onNavy = false,
  className,
}: {
  children: ReactNode;
  /** navy 패널 안에서는 밝은 색으로 */
  onNavy?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "mono whitespace-nowrap text-[0.75rem] uppercase tracking-[0.14em]",
        onNavy ? "text-on-navy-2" : "text-faint",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── 큰 수치 ──────────────────────────────────────────────────────────
   숫자는 항상 tabular-nums. 단위는 숫자보다 작고 흐리게 붙인다. */
export function Stat({
  value,
  unit,
  label,
  note,
  size = "md",
}: {
  value: ReactNode;
  unit?: string;
  label?: string;
  note?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div>
      {label && <Eyebrow>{label}</Eyebrow>}
      <div className={cx("flex items-baseline gap-1.5", label && "mt-3")}>
        <span
          className={cx(
            "font-medium tabular-nums leading-none text-navy",
            size === "sm" && "text-[1.5rem]",
            size === "md" && "text-[2.6rem]",
            size === "lg" && "text-[2.6rem]",
          )}
        >
          {value}
        </span>
        {unit && <span className="mono text-[0.8125rem] text-faint">{unit}</span>}
      </div>
      {note && <p className="mt-2.5 text-[0.875rem] leading-[1.65] text-body">{note}</p>}
    </div>
  );
}

/* ── 신호 등급 점 ─────────────────────────────────────────────────────
   색을 바꾸지 않는다. 오렌지 하나로 채도만 내린다 (절대 규칙). */
export function Grade({ level = "h" }: { level?: "h" | "m" | "l" }) {
  return <span className={cx("grade", level === "m" && "grade-m", level === "l" && "grade-l")} />;
}

/* ── 섹션 머리 ────────────────────────────────────────────────────────
   보드 컬럼처럼 목록 위에 얹는 제목 줄. 점 + 제목 + 오른쪽 카운트. */
export function SectionHead({
  title,
  dot = "navy",
  right,
}: {
  title: ReactNode;
  dot?: "navy" | "orange" | "none";
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line pb-2.5">
      {dot !== "none" && (
        <span className={cx("size-2 rounded-full", dot === "orange" ? "bg-orange" : "bg-navy")} />
      )}
      <b className="text-[0.9375rem]">{title}</b>
      {right && <span className="mono ml-auto text-[0.75rem] text-muted">{right}</span>}
    </div>
  );
}

/* ── 얕은 줄 ──────────────────────────────────────────────────────────
   패널 안의 key–value 한 줄. 표를 쓸 정도가 아닌 것은 전부 이걸로. */
export function Row({
  label,
  value,
  cols,
}: {
  label: ReactNode;
  value: ReactNode;
  /** 3열이 필요할 때 가운데 칸 */
  cols?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "mono gap-3 rounded-xl bg-card px-3 py-2 text-[0.8125rem] text-muted",
        cols ? "grid grid-cols-[1.3fr_1.4fr_auto]" : "flex justify-between",
      )}
    >
      <span>{label}</span>
      {cols && <span className="text-faint">{cols}</span>}
      <span>{value}</span>
    </div>
  );
}

/* ── 표 ──────────────────────────────────────────────────────────────
   열이 여러 개이고 행이 길 때만 쓴다. 그보다 작으면 Row 로 충분하다.
   머리줄은 눈썹 라벨과 같은 재질이고, 칸 경계는 네이비 실선 한 겹뿐이다 —
   격자를 그리면 숫자보다 선이 먼저 보인다 (08/26). */
export function TableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-lg border border-glass-line bg-card", className)}>
      <table className="w-full border-collapse text-left text-[0.8125rem]">{children}</table>
    </div>
  );
}
/** <th> 에 그대로 붙인다 */
export const TH =
  "mono whitespace-nowrap border-b border-line px-3 py-2 text-[0.75rem] font-normal uppercase tracking-[0.1em] text-faint";
/** <td> 에 그대로 붙인다 */
export const TD = "border-b border-line px-3 py-2.5 align-top";

/* ── 원문 인용 ────────────────────────────────────────────────────────
   근거는 항상 이 모양으로 보여준다 — 왼쪽 오렌지 선 + 모노. 요약하지 않는다. */
export function Quote({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <>
      <blockquote className="mono mt-3 rounded-lg border-l-[3px] border-orange bg-card px-4 py-3 text-[0.875rem] leading-[1.75]">
        {children}
      </blockquote>
      {meta && <p className="mono mt-2.5 text-[0.8125rem] leading-[1.7] text-muted">{meta}</p>}
    </>
  );
}

/* ── 칩 ───────────────────────────────────────────────────────────────
   상태·태그. 색은 오렌지 하나. 중립은 흰 유리. */
export function Chip({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "orange" | "navy" | "green" | "rust";
}) {
  return (
    <span
      className={cx(
        "mono inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[0.75rem]",
        tone === "orange" && "border border-orange/35 bg-orange-soft text-orange-deep",
        tone === "navy" && "bg-navy/90 text-on-navy",
        tone === "green" && "border border-green/30 bg-green-soft text-green",
        tone === "rust" && "border border-rust/30 bg-rust-soft text-rust",
        tone === "plain" && "border border-glass-line bg-card text-muted",
      )}
    >
      {children}
    </span>
  );
}

/* ── 버튼 ─────────────────────────────────────────────────────────────
   승인처럼 되돌릴 수 없는 것만 primary. 나머지는 전부 ghost.
   size="sm" 은 카드 안에 들어가는 줄 버튼 (Screen 실행·근거 보기 등) — 08/26 추가. */
/** 접히는 섹션 (08/26) — 매번 보지 않아도 되는 것은 접어 둔다.
 *
 * 화면이 길어지는 이유는 대개 **작업 순서가 아닌 것**이 순서 사이에 끼어서다:
 * 참고 자료(원문 확대경·원장 표), 증빙(호출 기록), 가끔 쓰는 도구(구조 루프).
 * 이런 것은 자리를 지키되 접혀 있어야 한다.
 *
 * `<details>`를 쓴다 — 브라우저가 접힘·키보드·검색을 알아서 해 준다.
 * `tone="quiet"`는 본 순서에서 한 걸음 물러난 것(참고·증빙)에 쓴다.
 */
export function Fold({
  title, badge, hint, defaultOpen = false, tone = "card", id, children,
}: {
  title: ReactNode;
  badge?: ReactNode;
  hint?: ReactNode;
  defaultOpen?: boolean;
  tone?: "card" | "quiet";
  id?: string;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className={cx(
        "group rounded-2xl border",
        tone === "quiet"
          ? "border-line bg-card"
          : "border-glass-line bg-card",
        "px-5 py-5",
      )}
    >
      {/* 한국어는 글자 사이 어디서나 줄이 바뀐다 — 좁은 칸에 들어가면 제목이
          한 글자씩 세로로 흘러내린다(08/27 실사고 제보). 세 겹으로 막는다:
          컨테이너 `min-w-0`(플렉스 항목이 내용보다 좁아질 수 있게), 제목에
          `min-w-0` + `break-keep`(한국어 단어를 쪼개지 않는다), 그리고 제목이
          한 줄을 통째로 차지하게 `basis-full`은 쓰지 않고 `flex-1`로 남는 폭을 받는다. */}
      {/* ⚠ 화살표는 **summary 의 직계 첫 자식**이어야 한다 (08/27 실사고).
          globals.css 에 `details[open] > summary > span:first-child { rotate(90deg) }` 가
          전역으로 걸려 있다 — JsonFold 의 ▶를 돌리려고 만든 규칙이다. 제목·배지를 감싸는
          래퍼 span 을 두면 **그 래퍼가 통째로 90도 돌아가고** inline-block 이라 레이아웃
          폭이 0이 되어 카드가 찌그러진다(열 때만 생겨서 원인을 찾기 어려웠다).
          그래서 summary 자체를 flex 컨테이너로 쓰고 회전 클래스는 붙이지 않는다. */}
      <summary className="-mx-1 flex min-w-0 cursor-pointer list-none flex-wrap items-center gap-2 rounded-lg px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange">
        <span aria-hidden className="flex-none text-[0.75rem] text-faint">▶</span>
        <span className="min-w-0 flex-1 break-keep text-[0.9375rem] font-bold text-navy">{title}</span>
        {badge}
        {hint && <span className="min-w-0 break-keep text-xs text-muted">{hint}</span>}
      </summary>
      <div className="mt-3.5">{children}</div>
    </details>
  );
}

/** 되돌릴 수 없는 행위 앞의 확인 (08/27).
 *
 * 계기: 팀원이 SCP 큐의 [승인]을 눌러 계약이 v1.0 → v2.0으로 올라갔다. 그 버튼은
 * **누르는 즉시 새 계약 버전이 활성화**되는 불가역 행위인데 아무 경고가 없었다.
 * 이번엔 무해했지만(판독이 끝난 뒤였다) 판독 중이었으면 스키마가 갈려 꼬였을 것이다.
 *
 * 규칙 둘:
 *  - **무엇이 일어나는지 구체적으로** 적는다. "정말 하시겠습니까?"는 아무것도 안 알려준다.
 *  - 되돌릴 수 있는지 없는지를 **명시**한다 — 그게 사람이 판단하는 기준이다.
 */
export function Confirm({
  open, title, detail, confirmLabel = "실행", onConfirm, onCancel,
}: {
  open: boolean;
  title: ReactNode;
  detail?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-navy/25 p-4 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-glass-line bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[0.9375rem] font-bold leading-snug text-navy">{title}</p>
        {detail && (
          <div className="mt-3 text-[0.875rem] leading-[1.75] text-body">{detail}</div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Btn size="sm" onClick={onCancel}>취소</Btn>
          <Btn size="sm" variant="primary" onClick={onConfirm} autoFocus>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

export function Btn({
  variant = "ghost",
  size = "md",
  className,
  ...rest
}: {
  variant?: "primary" | "ghost";
  /** xs = 표 행 안에 들어가는 것 · sm = 카드 안의 줄 · md = 화면의 결정 버튼 */
  size?: "xs" | "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  /*
   * 08/28: 내부를 **shadcn Button 으로 갈아끼웠다.** prop 이름·시그니처는 그대로라
   * 이 컴포넌트를 쓰는 곳(인혁 파일 포함)이 한 줄도 바뀌지 않는다 — 층에서 통일하면
   * 안전하고 파일에서 하면 충돌한다.
   *
   * 왜 바꿨나: 기존 Btn 은 크기를 **패딩(px/py)으로만** 정해서 글자 길이·줄바꿈에 따라
   * 높이가 달라졌다. 같은 줄에 놓인 버튼들의 높이가 안 맞는 원인이 이것이다.
   * shadcn Button 은 `h-7 / h-8 / h-10 / h-12` **고정 높이**라 내용과 무관하게 줄이 맞고,
   * 포커스 링(focus-visible:ring-[3px])도 함께 얻는다 — 접근성.
   *
   * 크기 대응: xs → xs(h-7) · sm → default(h-10) · md → lg(h-12).
   * 변형 대응: primary → default(오렌지 --primary) · ghost → outline.
   */
  return (
    <Button
      {...rest}
      variant={variant === "primary" ? "default" : "outline"}
      size={size === "xs" ? "xs" : size === "sm" ? "default" : "lg"}
      className={cx(variant === "primary" && "font-bold", className)}
    />
  );
}

/* 표 행 안의 <button> 처럼 요소를 Btn 으로 바꾸기 어려운 자리에 클래스만 붙인다.
   값은 Btn size="xs" 와 같다 — 정의가 여기 한 곳에만 있게 하려는 것이다 (08/26). */
/** 눈에 띄어야 하는 행 버튼 (채택·승인) */
export const BTN_ROW_NAVY =
  "mono rounded-lg bg-navy/90 px-2.5 py-1 text-[0.75rem] font-medium text-on-navy transition-opacity hover:opacity-90 disabled:opacity-40";
/** 보통 행 버튼 */
export const BTN_ROW =
  "mono rounded-lg border border-line bg-card px-2.5 py-1 text-[0.75rem] font-medium text-navy hover:bg-card disabled:opacity-40";
/** 물러나 있는 행 버튼 (기각·되돌리기) */
export const BTN_ROW_QUIET =
  "mono rounded-lg border border-line bg-transparent px-2.5 py-1 text-[0.75rem] text-muted hover:bg-fill-1 disabled:opacity-40";

/** input·select 에 그대로 붙인다 — 입력칸도 유리 재질로 통일 (08/26) */
export const FIELD =
  "mono rounded-xl border border-line bg-card px-3 py-2 text-[0.875rem] text-navy placeholder:text-faint focus:border-orange/60 focus:outline-none";

/* ── 탭 ───────────────────────────────────────────────────────────────
   경로가 바뀌지 않는 화면 안 전환. 경로가 바뀌면 Nav 로 간다.
   예외로 항목에 href 가 있으면 <Link> 로 그린다 — /contract 의 두 하위 화면처럼
   같은 화면의 두 얼굴인데 경로가 다른 경우만 (08/26). href 를 쓰면 onSelect 는 필요 없고
   서버 컴포넌트에서도 쓸 수 있다. */
export function TabBar({
  items,
  active,
  onSelect,
}: {
  items: { id: string; label: string; badge?: number; href?: string }[];
  active: string;
  onSelect?: (id: string) => void;
}) {
  const cls = (id: string) =>
    cx(
      "flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-[0.875rem] transition-colors",
      // 08/28: 활성 탭에서 오렌지를 뺐다. 탭은 **위치 안내**이지 "사람이 결정할 차례"가
      // 아니다 — 오렌지를 여기 쓰면 화면당 강조가 여러 곳이 되어 신호가 죽는다.
      // 좌측 내비 활성과 같은 문법(네이비 계열)으로 맞춘다.
      id === active
        ? "bg-fill-2 font-semibold text-ink"
        : "text-muted hover:bg-fill-1",
    );
  const inner = (t: { label: string; badge?: number }) => (
    <>
      {t.label}
      {t.badge != null && t.badge > 0 && (
        <span className="mono text-[0.75rem] text-muted">{t.badge}</span>
      )}
    </>
  );
  return (
    <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-glass-line bg-card p-1.5">
      {items.map((t) =>
        t.href ? (
          <Link key={t.id} href={t.href} className={cls(t.id)}>
            {inner(t)}
          </Link>
        ) : (
          <button key={t.id} onClick={() => onSelect?.(t.id)} className={cls(t.id)}>
            {inner(t)}
          </button>
        ),
      )}
    </div>
  );
}

/* ── 상단 바 ──────────────────────────────────────────────────────────
   58px 유리 헤더. **이동 경로 한 줄** — 지금 어느 메뉴에 있는지만 말한다 (08/30).
   화면별 요약을 놓던 자리였는데 뜻이 화면마다 달라 읽는 습관이 생기지 않았다.
   실제 그리기는 components/breadcrumb.tsx, 구획 이름은 사이드바에서 가져온다. */
export function Topbar({ title, meta, right }: {
  /** 경로의 마지막 칸. 메뉴에 있는 화면이면 구획·메뉴명이 앞에 자동으로 붙는다. */
  title: string; meta?: ReactNode; right?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-6 -mt-7 mb-6 flex h-[58px] flex-none items-center gap-3.5
                    overflow-hidden border-b border-glass-line bg-on-navy-3 pl-6 pr-6
                    backdrop-blur-[20px] backdrop-saturate-[170%] md:-mx-8 md:pl-8 md:pr-8">
      {/* 08/30 — 화면마다 다른 요약을 놓던 자리를 **이동 경로**로 통일했다 (팀장 지시).
          `meta` 는 남겨 두되 홈만 쓴다: 거기서는 asOf(집계 시각)가 화면의 신선도라
          «지금 보는 숫자가 언제 것인가»를 상단에서 답할 이유가 있다. */}
      <Breadcrumb leaf={title} />
      {meta && <span className="mono hidden whitespace-nowrap text-[0.75rem] text-muted lg:inline">{meta}</span>}
      <div className="ml-auto flex items-center gap-2">
        {right}
        {/* 08/30 리스킨 — 날짜 칩 + 데모 아바타. 페이지가 right 를 줘도 그 옆에 붙는다. */}
        <TopbarDate />
        <span className="flex size-7 items-center justify-center rounded-full bg-navy
                         text-[0.6875rem] font-bold text-on-navy" title="데모 계정">GT</span>
      </div>
    </div>
  );
}

/** 상단 바 날짜 칩 — 서버 렌더 시각 (KST 고정, 08/29 KpiStrip 과 같은 이유). */
function TopbarDate() {
  const now = new Date();
  const day = now.toLocaleString("en-US", { timeZone: "Asia/Seoul", day: "numeric" });
  const rest = `${now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", weekday: "long" })} · ${now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long" })}`;
  return (
    <span className="flex items-baseline gap-1.5 rounded-lg border border-glass-line bg-card px-2.5 py-1 shadow-card">
      <b className="tabular-nums text-[0.9375rem] font-bold text-ink">{day}</b>
      <span className="text-[0.6875rem] leading-tight text-muted">{rest}</span>
    </span>
  );
}

/* ── 심의 트레이스 한 턴 ──────────────────────────────────────────────
   심의 · 근거 검증이 공유한다. 에이전트 이름은 한국어 역할명으로 고정
   (Contract 설계자 · 전문가 페르소나 · 인사이트 분석가). 아바타 아이콘은 호출부에서 넘긴다. */
export function TraceTurn({
  who,
  icon,
  bareIcon = false,
  chips,
  time,
  children,
}: {
  who: string;
  icon?: ReactNode;
  /** 아이콘이 자기 원을 이미 그렸으면 켠다 — 네이비 원으로 한 번 더 감싸지 않는다.
   *  AI Board 회의장의 `Avatar`가 `.persona-glass` 원을 스스로 그리는데, 그것을 이
   *  래퍼가 다시 감싸 **34px 네이비 원 안에 26px tint 원**이 앉아 있었다 (08/31 정리). */
  bareIcon?: boolean;
  chips?: ReactNode;
  time?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3.5 flex gap-3">
      {bareIcon ? icon : (
        <span className="flex size-[34px] flex-none items-center justify-center rounded-full bg-navy/90 text-on-navy">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-[0.9375rem]">{who}</b>
          {chips}
          {time && <span className="mono ml-auto text-[0.75rem] text-muted">{time}</span>}
        </div>
        <div className="mt-2 text-[0.9375rem] leading-[1.7]">{children}</div>
      </div>
    </div>
  );
}

/* ── 도구 응답 원문 ───────────────────────────────────────────────────
   접힌 채로 둔다. 펼치면 손대지 않은 JSON 그대로 — 요약본을 넣지 않는다. */
export function JsonFold({
  label = "도구 응답 원문",
  meta,
  json,
}: {
  label?: string;
  meta?: string;
  json: unknown;
}) {
  const body = typeof json === "string" ? json : JSON.stringify(json, null, 2);
  return (
    <details className="mt-2.5 rounded-lg border border-glass-line bg-card">
      <summary className="mono flex items-center gap-2 px-3.5 py-2.5 text-[0.75rem] text-muted marker:content-['']">
        <span className="text-faint">▸</span>
        {label}
        {meta && <span className="ml-auto text-muted">{meta}</span>}
      </summary>
      <pre className="mono max-h-[280px] overflow-auto border-t border-line px-4 py-3 text-[0.75rem] leading-[1.7] text-body">
        {body}
      </pre>
    </details>
  );
}

/* ── 빈 자리 ──────────────────────────────────────────────────────────
   아직 안 만든 것. 점선으로 두되 오너와 날짜를 반드시 적는다. */
export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card px-5 py-5 text-[0.875rem] leading-[1.7] text-muted">
      <b className="text-navy">{title}</b>
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}
