"use client";

/**
 * 신호의 여정 — **레인 보드** (08/31 재설계, 소정 시안 · 팀장 확정).
 *
 * ## 왜 링에서 레인으로 바꿨나
 *
 * 08/30 판은 스테이션 열 칸을 사각형 링 하나에 태웠다. 그림이 예뻤지만 **사실과 다른
 * 곳이 둘** 있었다.
 *
 *  ① **현장 수집이 01「원문 적재」를 거치는 것처럼 그려졌다.** 실제로는 현장 면담에
 *     원본 파일이 없어(`document_id = None`) 01을 건너뛰고 02「블록 분리」로 바로
 *     합류한다. 01은 과거 축적분 배치 적재라 **루프를 돌지 않는다.**
 *  ② **루프 밖에서 매일 들어오는 길이 없었다.** 현장은 Board 지시가 하나도 없어도
 *     매일 돈다(루틴 방문 — 내 권역 × 미방문 경과 순). 지시는 그 위에 얹히는 층이고,
 *     둘은 «누구를 만날지»와 «무엇을 물을지»로 역할이 다르다. 링 하나로는 이 둘을
 *     그릴 자리가 없다.
 *
 * 그래서 **가로줄(레인) = 왼쪽 메뉴의 층**으로 바꾼다. 누르면 그 메뉴가 여는 화면으로
 * 간다. 실행 루프는 링이 아니라 **왼쪽 귀환 레일**이 그린다 — 09에서 사람이 승인한
 * 것만 10「수집 지시」가 되어 현장으로 내려가기 때문에, 레일은 09에서만 출발한다.
 *
 * **AE(safety) 패드는 뺐다 (08/31 팀장).** 절대 규칙 #6은 그대로다 — 개별 AE 후보는
 * 여전히 `safety_candidates` 로만 가고 어느 집계에도 안 들어간다. 보드에서 뺀 것은
 * 그 사실을 **여기서** 말하지 않기로 한 것이고, 「안전」 화면이 자기 자리에서 말한다.
 *
 * ## 점선이 글자를 뚫지 않는 방법
 *
 * 트레이스를 **스테이션 중심이 아니라 라벨의 실측 모서리**에서 출발·도착시킨다.
 * 라벨 폭은 이름·숫자 길이에 따라 달라지므로(‘Claim 추출 2,796건’ vs ‘05 가설 생성 7건’)
 * 좌표를 손으로 맞추면 데이터가 바뀔 때마다 어긋난다. 실측은 `offsetLeft/Width` 로
 * 한다 — **CSS transform 의 영향을 받지 않는 레이아웃 좌표**라 배율(scale)과 무관하다
 * (`getBoundingClientRect` 를 쓰면 축소된 값이 나와 선이 어긋난다).
 *
 * 숫자는 전부 서버 SQL 집계를 props 로 받는다 — 이 컴포넌트는 그리기만 한다 (#1).
 */

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { anchorTip } from "@/app/components/anchor";
import { STATION_ICON } from "@/app/components/icons";

// 레인 넷이 세로로 서므로 08/30 판(1136×452)보다 크다. 본문이 쓸 수 있는 폭은
// 1110px 이라 항상 축소되는데, **좌표계를 크게 잡고 통째로 줄이는 쪽**이 맞다 —
// 폭을 줄이면 라벨이 서로 부딪히고, %로 바꾸면 글자만 그대로라 좁아질수록 겹친다.
const W = 1180, H = 726;

export type BoardCounts = {
  documents: number | null;
  blocks: number | null;
  /** 구조화가 만들어 낸 claim (기각 제외) — 「잠정/공식」 두 칸이 08/30 #115로 하나가 됐다. */
  claims: number | null;
  /** 만들어진 가설 전체(RETIRED 제외) — DRAFT 만 세면 Screen 으로 넘어간 것이 빠져 0 이 뜬다. */
  hypotheses: number | null;
  /** 임계에 가까운 조합 수 — 04 「신호 축적」의 실수치 */
  nearThreshold: number | null;
  screen: number | null;
  /** 사람 관문 ① — Screen 이 끝났는데 아직 «근거를 봤다» 서명이 없는 건수 (#117).
   *  상태가 아니라 **서명 유무**로 세므로 서버가 따로 센다 (`stages.evidenceReview`). */
  evidenceReview: number | null;
  board: number | null;
  /** 사람 관문 ② 이후 — 승인·보류·기각으로 결정이 난 건수 (`stages.decided`). */
  decided: number | null;
  /** 현장 레인 (08/31) — 원본 파일 없이 들어온 면담 수와, 사람이 승인해 내려간 지시 수. */
  fieldInterviews: number | null;
  activeDirectives: number | null;
  unmappedTerms: number | null;
  topSignals: { labelKo: string; count: number; hcp: number }[];
};

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString());

/** 누가 하는 단계인가 — 색은 브랜드 두 색만 쓴다 (네이비=기계 · 오렌지=사람/현장).
 *  AI 가 **판단**하는 자리에는 ✦ 를 붙인다: 같은 «기계»라도 세는 것과 판단하는 것은
 *  다르고, 그 구분이 절대 규칙 #1 이다. */
type By = "code" | "ai" | "human" | "field" | "outside";

const TONE: Record<By, { bg: string; fg: string; ring: string; dash: boolean }> = {
  code:    { bg: "var(--fill-2)",    fg: "var(--navy)",        ring: "var(--glass-line)", dash: false },
  ai:      { bg: "var(--fill-2)",    fg: "var(--navy)",        ring: "var(--line-2)",     dash: false },
  human:   { bg: "var(--card)",      fg: "var(--orange-deep)", ring: "var(--orange-deep)", dash: true },
  field:   { bg: "var(--orange-soft)", fg: "var(--orange-deep)", ring: "transparent",     dash: false },
  outside: { bg: "var(--card)",      fg: "var(--muted)",       ring: "var(--line-2)",     dash: true },
};

function StationGlyph({ step, by }: { step: string; by: By }) {
  const tone = TONE[by];
  const Icon = STATION_ICON[step];
  if (!Icon) return null;
  return (
    <span className="relative flex size-12 items-center justify-center rounded-xl"
          style={{ background: tone.bg,
                   border: `${tone.dash ? "1.5px dashed" : "1px solid"} ${tone.ring}` }}>
      <Icon size={25} color={tone.fg} strokeWidth={1.6} />
      {by === "ai" && (
        <span aria-hidden
              className="absolute -right-1.5 -top-1.5 flex size-[19px] items-center justify-center
                         rounded-full bg-paper">
          <svg width="15" height="15" viewBox="0 0 12 12" fill="var(--orange-deep)">
            <path d="M6 0l1.1 3.4L10.5 4.5 7.1 5.6 6 9 4.9 5.6 1.5 4.5 4.9 3.4z" />
          </svg>
        </span>
      )}
    </span>
  );
}

type Tip = {
  x: number; y: number; step: string; name: string;
  body: React.ReactNode; href: string; tab: string;
};

type Node = {
  id: string; step: string; name: string; value: string;
  by: By; x: number; y: number; hot?: boolean; satellite?: boolean;
  href: string; tab: string; detail: React.ReactNode;
};

/** 스테이션 — 아이콘 패드는 라벨 **위 가운데**에 뜬다. 라벨만 레이아웃에 잡히므로
 *  트레이스 실측(offsetWidth/Height)이 곧 라벨 상자다. */
function Station({ n, onTip, onTipOut }: {
  n: Node;
  onTip: (t: Tip) => void;
  onTipOut: () => void;
}) {
  const [lift, setLift] = useState(false);
  const pin = (el: Element): Tip => ({
    ...anchorTip(el, { w: 320, h: 220, gap: 12 }),
    step: n.step, name: n.name, body: n.detail, href: n.href, tab: n.tab,
  });
  const hot = n.hot || n.by === "field";
  return (
    <Link
      href={n.href}
      id={`jb-${n.id}`}
      data-station
      aria-label={`${n.step} ${n.name} — ${n.value}. ${n.tab}`}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl outline-offset-4
                 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-navy
                 motion-reduce:transition-none motion-reduce:transform-none"
      /* 중앙 정렬은 클래스(translate 속성)에 맡기고 인라인은 **들어올림만** 쓴다 —
         Tailwind v4 는 `-translate-x-1/2` 를 `translate:` 로 내므로 인라인 transform 과
         더해져서, 08/30 에 호버 순간 자기 폭만큼 튀는 사고가 났다. */
      style={{ left: n.x, top: n.y, transform: lift ? "translateY(-2px)" : undefined,
               zIndex: lift ? 6 : undefined, willChange: "transform" }}
      onMouseEnter={(e) => { setLift(true); onTip(pin(e.currentTarget)); }}
      onMouseLeave={() => { setLift(false); onTipOut(); }}
      onFocus={(e) => { setLift(true); onTip(pin(e.currentTarget)); }}
      onBlur={() => { setLift(false); onTipOut(); }}
    >
      {!n.satellite && (
        <div className="absolute bottom-full left-1/2 mb-[7px] -translate-x-1/2">
          <div className={`rounded-xl border border-glass-line bg-card/80 p-1.5 backdrop-blur-[6px]
                           transition-shadow duration-150 ${
            lift ? "shadow-[0_5px_12px_rgba(22,38,97,0.13)]" : ""}`}>
            <StationGlyph step={n.step} by={n.by} />
          </div>
        </div>
      )}
      <div className={`flex items-center gap-[7px] whitespace-nowrap rounded-[10px] px-[9px] py-[5px] ${
        n.satellite
          ? "border border-dashed border-line-2 bg-transparent"
          : "border border-glass-line bg-card shadow-[0_3px_10px_rgba(22,38,97,0.08)]"}`}>
        <span className={`mono rounded px-1.5 py-px text-[0.6563rem] font-bold ${
          hot ? "bg-orange-deep text-on-navy" : "bg-navy/90 text-on-navy"}`}>
          {n.step}
        </span>
        <b className="text-[0.8438rem] font-semibold text-ink">{n.name}</b>
        <span className={`mono text-[0.7813rem] font-bold tabular-nums ${
          hot ? "text-orange-deep" : "text-navy"}`}>
          {n.value}
        </span>
      </div>
    </Link>
  );
}

/** 레인 = 왼쪽 메뉴의 층. `tabs` 는 그 층이 여는 화면 이름 그대로 쓴다 —
 *  보드와 메뉴가 같은 화면을 다르게 부르면 사람이 둘을 다른 것으로 읽는다. */
const LANES = [
  { id: "field",  y0: 40,  y1: 268, g: "FIELD",    s: "현장 수집",           tabs: "Field 앱 — 콘솔 메뉴 밖" },
  { id: "sense",  y0: 290, y1: 400, g: "SENSE",    s: "정제 · 구조화",       tabs: "AI Readable 전환 · 신호와 가설" },
  { id: "screen", y0: 458, y1: 568, g: "SCREEN",   s: "외부 공개 근거 대조", tabs: "다중 에이전트 검증" },
  { id: "board",  y0: 592, y1: 702, g: "AI BOARD", s: "심의 · 승인",         tabs: "심의" },
];
const BAND_X0 = 72, BAND_X1 = 1162;

export default function JourneyBoard({ c }: { c: BoardCounts }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [paths, setPaths] = useState<{ d: string; cls: string }[]>([]);
  const [tip, setTip] = useState<Tip | null>(null);

  /* 팝업 닫기를 **지연**시킨다 (08/31 팀장: "마우스가 조금만 움직여도 팝업이 사라져서
     그 안에 링크를 누를 수조차 없어"). 팝업은 스테이션 밖 12px 에 뜨므로 그쪽으로 가는
     길에 커서가 스테이션을 벗어난다 — 즉시 닫으면 도착할 방법이 없다. 200ms 는 «가만히
     있으면 닫히는 시간»이 아니라 «간격을 건너는 동안만 유지되는 시간»이다. */
  const closeT = useRef<number | null>(null);
  const holdTip = () => {
    if (closeT.current !== null) { clearTimeout(closeT.current); closeT.current = null; }
  };
  const showTip = (t: Tip) => { holdTip(); setTip(t); };
  const hideTip = () => {
    holdTip();
    closeT.current = window.setTimeout(() => { setTip(null); closeT.current = null; }, 200);
  };
  useEffect(() => holdTip, []);

  /** 배율 — 좌표계(1180px)를 통째로 줄여 가로 스크롤을 없앤다.
   *
   * **첫 값을 동기로 잰다** (08/31). ResizeObserver 만 믿으면 콜백이 한 번도 안 오는
   * 환경에서 보드가 원래 크기로 남아 가로로 삐져나간다 — 실제로 그랬다(브라우저 패널이
   * 숨겨져 있으면 rAF·RO 가 멈춘다). 관찰은 그대로 붙여 창 크기 변화를 따라가되,
   * 첫 그림은 관찰 없이도 맞게 한다. */
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // 폭 0 은 «아직 레이아웃이 없다»는 뜻이지 «0배로 그리라»가 아니다 — 전환 중
    // 숨겨진 서브트리(display:none)에서 재면 0 이 나오고, 그대로 쓰면 보드가 사라진다.
    const fit = (w: number) => { if (w > 0) setScale(Math.min(1, w / W)); };
    fit(el.clientWidth);
    const ro = new ResizeObserver(([e]) => fit(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const NODES: Node[] = [
    // ── FIELD — 루프 밖에서 매일 도는 줄 ──────────────────────────────────
    {
      id: "rt", step: "상시", name: "루틴 방문", value: "매일", by: "field",
      x: 158, y: 128, href: "/analytics?tab=kol", tab: "수집 공백 격자",
      detail: <>담당 권역에서 <b className="text-orange-bright">오래 만나지 못한 의료진</b> 순으로 오늘의 방문
        목록이 만들어집니다. 심의에서 내려온 지시가 없어도 <b className="text-orange-bright">현장 수집은 매일
        이루어집니다</b> — 데이터가 상시로 들어오는 경로입니다.</>,
    },
    {
      id: "d10", step: "10", name: "수집 지시", value: `${fmt(c.activeDirectives)}건`, by: "field",
      x: 170, y: 248, href: "/hypotheses?stage=board", tab: "AI BOARD › 심의",
      detail: <>심의에서 승인된 후속 질문이 <b className="text-orange-bright">수집 지시</b>로 내려갑니다.
        대상은 그 가설의 근거가 나온 전문과와 권역이며, 방문 전 브리핑에
        「무엇을 물을지」로 더해집니다 — <b className="text-orange-bright">별도 방문이 아니라 평소 방문에
        얹히는 항목</b>입니다. 보류나 기각으로 끝난 안건은 지시를 만들지 않습니다.</>,
    },
    {
      id: "cap", step: "현장", name: "면담 수집", value: `${fmt(c.fieldInterviews)}건`, by: "field",
      x: 492, y: 188, href: "/review/field", tab: "현장 수집분",
      detail: <>동의 확인 → 음성 전사 → 개인식별정보 가림 → 저장 순으로 진행됩니다.
        <b className="text-orange-bright"> 수집자가 그 자리에서 내용을 확인하고 보내므로</b> 별도의 승인 대기 없이
        저장됩니다.
        {" "}여기서 두 가지가 만들어집니다 — <b className="text-orange-bright">스키마에 맞춰 정리된 항목</b>과
        {" "}<b className="text-orange-bright">전사된 대화 원문</b>입니다. 원문을 함께 남기는 이유는 지금 스키마에
        담을 칸이 없는 이야기까지 보존해 두기 위한 것이고, 스키마가 넓어질 때 다시 읽어 쓰는
        재료가 됩니다.</>,
    },

    // ── SENSE ─────────────────────────────────────────────────────────────
    {
      id: "s01", step: "01", name: "원문 적재", value: `${fmt(c.documents)}건`, by: "code",
      x: 172, y: 378, href: "/pipeline", tab: "SENSE › AI Readable 전환",
      detail: <>회사에 이미 쌓여 있던 <b className="text-orange-bright">비정형 데이터 {fmt(c.documents)}건</b>입니다 —
        의료진 면담록, 방문 하이라이트, 학회 보고. 과거 축적분을 한 번에 불러오는 단계이므로
        <b className="text-orange-bright"> 이 줄은 반복되지 않습니다.</b> 매일 새로 들어오는 것은 위의 현장 수집입니다.</>,
    },
    {
      id: "s02", step: "02", name: "블록 분리", value: `${fmt(c.blocks)}블록`, by: "code",
      x: 386, y: 378, href: "/pipeline", tab: "SENSE › AI Readable 전환",
      detail: <>두 입구가 <b className="text-orange-bright">여기서 합류</b>합니다 — 과거 축적분과 현장 면담이
        같은 형태의 발언 단위로 나뉩니다. 단위마다 <b className="text-orange-bright">원문 위치</b>(어느 문서의
        몇 번째 글자인지)를 함께 기록합니다. 원문에서 짚을 수 없는 내용은 저장하지 않습니다.</>,
    },
    {
      id: "s03", step: "03", name: "Claim 추출", value: `${fmt(c.claims)}건`, by: "ai",
      x: 615, y: 378, href: "/pipeline#ai-readable", tab: "SENSE › AI Readable 전환",
      detail: <>발언을 <b className="text-orange-bright">환자군과 신호 유형</b>으로 정리해
        <b className="text-orange-bright"> 수집과 동시에</b> 그대로 적재합니다. 형식 검증에 걸린 항목의 경우
        사람이 확인합니다.</>,
    },
    {
      id: "s04", step: "04", name: "신호 축적",
      value: c.nearThreshold === null ? "SQL" : `임계 근접 ${c.nearThreshold}`, by: "code",
      x: 848, y: 378, href: "/hypotheses", tab: "SENSE › 신호와 가설",
      detail: <>환자군과 신호 유형의 조합마다 반복 횟수와 독립 의료진 수를
        <b className="text-orange-bright"> 직접 셉니다</b>. 기준은 <b className="text-orange-bright">반복 3회 이상이면서 독립
        의료진 3인 이상</b>입니다. 지시를 받아 새로 수집된 내용도
        {" "}<b className="text-orange-bright">같은 집계에 합산</b>됩니다.</>,
    },
    {
      id: "s05", step: "05", name: "가설 생성", value: `${fmt(c.hypotheses)}건`, by: "ai", hot: true,
      x: 1058, y: 378, href: "/hypotheses", tab: "SENSE › 신호와 가설",
      detail: <>기준을 넘은 신호를 토대로 <b className="text-orange-bright">AI 에이전트가 자동으로 가설을
        생성합니다</b>.</>,
    },
    {
      id: "scp", step: "구조", name: "스키마 밖 반복", value: `${fmt(c.unmappedTerms)}종`,
      by: "outside", satellite: true,
      x: 560, y: 430, href: "/contract/ontology", tab: "DATA CONTRACT › 온톨로지",
      detail: <>지금 스키마에 담을 칸이 없어 미분류로 쌓인 표현
        {" "}<b className="text-orange-bright">{fmt(c.unmappedTerms)}종</b>입니다. 같은 표현이 반복해서 쌓이면
        <b className="text-orange-bright"> 변경 심사를 거쳐 사람이 승인</b>하고 새 스키마 버전이 됩니다 —
        새 버전은 추출 기준과 <b className="text-orange-bright">현장 입력 폼</b>을 함께 바꿉니다.</>,
    },

    // ── SCREEN ────────────────────────────────────────────────────────────
    {
      id: "s06", step: "06", name: "다중 에이전트 검증", value: `${fmt(c.screen)}건`, by: "ai",
      x: 1012, y: 544, href: "/hypotheses?stage=screen", tab: "SCREEN › 다중 에이전트 검증",
      detail: <>검토 에이전트 네 곳이 <b className="text-orange-bright">PubMed · ClinicalTrials.gov · openFDA ·
        CMS Part D</b> 의 공개 근거와 대조합니다. <b className="text-orange-bright">이 단계는 판정하지
        않습니다</b> — 지지와 반대 근거를 모아 놓을 뿐이고, 읽고
        {" "}<b className="text-orange-bright">올릴지 정하는 것은 사람</b>입니다.</>,
    },
    {
      id: "s07", step: "07", name: "근거 검토", value: `${fmt(c.evidenceReview)}건`, by: "human", hot: true,
      x: 790, y: 544, href: "/hypotheses?stage=screen", tab: "SCREEN › 다중 에이전트 검증",
      detail: <><b className="text-orange-bright">사람이 판단하는 첫 번째 지점</b>입니다. 앞 단계가 모은 외부
        근거를 사람이 직접 읽고 <b className="text-orange-bright">「직접 검토했습니다」에 서명</b>해야 심의로
        넘어갑니다 — 지지 근거가 많아도 아무도 읽지 않았으면 올라가지 않고, 반대가 많아도
        읽은 사람의 판단으로 올릴 수 있습니다.</>,
    },

    // ── AI BOARD ──────────────────────────────────────────────────────────
    {
      id: "s08", step: "08", name: "심의", value: `${fmt(c.board)}건`, by: "ai",
      x: 634, y: 678, href: "/hypotheses?stage=board", tab: "AI BOARD › 심의",
      detail: <>AI 이사회가 찬반을 심의하고 CEO 역할이 권고안을 냅니다. 모든 판단에는
        <b className="text-orange-bright"> 원문 또는 외부 근거 인용</b>이 따릅니다 — 여기까지는 AI 의 해석과
        제안이며, <b className="text-orange-bright">아직 승인된 실행이 아닙니다.</b></>,
    },
    {
      id: "s09", step: "09", name: "사람 결정", value: `${fmt(c.decided)}건`, by: "human", hot: true,
      x: 450, y: 678, href: "/hypotheses?stage=board", tab: "AI BOARD › 심의",
      detail: <><b className="text-orange-bright">사람이 판단하는 두 번째 지점</b>입니다. 승인·보류·기각을
        정하는 것은 사람이고, CEO 권고는 참고 표시입니다. <b className="text-orange-bright">승인하는 순간 후속
        질문이 「수집 지시」가 되어 현장으로 내려갑니다</b>.</>,
    },
  ];

  /* ── 트레이스 ─────────────────────────────────────────────────────────
     라벨의 **실측 모서리**에서 출발·도착시킨다. `offsetLeft/Width` 는 CSS transform
     의 영향을 받지 않는 레이아웃 좌표라 배율과 무관하다 — `getBoundingClientRect` 를
     쓰면 축소된 값이 나와 선이 어긋난다. 라벨 폭은 숫자 길이에 따라 달라지므로
     (「Claim 추출 2,796건」 vs 「05 가설 생성 7건」) 손으로 맞추면 데이터가 바뀔 때마다
     다시 어긋난다. */
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const R: Record<string, { l: number; r: number; t: number; b: number; cx: number; cy: number }> = {};
    for (const n of NODES) {
      const el = board.querySelector<HTMLElement>(`#jb-${n.id}`);
      if (!el) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      R[n.id] = { l: n.x - w / 2, r: n.x + w / 2, t: n.y - h / 2, b: n.y + h / 2, cx: n.x, cy: n.y };
    }

    const MERGE_X = 372;   // 상시·지시 두 갈래가 만나는 x
    const RAIL_X  = 38;    // 실행 루프 귀환 레일
    const WRAP_X  = 1148;  // 05 → 06 서펜타인 회전
    const FORK_Y  = 404;   // 03 아래 분기선 (SCP)
    // 구조 루프가 02 로 되돌아오는 x — **SCREEN 이름표 오른쪽 끝(≈330)보다 뒤**여야
    // 가로 구간이 그 글자를 지나지 않는다 (08/31).
    const SCP_X   = 420;

    const out: { d: string; cls: string }[] = [];
    const add = (d: string, cls: string) => out.push({ d, cls });

    // ① 상시 루틴 → 면담 수집 (루프 밖 — 회색 파선)
    add(`M${R.rt.r},${R.rt.cy} H${MERGE_X} V${R.cap.cy} H${R.cap.l}`, "routine");
    // ② 10 수집 지시 → 면담 수집 (실행 루프 — 오렌지)
    add(`M${R.d10.r},${R.d10.cy} H${MERGE_X} V${R.cap.cy} H${R.cap.l}`, "ring");
    // ③ 면담 수집 → 02 (01 을 건너뛴다 — 원본 파일이 없다)
    //
    // **꺾는 자리는 SENSE 레인 «안»이다 (08/31).** 처음에는 두 레인 사이 빈 구간
    // (y=276)에서 왼쪽으로 꺾었는데, 거기가 하필 SENSE 이름표 줄이라 점선이
    // 「AI Readable 전환 · 신호와 가설」 글자를 가로질렀다. 레인 안으로 내려와서
    // 꺾으면 이름표 아래를 지나므로 무엇을 적든 안 겹친다.
    add(`M${R.cap.cx},${R.cap.b} V${R.s02.t - 16} H${R.s02.cx} V${R.s02.t}`, "ring");
    // ④ 01 → 02 (배치 — 루프 밖)
    add(`M${R.s01.r},${R.s01.cy} H${R.s02.l}`, "batch");
    // ⑤ SENSE 가로
    add(`M${R.s02.r},${R.s02.cy} H${R.s03.l}`, "ring");
    add(`M${R.s03.r},${R.s03.cy} H${R.s04.l}`, "ring");
    add(`M${R.s04.r},${R.s04.cy} H${R.s05.l}`, "ring");
    // ⑥ 05 → 06 (서펜타인 회전)
    add(`M${R.s05.cx},${R.s05.b} V${FORK_Y + 16} H${WRAP_X} V${R.s06.cy} H${R.s06.r}`, "ring");
    // ⑦ SCREEN 가로 → AI BOARD
    add(`M${R.s06.l},${R.s06.cy} H${R.s07.r}`, "ring");
    add(`M${R.s07.l},${R.s07.cy} H${R.s08.r} V${R.s08.cy}`, "ring");
    add(`M${R.s08.l},${R.s08.cy} H${R.s09.r}`, "ring");
    // ⑧ 귀환 레일 — 09 에서만 출발한다 (승인만 현장으로 내려간다)
    add(`M${R.s09.l},${R.s09.cy} H${RAIL_X} V${R.d10.cy} H${R.d10.l}`, "ring");
    // ⑨ 구조 루프 — 03 → SCP → 02
    add(`M${R.s03.cx - 48},${R.s03.b} V${R.scp.t}`, "chord");
    add(`M${R.scp.l},${R.scp.cy} H${SCP_X} V${R.s02.b}`, "chord");

    setPaths(out);
    // 값이 바뀌면 라벨 폭이 달라진다 — 그때 다시 잰다
  }, [c.documents, c.blocks, c.claims, c.hypotheses, c.nearThreshold, c.screen,
      c.evidenceReview, c.board, c.decided, c.fieldInterviews, c.activeDirectives,
      c.unmappedTerms]);   // eslint-disable-line react-hooks/exhaustive-deps

  const STROKE: Record<string, React.SVGProps<SVGPathElement>> = {
    ring:    { stroke: "var(--orange)", strokeWidth: 2.4, strokeDasharray: "2 6", className: "jb-ring" },
    routine: { stroke: "var(--muted)", strokeWidth: 2, strokeDasharray: "6 4", opacity: 0.75, className: "jb-rt" },
    // 08/31 #120 규약 — **색이 «누가 도는가», 대시가 «얼마나 자주»**를 말한다.
    // 최초 적재는 네이비(구조 쪽)이면서 긴 대시(한 번), 상시 루틴은 회색(루프 밖)이면서
    // 중간 대시(매일). 범례의 견본 넷이 이 값과 1:1로 맞아야 한다.
    batch:   { stroke: "var(--navy)", strokeWidth: 2, strokeDasharray: "7 5", opacity: 0.6 },
    chord:   { stroke: "var(--navy)", strokeWidth: 1.8, strokeDasharray: "2 5", opacity: 0.7, className: "jb-chord" },
  };

  return (
    <div ref={wrapRef} style={{ height: H * scale }}>
      <div ref={boardRef} className="relative" style={{
             width: W, height: H,
             transform: scale === 1 ? undefined : `scale(${scale})`,
             transformOrigin: "top left",
           }}>
        {/* PCB 도트 그리드 */}
        <div className="absolute inset-0 rounded-2xl border border-glass-line"
             style={{
               backgroundImage: "radial-gradient(rgba(22,38,97,0.09) 1.1px, transparent 1.1px)",
               backgroundSize: "22px 22px",
               backgroundColor: "var(--fill-1)",
             }} />

        {/* 레인 띠 — 트레이스보다 **먼저** 칠한다 (선이 띠 위에 얹히게) */}
        {LANES.map((L) => (
          <div key={`band-${L.id}`} className="absolute rounded-xl border border-line/60 bg-card/45"
               style={{ left: BAND_X0, top: L.y0, width: BAND_X1 - BAND_X0, height: L.y1 - L.y0 }} />
        ))}

        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 overflow-visible" aria-hidden>
          <style>{`
            /* 이동량은 대시 주기의 정수배여야 한 바퀴 끝에서 패턴이 제자리로 돌아온다 —
               아니면 이음매에서 툭 끊긴다 (08/30 실사고). ring 2+6=8 · chord 2+5=7 ·
               routine 6+4=10 이므로 -24 · -21 · -20. */
            @keyframes jb-ring  { to { stroke-dashoffset: -24; } }
            @keyframes jb-chord { to { stroke-dashoffset: -21; } }
            @keyframes jb-rt    { to { stroke-dashoffset: -20; } }
            .jb-ring  { animation: jb-ring  2.6s linear infinite; }
            .jb-chord { animation: jb-chord 3.2s linear infinite; }
            .jb-rt    { animation: jb-rt    3.6s linear infinite; }
            @media (prefers-reduced-motion: reduce) {
              .jb-ring, .jb-chord, .jb-rt { animation: none; }
            }
          `}</style>
          {paths.map((p, i) => (
            <path key={i} d={p.d} fill="none" strokeLinecap="round" {...STROKE[p.cls]} />
          ))}
        </svg>

        {/* 레인 이름표 — **트레이스 뒤에** 둔다. DOM 순서가 곧 칠하는 순서라, svg 가
            뒤에 있으면 점선이 글자를 뚫는다 (08/31 팀장 지적). 여기에 더해 바탕을 깔아
            선이 지나가도 글자가 읽히게 한다 — 좌표가 바뀌어도 안 깨지는 쪽이다. */}
        {LANES.map((L) => (
          <div key={`lab-${L.id}`}
               className="absolute flex items-baseline gap-2 whitespace-nowrap rounded-md bg-paper px-2 py-0.5"
               style={{ left: BAND_X0 + 12, top: L.y0 - 21 }}>
            <span className="text-[0.75rem] font-extrabold tracking-[0.13em] text-ink">{L.g}</span>
            <span className="text-[0.6875rem] text-faint">· {L.s}</span>
            <span className="text-[0.6563rem] font-semibold text-orange-deep">→ {L.tabs}</span>
          </div>
        ))}

        {/* 두 갈래가 각각 무엇을 정하는가 — 이름이 방향을 말하게 한다 */}
        <div className="absolute -translate-y-1/2 rounded-md bg-paper px-1.5 text-[0.6875rem] text-muted"
             style={{ left: 314, top: 128 }}>누구를 만날지</div>
        <div className="absolute -translate-y-1/2 rounded-md bg-paper px-1.5 text-[0.6875rem] font-semibold text-orange-deep"
             style={{ left: 320, top: 248 }}>무엇을 물을지</div>
        {/* 귀환 레일이 이 글자를 지나므로 바탕을 깐다 — 흐름 라벨 셋 다 같은 규약이다. */}
        <div className="absolute whitespace-nowrap rounded-md bg-paper px-1.5 text-[0.6875rem]
                        font-semibold tracking-[0.08em] text-orange-deep"
             style={{ left: 38, top: 472, transform: "translate(-50%,-50%) rotate(-90deg)" }}>실행 루프</div>

        {/* 08/31 팀장: 여기 있던 「승인만 현장으로 내려갑니다」 메모를 뺐다. 내용(보류·기각은
            지시를 만들지 않아 레일이 09 에서만 출발한다)은 **09 스테이션 팝업**이 이미 말하고,
            보드 아래 「실행 루프」 범례도 같은 말을 한다 — 그림 위에 문단이 얹혀 있을 이유가 없다. */}

        {NODES.map((n) => (
          <Station key={n.id} n={n} onTip={showTip} onTipOut={hideTip} />
        ))}
      </div>

      {/* 팝업은 **배율 밖**에 둔다 (08/30 실사고) — 조상에 transform 이 있으면
          `position: fixed` 의 기준이 뷰포트가 아니라 그 조상이 되고 좌표에 배율까지
          곱해져, 화면이 좁아 scale<1 이 되는 순간 팝업이 통째로 어긋난다. */}
      {tip && (
        <div /* 커서를 받는다 — 안의 링크를 누를 수 있어야 한다 (08/31) */
             onMouseEnter={holdTip}
             onMouseLeave={hideTip}
             className="tip-glass fixed z-50 max-w-[330px] break-keep rounded-2xl
                        px-3.5 py-2.5 text-[0.75rem] leading-[1.7] text-on-navy"
             style={{ left: tip.x, top: tip.y }}>
          <div className="mb-1.5 flex items-baseline gap-1.5">
            <span className="mono rounded bg-white/20 px-1 py-px text-[0.625rem] font-bold">{tip.step}</span>
            <b className="text-[0.8125rem]">{tip.name}</b>
          </div>
          {tip.body}
          {/* 꼬리말이 실제 링크다 — 「눌러서 이동」이라고만 적혀 있으면 팝업에 도착한
              커서가 누를 데가 없다. 어디로 가는지도 이름으로 말한다. */}
          <Link href={tip.href}
                className="mt-2 flex items-baseline gap-1.5 border-t border-white/15 pt-1.5
                           font-medium text-orange-bright underline underline-offset-[3px]">
            {tip.tab} 열기 →
          </Link>
        </div>
      )}
    </div>
  );
}
