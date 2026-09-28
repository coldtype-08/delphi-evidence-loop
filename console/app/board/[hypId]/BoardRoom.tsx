"use client";

/**
 * AI Board 회의장 (08/27 재구축 — 새 테마 문법으로 다시 씀).
 *
 * 심의는 서버 스레드가 돌고(폴링 계약: docs/04 §4 · 설계 §5), 이 화면은 회의록을
 * **대화가 벌어지는 속도로 재생**한다. 이미 끝난 회의도 처음 열람은 연출 재생이고,
 * 급하면 "전체 보기"로 즉시 펼친다. 판정은 AI 권고일 뿐이고, 그 판정을 가설 상태로
 * 기록하는 것은 아래 [액션 결정] 패널뿐이다 (HITL — 절대 규칙 #8의 Board 구현).
 *
 * 색은 네이비·오렌지 둘뿐이다. 입장(stance)·단계·5단계 구분은 색상환이 아니라
 * **모노 라벨 + 점의 채도**로 가른다. 오렌지는 이 화면에서 딱 두 곳에만 쓴다 —
 * 지금 진행 중인 단계와 [액션 결정] 패널("사람이 결정할 차례"라는 기존 관례).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, PauseCircle, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  Panel, Eyebrow, SectionHead, Chip, Fold, Topbar,
  TableFrame, TH, TD, Quote, TraceTurn, FIELD, } from "@/app/components/ui";
import { PERSONA_ICON } from "@/app/components/icons";
import HandoffBar from "@/app/hypotheses/HandoffBar";

const cx = (...v: (string | false | null | undefined)[]) => v.filter(Boolean).join(" ");

/** [로컬 확인용 — 커밋하지 않는다] 현장 지시를 받을 권역 (docs/02 §1의 4값). */
const REGIONS = ["NORTHEAST", "MIDWEST", "SOUTH", "WEST"] as const;

// ── 타입 (계약: 설계 §5 스냅샷 · §6 엔드포인트 — 백엔드 _minute_payload와 1:1) ──

type Stance = "SUPPORT" | "HOLD" | "OPPOSE";

type ActionProposal = {
  actionKo: string; target?: string | null;
  ownerRole?: string | null; timelineKo?: string | null;
};
type Correction = { persona: string; claimedKo: string; correctionKo: string; sourceKo: string };
type CeoArgument = { persona: string; argumentKo: string; whyKo: string };
type Directive = {
  persona?: string; directiveKo: string; deadlineKo?: string | null;
  target: string; ownerRole: string;
};
type CloseMinutes = {
  hypothesisKo: string; aiRecommendation: string; summaryKo: string;
  stanceEvolution?: { persona: string; from: string; to: string; reasonKo: string }[];
  actionItems?: { actionKo: string; ownerRole?: string; deadlineKo?: string;
                  sourceKo: string; target: string }[];
  groundingEventsKo?: string[]; killCriteriaKo: string[]; nextReviewTriggerKo: string;
};
type Meta = {
  inquiryDeferred?: boolean;
  // CONVENE
  hypothesisType?: string; secondaryTypes?: string[]; speakingOrder?: string[];
  urgency?: string; leadExpert?: string; convenedPersonas?: string[];
  relatedHistoryNoteKo?: string | null;
  // FACILITATE
  groundingCorrections?: Correction[]; identifiedTensionsKo?: string[]; phaseDecision?: string;
  // DISCUSSION(간사의 지목 질문) · 전문가 공통
  directedQuestionKo?: string;
  actionProposal?: ActionProposal | null; inquiryToOrchestrator?: string | null;
  // ANSWER
  answerable?: boolean; sourceKo?: string;
  // CEO DECISION
  decision?: string; adoptedArguments?: CeoArgument[]; rejectedArguments?: CeoArgument[];
  leadAlignment?: string; leadOverrideReasonKo?: string | null;
  conditionsKo?: string[]; killCriteriaKo?: string[]; directives?: Directive[];
  // CLOSE
  minutes?: CloseMinutes;
};
type Minute = {
  seq: number; persona: string; personaLabelKo: string; turnType: string; phaseNo: number | null;
  utteranceKo: string | null; stance: Stance | null; stanceChanged: boolean | null;
  confidence: number | null; keyPointKo: string | null; llmRunId: number | null;
  meta: Meta | null;
};
type BoardEvent = {
  seq: number; ts: string | null; kind: string;
  phaseNo?: number | null; messageKo?: string | null; minute?: Minute | null;
};
type StanceTally = {
  counts: { SUPPORT: number; HOLD: number; OPPOSE: number };
  weights?: Record<string, number>;
  leadExpert?: string | null; leadStance?: string | null;
  computedBy?: string; ruleKo?: string;
};

type Snapshot = {
  running: boolean; hypothesisId: string | null; runId: string | null;
  startedAt: string | null; finishedAt: string | null;
  phaseNo: number | null; urgency: string | null; hypothesisType: string | null;
  leadExpert: string | null; convenedPersonas: string[]; speakingOrder: string[];
  awaitingVerdict?: boolean; recommendedDecision?: string | null; stanceTally?: StanceTally | null;
  answerCount: number; totals: { llmCalls: number; cacheHits: number };
  events: BoardEvent[]; lastSeq: number;
  /* 회의록 머리말 (08/28 회의 엔진). 전부 선택 필드다 — 값이 없으면 그 줄을 그리지 않는다:
     회의록에 지어낸 칸이 하나라도 있으면 나머지 값도 못 믿게 된다 (절대 규칙 #1). */
  meetingNo?: string | null;
  convenedAtKst?: string | null;
  closedAtKst?: string | null;
  roundNo?: number | null;
  quorumOk?: boolean | null;
  notConvened?: string[] | null;
  leadRationaleKo?: string | null;
};
type DecisionRow = {
  decision: string; decidedBy: string; rationaleKo: string | null; decidedAt: string;
};
/** 채택돼 적재된 액션 한 줄 — 백엔드 `_action_row`와 1:1 (docs/04 §4). */
type ActionRow = {
  actionItemId: string; directiveKo: string; target: string; ownerRole: string;
  status: string;
  /** 쉼표로 구분한 전문과 목록. null이면 대상 조건 없음 = 전 방문 공통 (08/28) */
  targetSpecialty: string | null;
  collectedClaimCount: number | null; deliveredAt: string | null;
};
type Card = {
  id: string; titleKo: string; kind: "IN_LABEL" | "DEVELOPMENT"; status: string;
  patientSegment: string; commercialActionBlocked: boolean;
  notBoardReadyReason: string | null;
  driverSummaryKo?: string | null;
  aggregate?: { claimCount?: number; distinctHcp?: number; distinctRegions?: number } | null;
  decisions?: DecisionRow[];
  approvedActions?: ActionRow[];
};

// ── 표시 상수 (페르소나 표는 설계 §1 — 전 층 공통) ───────────────────────────

/* 역할 색 — **누가 말하는가**만 가른다. 판단 정보(입장·5단계 구분)는 아래 STANCE·
   LEGEND가 쥐고 있고 여기 색은 거기 끼어들지 않는다. 그래서 채도를 낮췄다(S 25~30%):
   원색으로 8명을 칠하면 화면이 알록달록해져 정작 색이 뜻을 갖는 자리(오렌지=사람이
   결정할 차례)가 묻힌다. 간사는 네이비(진행자), CEO는 오렌지(판정자)로 남긴다. */
const PERSONA: Record<string, { short: string; label: string; tint: string; roleKo: string }> = {
  ORCHESTRATOR: { short: "간사", label: "보드 간사", tint: "#162661", roleKo: "진행" },
  CMO: { short: "CMO", label: "CMO · 최고의학책임자", tint: "#5E7A63", roleKo: "의학" },
  RA_HEAD: { short: "RA", label: "RA 총괄 · 규제업무", tint: "#5A6B8C", roleKo: "규제" },
  PV_HEAD: { short: "PV", label: "PV 총괄 · 약물감시", tint: "#8C5A5A", roleKo: "안전성" },
  CCO: { short: "CCO", label: "CCO · 최고사업책임자", tint: "#9A6A55", roleKo: "상업" },
  CFO: { short: "CFO", label: "CFO · 최고재무책임자", tint: "#8A7A45", roleKo: "재무" },
  CLO: { short: "CLO", label: "CLO · 법무·지식재산", tint: "#7A5E80", roleKo: "법무·IP" },
  RND_HEAD: { short: "R&D", label: "R&D 총괄 · 연구개발", tint: "#4E7B7B", roleKo: "개발" },
  BD_HEAD: { short: "BD", label: "BD 총괄 · 사업개발", tint: "#8C7A5C", roleKo: "사업개발" },
  CEO: { short: "CEO", label: "CEO", tint: "#EF8B1C", roleKo: "판정" },
};
const pTint = (p: string) => PERSONA[p]?.tint ?? "#162661";
const pLabel = (p: string) => PERSONA[p]?.label ?? p;

/* 입장 = 신호등 (08/27 팀장 지적: "처음 보는 사람은 지지인지 반대인지가 눈에 안 띈다").
   방향은 색으로 가른다 — 초록 지지 · 호박 보류 · 적갈 반대. 신호 **강도**는 여전히
   색으로 가르지 않는다(확신도 점의 채도). 여기서 색이 뜻하는 것은 세기가 아니라 방향이다
   (DECISIONS 08/27 #196과 같은 판단). */
const STANCE: Record<Stance, {
  ko: string; variant: "support" | "hold" | "oppose"; dot: string; icon: React.ReactNode;
}> = {
  SUPPORT: { ko: "지지", variant: "support", dot: "bg-stance-support",
             icon: <ThumbsUp strokeWidth={2.2} /> },
  HOLD: { ko: "보류", variant: "hold", dot: "bg-stance-hold",
          icon: <PauseCircle strokeWidth={2.2} /> },
  OPPOSE: { ko: "반대", variant: "oppose", dot: "bg-stance-oppose",
            icon: <ThumbsDown strokeWidth={2.2} /> },
};

const HYPTYPE_KO: Record<string, string> = {
  INDICATION_EXPANSION: "적응증 확장", AGE_EXPANSION: "연령 확대",
  COMBINATION_THERAPY: "병용 요법", MARKET_EXPANSION: "시장 확장",
  SAFETY_SIGNAL: "안전성 신호", OTHER: "미분류",
};

// CEO 판정 표기 — GO 계열은 사람에게 "승인 권고"로 매핑된다 (설계 §0-7)
/* 버튼에 쓰는 말 — 사람이 **내리는 판정**이다. REC_KO("보류 권고")를 버튼에 그대로 쓰면
   사람이 AI의 권고를 누르는 그림이 되어 판단의 주체가 흐려진다. */
const VERDICT_KO: Record<string, string> = {
  GO: "추진", CONDITIONAL_GO: "조건부 추진", HOLD: "보류", NO_GO: "기각",
};
const REC_KO: Record<string, string> = {
  GO: "추진 권고", CONDITIONAL_GO: "조건부 추진 권고", HOLD: "보류 권고", NO_GO: "기각 권고",
};
/* 의장 판정 → 가설 상태. 같은 사람에게 같은 질문을 두 번 하지 않으려고 **코드가 쥔** 매핑이다
   (08/28 팀장 지적: "보류로 결정된 건인데 승인·보류·기각이 다 있어 혼란스럽다").
   판정은 회의의 결론이고 상태는 그 결론의 기록이므로, 사람이 다시 고를 일이 아니다. */
const VERDICT_TO_STATUS: Record<string, "APPROVED" | "HOLD" | "REJECTED"> = {
  GO: "APPROVED", CONDITIONAL_GO: "APPROVED", HOLD: "HOLD", NO_GO: "REJECTED",
};

const ORCH_LABEL: Record<string, string> = {
  CONVENE: "개회", FACILITATE: "진행", ANSWER: "답변", SYSTEM: "안내", CLOSE: "폐회",
};
const EXPERT_TURN_KO: Record<string, string> = {
  OPENING: "모두발언", DISCUSSION: "토론", FINAL: "최종 입장",
};

const TARGET_KO: Record<string, string> = {
  FIELD_CHECKLIST: "현장 수집 체크리스트",
  SPECIALIST_REVIEW: "전문조직 검토",
  MEDINFO_RESPONSE: "의학정보 대응",
};
const OWNER_KO: Record<string, string> = {
  MEDICAL_AFFAIRS: "메디컬 어페어", CLINICAL_STRATEGY: "임상 전략",
};

const DECISION_KO: Record<string, string> = {
  APPROVED: "승인", HOLD: "보류", REJECTED: "기각",
};
/** 기록 버튼 문구 — 조사(로/으로)가 갈려 사전으로 둔다 */
const RECORD_KO: Record<string, string> = {
  APPROVED: "승인으로 기록", HOLD: "보류로 기록", REJECTED: "기각으로 기록",
};

/* 기각의 다음 걸음 — `HUMAN_TRANSITIONS` 의 REJECTED 행 두 줄과 1:1이다
   (docs/01 §3 · `POST /hypotheses/transition`). 화면이 없는 전이를 지어내지 않도록
   `to` 값은 서버 표에 있는 문자열 그대로 쓴다. */
const REJECT_NEXT: Record<"SCREEN_QUEUED" | "DRAFT" | "NONE", {
  to: string | null; ko: string; btnKo: string; noteKo: string;
}> = {
  SCREEN_QUEUED: {
    to: "SCREEN_QUEUED", ko: "Screen", btnKo: "Screen으로 되돌리기",
    noteKo: "외부 근거를 다시 쌓습니다 — 교차검증을 새로 돌리고, 새 근거를 읽은 사람이 다시 서명해야 심의로 올라옵니다.",
  },
  DRAFT: {
    to: "DRAFT", ko: "Sense", btnKo: "Sense로 되돌리기",
    noteKo: "가설 자체를 다시 봅니다 — 신호가 더 쌓이면 Screen부터 다시 시작합니다.",
  },
  NONE: {
    to: null, ko: "", btnKo: "되돌리지 않고 종료",
    noteKo: "기각으로 닫아 둡니다 — 나중에 가설 목록에서 되돌릴 수 있습니다.",
  },
};

/** 전문과 코드 → 사람이 읽는 말 (apps/field/directory와 같은 사전 — 없는 코드는 그대로 둔다).
 *  값이 null이면 대상 조건이 없다는 뜻이고, 그건 "전 방문 공통"이다 (docs/04 §6). */
const SPECIALTY_KO: Record<string, string> = {
  NEUROLOGY: "신경과", EPILEPTOLOGY: "뇌전증",
  PSYCHIATRY: "정신건강의학과", GENERAL: "일반의",
};
const specialtyKo = (v: string | null | undefined) =>
  (v ? v.split(",").map((x) => SPECIALTY_KO[x.trim()] ?? x.trim()).join(" · ") : "전 방문 공통");

/* 5단계 구분 (절대 규칙 #8) — docs/05의 다섯 색은 이 테마에서 무효다.
   두 색 + 채도로 다시 그린다: 관찰→해석이 옅어지는 네이비 계단, 사람이 손대는
   두 층(제안·실행)만 오렌지. "AI가 말한 것"과 "사람이 정한 것"의 경계가 색으로 보인다. */
const LEGEND: [string, string][] = [
  ["관찰된 사실", "bg-navy"],
  ["통계적 패턴", "bg-navy/55"],
  ["AI의 해석", "bg-navy/25"],
  ["전략적 제안", "bg-orange/55"],
  ["승인된 실행", "bg-orange"],
];

const PHASE_STEPS = ["개회", "모두발언", "쟁점 토론", "최종 입장", "판정", "폐회"];
/* 단계마다 무엇을 하는 자리인지 한 줄 — 처음 보는 사람이 회의를 따라올 수 있게 */
const PHASE_NOTE: Record<number, string> = {
  0: "안건 상정 · 참석자 소집",
  1: "각자의 렌즈로 첫 입장",
  2: "간사가 쟁점을 지목하고 당사자가 답한다",
  3: "입장을 확정한다 (바뀌었으면 이유와 함께)",
  4: "사람이 판정하고 CEO가 근거를 세운다",
  5: "회의록 · 액션 초안",
  6: "의장 판정을 기록하고 후속 액션을 확정한다",
};

const errText = (e: unknown) => (e instanceof ApiError ? `${e.code} — ${e.message}` : String(e));

/** 접을 것이 있는 턴인가 — 요지가 따로 있거나, 문단이 둘 이상인 긴 발언 (08/31).
 *  [요지만 보기]가 세는 수와 각 카드에 손잡이가 뜨는 조건이 **같은 함수**여야 한다:
 *  화면이 「12건」이라고 말하고 실제로 접히는 것이 9건이면 그 숫자를 다시 안 믿게 된다. */
function foldableTurn(m: Minute): boolean {
  const text = m.utteranceKo ?? "";
  if (m.turnType === "ANSWER") return false;
  if (m.turnType === "CLOSE") return !!m.meta?.minutes?.summaryKo;
  if (m.turnType === "DECISION") return paragraphs(text).length > 1;
  if (m.persona === "ORCHESTRATOR" || m.turnType === "SYSTEM") {
    return text.length > 220 && paragraphs(text).length > 1;
  }
  return !!m.keyPointKo;
}

const stamp = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ko-KR", { hour12: false });
};

// ── 소품 ─────────────────────────────────────────────────────────────────────

/** 참석자 아이콘 원 — 색면 하나가 "행위자 한 명"이라는 이 화면 체계의 뜻이다.
 *
 *  08/31 두 곳을 바꿨다.
 *  ① **아이콘을 `icons.tsx`의 `PERSONA_ICON`에서 가져온다.** 그전까지 이 파일이 9인의
 *     SVG path를 직접 그려 들고 있었는데, 08/30 지시("직접 그리지 말고 Untitled UI에서
 *     골라")를 이 화면만 안 따른 자리였다.
 *  ② **재질을 `.persona-glass`로 올렸다** (globals.css `@layer components`). 채도를 낮춘
 *     8색을 평면 색면으로 쓰면 「톤다운」이 아니라 그냥 탁해 보인다 — 색은 그대로 두고
 *     그라데이션·하이라이트만 얹는다. tint는 `--tint`로 넘기고 그라데이션 문자열은
 *     클래스가 쥔다 (docs/05 §0.5 — 글래스 재질은 이름 붙인 클래스가 정한다).
 *  CEO만 오렌지 + 네이비 글자. tint를 145° 2스톱으로 펴면 그 오렌지가 홈 대시보드 막대와
 *  사실상 같은 그라데이션이 된다 (#F5A542 → #C86F0C).
 */
function Avatar({ persona, size = "md", ring = false }: {
  persona: string; size?: "sm" | "md"; ring?: boolean;
}) {
  const ceo = persona === "CEO";
  const Glyph = PERSONA_ICON[persona];
  return (
    <span
      title={`${pLabel(persona)} — ${PERSONA[persona]?.roleKo ?? ""}`}
      style={{ "--tint": pTint(persona) } as React.CSSProperties}
      className={cx(
        "persona-glass flex flex-none items-center justify-center rounded-full transition-shadow",
        ring && "persona-glass-ring",
        size === "md" ? "size-[34px]" : "size-[26px]",
        ceo ? "text-navy" : "text-on-navy",
      )}
    >
      {Glyph ? (
        <Glyph
          size={size === "md" ? 18 : 14}
          strokeWidth={size === "md" ? 1.9 : 2.1}
          aria-hidden
        />
      ) : (
        <span aria-hidden className="size-2 rounded-full bg-current" />
      )}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-1 px-1 py-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-[5px] rounded-full bg-navy/45 motion-safe:animate-[typing-dot_1.1s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function StanceTag({ stance, size = "default" }: {
  stance: Stance | null; size?: "sm" | "default" | "lg";
}) {
  if (!stance) return null;
  const s = STANCE[stance];
  return (
    <Badge variant={s.variant} size={size}>
      {s.icon}
      {s.ko}
    </Badge>
  );
}

/** 작은 모노 태그 — Chip 보다 한 단계 조용한 자리(발언 머리줄)에 쓴다. */
function Tag({ children, tone = "quiet" }: { children: React.ReactNode; tone?: "quiet" | "mark" }) {
  return (
    <span
      className={cx(
        "mono whitespace-nowrap rounded-lg border px-2 py-0.5 text-[0.75rem]",
        tone === "mark"
          ? "border-line bg-fill-1 text-navy"
          : "border-line bg-card text-faint",
      )}
    >
      {children}
    </span>
  );
}

/** 발언 전문 토글 — 조용하되 **찾을 수 있어야** 한다 (08/28 팀장: "더 눈에 띄게, 색은 넣지 말고").
 *
 *  색으로 끌지 않는다: 이 화면에서 색이 뜻을 갖는 자리는 오렌지(사람이 결정할 차례) 하나뿐이라
 *  읽기 보조 장치에 색을 쓰면 그 뜻이 묽어진다. 대신 테두리 있는 pill로 키우고 hover·focus를 준다.
 *  글자수는 뺐다 — 몇 자인지는 "열어 볼까"의 판단에 쓰이지 않는 숫자였다.
 *
 *  **08/31: `<details>`에서 제어 버튼으로 바꿨다.** 그전에는 열림 상태를 브라우저가 쥐었다 —
 *  「타이핑이 끝나면 요약으로 접힌다」가 규칙이었으니 그래도 됐다. 지금은 접는 것이 사람의
 *  행위이므로(읽던 문장이 스스로 사라지지 않는다) 상태가 화면 쪽에 있어야 한다: [지난 발언
 *  접기] 하나로 여러 턴을 함께 접고, 접히는 순간 스크롤을 같은 자리에 붙들기 위해서다. */
function FoldPill({ open, onToggle, openLabel = "접기", closedLabel = "발언 전문 보기",
                   onNavy = false, className }: {
  open: boolean;
  onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
  openLabel?: string; closedLabel?: string; onNavy?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cx(
        "mono inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.8125rem] transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        onNavy
          ? "border-on-navy-line text-on-navy hover:bg-on-navy-3 focus-visible:outline-[rgba(252,252,250,.55)]"
          : "border-line text-body hover:border-line-2 hover:bg-fill-1 hover:text-navy focus-visible:outline-navy/40",
        className ?? "mt-2",
      )}
    >
      <span aria-hidden className={cx("text-[0.75rem] transition-transform", open && "rotate-90")}>▸</span>
      {open ? openLabel : closedLabel}
    </button>
  );
}

/** 확신도 — 발언자 자기 평가다. 채운 점은 네이비, 빈 점은 네이비 12%. */
function ConfidenceDots({ n }: { n: number | null }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-1" title={`확신도 ${n}/5 — 발언자 자기 평가`}>
      <span className="mono text-[0.75rem] uppercase tracking-[0.14em] text-faint">확신도</span>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cx("size-[6px] rounded-full", i <= n ? "bg-navy/80" : "bg-fill-2")} />
      ))}
    </span>
  );
}

/** 긴 발언을 문단으로 가른다 — 한 덩어리 글은 회의록이 아니라 벽이다.
 *
 *  **모델이 나눠 보낸 문단이 정본이다 (09/01).** 프롬프트가 이미 그렇게 요구하고 있다 —
 *  `agent_board_cmo.md`: "6문장을 넘기면 빈 줄 하나로(JSON 문자열에서는 `\n\n`) 문단을
 *  나누고, 문단마다 논점을 하나씩만 담아라", `agent_board_ceo.md`: "결정, 채택·기각한
 *  논리, 조건과 지시, kill criteria가 각각 하나의 문단이다".
 *  그런데 이 함수가 그 `\n\n` 을 **보지도 않고** 문장 3개씩 다시 잘라 `" "` 로 이어
 *  붙였다 — 모델이 논점 단위로 끊어 준 것을 화면이 지우고 제 규칙으로 다시 자른 셈이다.
 *  이제 저자의 문단이 있으면 그것을 쓰고, 없을 때만 문장 3개씩으로 떨어진다.
 *
 *  재생 중에도 같은 함수를 타므로 **스트리밍하는 동안 문단이 하나씩 자라난다** —
 *  빈 줄이 도착할 때마다 새 문단이 선다. */
function paragraphs(text: string, per = 3): string[] {
  const authored = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (authored.length > 1) return authored;
  const sentences = text.split(/(?<=[.。?!])\s+/).filter(Boolean);
  if (sentences.length <= per) return [text];
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += per) out.push(sentences.slice(i, i + per).join(" "));
  return out;
}

/** 여러 문단을 세로로 편다 — 한 덩어리 글은 회의록이 아니라 벽이다 (09/01).
 *
 *  `paragraphs()` 가 간사·CEO 턴에만 걸려 있었다. 정작 회의의 대부분인 **전문가 발언과
 *  폐회 발언은 통째로 한 덩이**로 나왔다 — 팀장이 붙여 준 RA 총괄 발언(6문장·1,100자)이
 *  그것이다. 규칙을 만들어 놓고 절반에만 적용하고 있었던 셈이라 한 곳으로 모은다. */
function Paras({ text, className, gap = "gap-2.5" }: {
  text: string; className?: string; gap?: string;
}) {
  const paras = paragraphs(text);
  if (paras.length <= 1) {
    return <p className={cx("whitespace-pre-wrap", className)}>{text}</p>;
  }
  return (
    <div className={cx("flex flex-col", gap)}>
      {paras.map((para, i) => (
        <p key={i} className={cx("whitespace-pre-wrap", className)}>{para}</p>
      ))}
    </div>
  );
}

const fadeUp = "motion-safe:animate-[fade-up_.3s_ease-out]";

/* ── 턴 렌더러 ────────────────────────────────────────────────────────────────
   `text`      = 타이프라이터 진행분 (재생 중이면 잘린 문자열)
   `showMeta`  = 발언이 끝났다 — 부가 구조(확신도·조건·kill criteria)를 함께 편다
   `collapsed` = **요약만 보여 달라** — 사람이 [접기]를 눌렀거나 지난 회의록을 열람하는 중

   08/31에 뒤 둘을 갈랐다. 그전에는 `showMeta` 하나가 둘을 겸해서, 타이핑이 끝나는 순간
   부가 구조가 펴지는 것과 **읽던 전문이 요약으로 갈리는 것**이 동시에 일어났다 —
   읽는 사람에게는 문장이 눈앞에서 사라지고 높이가 급히 줄어 스크롤이 튀는 일이었다.
   이제 완료는 부가 구조만 열고, 접는 것은 사람의 행위다 (팀장 선택: 안 A + 스크롤 앵커). */

function OrchestratorBand({ m, text, showMeta, collapsed, onFold }: {
  m: Minute; text: string; showMeta: boolean; collapsed: boolean;
  onFold: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const isAnswer = m.turnType === "ANSWER";
  const corrections = m.meta?.groundingCorrections ?? [];
  const paras = paragraphs(text);
  // 접을 값어치가 있을 때만 손잡이를 낸다. 답변(ANSWER)은 원래 2~4문장이라 대상이 아니다.
  const foldable = showMeta && !isAnswer && text.length > 220 && paras.length > 1;
  const short = foldable && collapsed;
  return (
    <div className={cx("mx-auto w-full max-w-3xl", fadeUp)}>
      <Panel tone="note" pad="sm">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Eyebrow>간사 · {ORCH_LABEL[m.turnType] ?? m.turnType}</Eyebrow>
          {isAnswer && <Tag tone="mark">원장 데이터 답변</Tag>}
        </div>

        {isAnswer ? (
          <Quote meta={m.meta?.sourceKo ? `출처: ${m.meta.sourceKo}` : undefined}>{text}</Quote>
        ) : short ? (
          <p className="mt-2 text-center text-[0.9375rem] leading-[1.75]">{paras[0]}</p>
        ) : (
          <Paras
            text={text} gap="gap-2"
            className="mt-2 text-center text-[0.9375rem] leading-[1.75]"
          />
        )}
        {foldable && (
          <div className="text-center">
            <FoldPill open={!collapsed} onToggle={onFold} closedLabel="발언 전문 보기" />
          </div>
        )}

        {showMeta && corrections.length > 0 && (
          <div className="mt-3 rounded-xl border-l-[3px] border-line-2 bg-fill-1 px-3.5 py-2.5">
            <Eyebrow>간사 정정 · 원장 대조</Eyebrow>
            <ul className="mt-1.5 flex flex-col gap-1.5 text-[0.875rem] leading-[1.7]">
              {corrections.map((c, i) => (
                <li key={i}>
                  <b className="font-medium">{pLabel(c.persona)}</b>의 “{c.claimedKo}” → {c.correctionKo}{" "}
                  <span className="mono text-[0.8125rem] text-faint">(출처: {c.sourceKo})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showMeta && m.turnType === "CONVENE" && m.meta?.relatedHistoryNoteKo && (
          <p className="mt-2.5 text-center text-[0.875rem] leading-[1.7] text-muted">
            과거 심의 참고 — {m.meta.relatedHistoryNoteKo}
          </p>
        )}
      </Panel>
    </div>
  );
}

function ExpertTurn({ m, text, showMeta, collapsed, onFold, isLead }: {
  m: Minute; text: string; showMeta: boolean; collapsed: boolean;
  onFold: (e: React.MouseEvent<HTMLButtonElement>) => void; isLead: boolean;
}) {
  const short = showMeta ? m.keyPointKo : null;
  return (
    <div className={fadeUp}>
      <TraceTurn
        who={m.personaLabelKo || pLabel(m.persona)}
        icon={<Avatar persona={m.persona} />}
        bareIcon
        chips={
          <>
            {isLead && <Tag tone="mark">LEAD</Tag>}
            <Tag>{EXPERT_TURN_KO[m.turnType] ?? m.turnType}</Tag>
            <StanceTag stance={m.stance} />
            {m.stanceChanged && <Tag tone="mark">입장 변경</Tag>}
            {showMeta && m.meta?.inquiryToOrchestrator && (
              <Tag tone="mark">
                {/* 한도를 넘은 질의는 회의 중 답하지 않고 회의록의 확인 요청으로 넘긴다 —
                    "한도입니다"라고 말하는 간사는 실제 회의에 없다 (08/27 재설계). */}
                {m.meta.inquiryDeferred ? "확인 요청 · 서면 답변" : "간사에게 질의"}
              </Tag>
            )}
          </>
        }
      >
        {m.meta?.directedQuestionKo && (
          <p className="mono mb-2 text-[0.8125rem] leading-[1.7] text-faint">
            간사의 질문 — {m.meta.directedQuestionKo}
          </p>
        )}
        {/* 요지가 앞에 서고 전문은 **그 아래 그대로 남는다** (08/31 안 A). 회의를 따라가는
            데 필요한 것은 "무슨 입장을 왜" 한 줄이지만, 그 한 줄을 얻는 값으로 읽던 문장을
            빼앗지는 않는다. 접는 것은 [접기]를 누를 때 · [지난 발언 접기]를 누를 때뿐이다. */}
        {/* 요지는 «요약»으로 읽혀야 한다 (09/01 팀장: "써머리인 게 티나게 굵은 글씨나
            카드 색을 연하게라도"). 전에는 전문과 **같은 흰 카드**라 두 덩이가 나란히
            선 것으로만 보였다. 새 색을 들이지 않고(색 원칙 ①) 네이비 파생 면 + 잉크색
            중간 굵기 + 눈썹 한 줄로 가른다 — 뜻이 아니라 **격**이 다른 자리다. */}
        {short && (
          <div className="mt-1 rounded-xl border border-line bg-fill-1 px-3.5 py-2.5">
            <Eyebrow>요지</Eyebrow>
            <p className="mt-1 text-[0.9375rem] font-medium leading-[1.7] text-navy">{short}</p>
          </div>
        )}
        {!(short && collapsed) && (
          short ? (
            <div className="mt-2 rounded-xl border border-line bg-card px-3.5 py-3">
              <Paras text={text} className="text-[0.9375rem] leading-[1.8] text-muted" />
            </div>
          ) : (
            <Panel pad="sm">
              <Paras text={text} className="text-[0.9375rem] leading-[1.75]" />
            </Panel>
          )
        )}
        {short && <FoldPill open={!collapsed} onToggle={onFold} />}
        {showMeta && (m.confidence || m.meta?.actionProposal) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-2">
            <ConfidenceDots n={m.confidence} />
            {m.meta?.actionProposal?.actionKo && (
              <span className="mono text-[0.75rem] text-muted">
                액션 제안 — {m.meta.actionProposal.actionKo}
                {m.meta.actionProposal.timelineKo ? ` (${m.meta.actionProposal.timelineKo})` : ""}
              </span>
            )}
          </div>
        )}
      </TraceTurn>
    </div>
  );
}

function ArgList({ title, args }: { title: string; args: CeoArgument[] }) {
  return (
    <div>
      <Eyebrow onNavy>{title}</Eyebrow>
      {args.length === 0 ? (
        <p className="mt-1.5 text-[0.875rem] text-on-navy-3">없음</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-2 text-[0.875rem] leading-[1.7] text-on-navy">
          {args.map((a, i) => (
            <li key={i}>
              <b className="font-medium text-on-navy">{pLabel(a.persona)}</b> — {a.argumentKo}
              <span className="block text-on-navy-3">{a.whyKo}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** CEO 판정 — 네이비 색면. 이 화면에서 못 박히는 블록은 이것 하나뿐이다. */
function CeoCard({ m, text, showMeta, collapsed, onFold }: {
  m: Minute; text: string; showMeta: boolean; collapsed: boolean;
  onFold: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const meta = m.meta ?? {};
  const paras = paragraphs(text);
  const foldable = showMeta && paras.length > 1;
  return (
    <Panel tone="navy" pad="lg" className={fadeUp}>
      <div className="flex flex-wrap items-center gap-2.5">
        <Avatar persona="CEO" />
        <Eyebrow onNavy>CEO 판정 · AI 권고</Eyebrow>
        {meta.decision && (
          <span className="mono rounded-lg bg-orange px-2.5 py-1 text-[0.75rem] font-bold text-navy">
            {REC_KO[meta.decision] ?? meta.decision}
          </span>
        )}
        {showMeta && meta.leadAlignment && (
          <span className="mono rounded-lg border border-on-navy-line px-2 py-0.5 text-[0.75rem] text-on-navy">
            {meta.leadAlignment === "OVERRIDDEN"
              ? `Lead 의견과 다른 판정${meta.leadOverrideReasonKo ? ` — ${meta.leadOverrideReasonKo}` : ""}`
              : "Lead 의견 채택"}
          </span>
        )}
      </div>

      {/* 판정문은 회의의 절정이고, 그 순간이 **끝나도 사라지지 않는다** (08/31 안 A).
          접으면 첫 문단만 남는다 — 결정·조건·kill criteria를 먼저 읽고 싶을 때 쓴다. */}
      {foldable && collapsed ? (
        <p className="mt-3 text-[0.9375rem] leading-[1.75]">{paras[0]}</p>
      ) : (
        <>
          <Paras text={text} className="mt-3 text-[0.9375rem] leading-[1.75]" />
          {showMeta && (
            <div className="mt-4 grid gap-5 border-l border-on-navy-line pl-4 md:grid-cols-2">
              <ArgList title="채택한 논거" args={meta.adoptedArguments ?? []} />
              <ArgList title="기각한 논거" args={meta.rejectedArguments ?? []} />
            </div>
          )}
        </>
      )}
      {foldable && (
        <FoldPill
          open={!collapsed} onToggle={onFold} onNavy className="mt-2.5"
          closedLabel="판정문 전문 · 채택·기각 논거"
        />
      )}

      {showMeta && (
        <>

          {(meta.conditionsKo?.length ?? 0) > 0 && (
            <div className="mt-5">
              <Eyebrow onNavy>추진 조건</Eyebrow>
              <ul className="mt-1.5 flex flex-col gap-1 text-[0.875rem] leading-[1.7] text-on-navy">
                {meta.conditionsKo!.map((c, i) => <li key={i}>· {c}</li>)}
              </ul>
            </div>
          )}

          {(meta.killCriteriaKo?.length ?? 0) > 0 && (
            <div className="mt-5">
              <Eyebrow onNavy>KILL CRITERIA · 이러면 접는다</Eyebrow>
              <ul className="mono mt-1.5 flex flex-col gap-1 text-[0.8125rem] leading-[1.7] text-on-navy">
                {meta.killCriteriaKo!.map((c, i) => <li key={i}>× {c}</li>)}
              </ul>
            </div>
          )}

          {(meta.directives?.length ?? 0) > 0 && (
            <div className="mt-5 rounded-xl bg-on-navy-3 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className="size-[7px] flex-none rounded-full bg-orange" />
                <Eyebrow onNavy>전략적 제안 · 채택은 아래 [액션 결정]에서</Eyebrow>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5 text-[0.875rem] leading-[1.7] text-on-navy">
                {meta.directives!.map((d, i) => (
                  <li key={i}>
                    · {d.directiveKo}{" "}
                    <span className="mono text-[0.8125rem] text-on-navy-3">
                      ({TARGET_KO[d.target] ?? d.target} · {OWNER_KO[d.ownerRole] ?? d.ownerRole}
                      {d.deadlineKo ? ` · ${d.deadlineKo}` : ""})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function CloseCard({ m, text, showMeta, collapsed, onFold }: {
  m: Minute; text: string; showMeta: boolean; collapsed: boolean;
  onFold: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const mm = m.meta?.minutes;
  const evolutions = (mm?.stanceEvolution ?? []).filter((s) => s.from !== s.to);
  const short = showMeta ? mm?.summaryKo : null;
  return (
    <Panel pad="lg" className={fadeUp}>
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow>간사 · 폐회 — 회의록</Eyebrow>
        {mm && <Tag tone="mark">AI 권고 {REC_KO[mm.aiRecommendation] ?? mm.aiRecommendation}</Tag>}
      </div>
      {short && (
        <div className="mt-2.5 rounded-xl border border-line bg-fill-1 px-3.5 py-2.5">
          <Eyebrow>회의록 요지</Eyebrow>
          <p className="mt-1 text-[0.9375rem] font-medium leading-[1.7] text-navy">{short}</p>
        </div>
      )}
      {!(short && collapsed) && (
        short ? (
          <div className="mt-2 rounded-xl border border-line bg-card px-3.5 py-3">
            <Paras text={text} className="text-[0.9375rem] leading-[1.8] text-muted" />
          </div>
        ) : (
          <Paras text={text} className="mt-2.5 text-[0.9375rem] leading-[1.75]" />
        )
      )}
      {short && <FoldPill open={!collapsed} onToggle={onFold} closedLabel="폐회 발언 전문 보기" />}

      {showMeta && mm && (
        <div className="mt-4 flex flex-col gap-4">

          {evolutions.length > 0 && (
            <div>
              <SectionHead title="입장 변화" right={`${evolutions.length}인 변경`} />
              <TableFrame className="mt-2.5">
                <thead>
                  <tr>
                    <th className={TH}>참석자</th>
                    <th className={TH}>변화</th>
                    <th className={TH}>이유</th>
                  </tr>
                </thead>
                <tbody>
                  {evolutions.map((s, i) => (
                    <tr key={i}>
                      <td className={cx(TD, "mono whitespace-nowrap font-medium text-navy")}>{pLabel(s.persona)}</td>
                      <td className={cx(TD, "mono whitespace-nowrap")}>{s.from} → {s.to}</td>
                      <td className={cx(TD, "text-muted")}>{s.reasonKo}</td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            </div>
          )}

          {(mm.actionItems?.length ?? 0) > 0 && (
            <div>
              <SectionHead title="액션 초안" dot="orange" right="채택은 사람이 — 아래 [액션 결정]" />
              <TableFrame className="mt-2.5">
                <thead>
                  <tr>
                    <th className={TH}>액션</th>
                    <th className={TH}>제안 출처</th>
                    <th className={TH}>전달 대상</th>
                    <th className={TH}>기한</th>
                  </tr>
                </thead>
                <tbody>
                  {mm.actionItems!.map((a, i) => (
                    <tr key={i}>
                      <td className={TD}>{a.actionKo}</td>
                      <td className={cx(TD, "mono whitespace-nowrap text-muted")}>{a.sourceKo}</td>
                      <td className={cx(TD, "whitespace-nowrap text-muted")}>{TARGET_KO[a.target] ?? a.target}</td>
                      <td className={cx(TD, "mono whitespace-nowrap text-faint")}>{a.deadlineKo ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            </div>
          )}

          <div className="mono flex flex-col gap-1.5 text-[0.8125rem] leading-[1.7] text-muted">
            {(mm.killCriteriaKo?.length ?? 0) > 0 && (
              <span>kill criteria — {mm.killCriteriaKo.join(" / ")}</span>
            )}
            <span>다음 재검토 트리거 — {mm.nextReviewTriggerKo}</span>
          </div>

          {(mm.groundingEventsKo?.length ?? 0) > 0 && (
            <Fold title="그라운딩 이벤트" tone="quiet" hint="회의 중 원장 대조로 바로잡힌 것">
              <ul className="flex flex-col gap-1 text-[0.875rem] leading-[1.7] text-muted">
                {mm.groundingEventsKo!.map((g, i) => <li key={i}>· {g}</li>)}
              </ul>
            </Fold>
          )}
        </div>
      )}
    </Panel>
  );
}

/* 소집 무대 — 회의가 시작되기 전에 **참석자가 정해지는 이야기**를 4막으로 편다.

   이 제품의 주장이 여기 있다: 참석자는 AI가 골라 앉힌 것이 아니라, 안건의 유형이
   주무 임원을 부르고 그 자리가 필요한 전문가를 부른다. 그래서 네 걸음이 차례로
   등장한다 — 유형 → 리드 → 참석자 → 개회. 단계 전환은 state가 아니라 CSS
   animation-delay다(효과 안에서 상태를 옮기지 않는다 — React 19 규칙). */
function ConveneStage({ hypType, lead, convened, urgency }: {
  hypType: string | null; lead: string | null; convened: string[]; urgency?: string | null;
}) {
  if (!hypType || !lead || convened.length === 0) return null;
  const others = convened.filter((p) => p !== lead);
  const rise = "motion-safe:animate-[fade-up_.5s_ease-out_backwards]";
  const beat = (i: number) => ({ animationDelay: `${i * 700}ms` });

  return (
    <Panel pad="lg" className="mt-6 overflow-hidden">
      <Eyebrow>회의 소집 — 누가 앉는지가 먼저 정해진다</Eyebrow>

      <div className="mt-5 flex flex-col gap-5">
        {/* 1막 — 이 안건은 무엇인가 */}
        <div className={cx("flex flex-wrap items-center gap-3", rise)} style={beat(0)}>
          <StageNum n={1} />
          <span className="text-[0.9375rem] text-navy">이 가설의 유형은</span>
          <Badge variant="mark" size="lg" className="rounded-xl">
            <Layers strokeWidth={2.2} />
            {HYPTYPE_KO[hypType] ?? hypType}
          </Badge>
          <span className="text-[0.9375rem] text-navy">입니다</span>
          {urgency === "HIGH" && <Badge variant="oppose" size="lg" className="rounded-xl">긴급</Badge>}
        </div>

        {/* 2막 — 그 유형의 주무가 회의를 이끈다 */}
        <div className={cx("flex flex-wrap items-center gap-3", rise)} style={beat(1)}>
          <StageNum n={2} />
          <span className="text-[0.9375rem] text-navy">유형에 맞는 보드 리드를 정합니다</span>
          <span
            className="inline-flex items-center gap-2.5 rounded-2xl border-2 bg-card-bg py-1.5 pl-1.5 pr-4"
            style={{ borderColor: pTint(lead) }}
          >
            <Avatar persona={lead} ring />
            <span className="text-[0.9375rem] font-medium text-navy">{pLabel(lead)}</span>
            <Badge variant="mark">LEAD</Badge>
          </span>
        </div>

        {/* 3막 — 리드를 중심으로 필요한 전문가가 모인다 */}
        <div className={cx("flex flex-wrap items-center gap-3", rise)} style={beat(2)}>
          <StageNum n={3} />
          <span className="text-[0.9375rem] text-navy">리드가 이 안건에 필요한 전문가를 소집합니다</span>
          <span className="flex flex-wrap items-center gap-2">
            {others.map((pp, i) => (
              <span
                key={pp}
                title={pLabel(pp)}
                style={{ animationDelay: `${2100 + i * 190}ms` }}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card-bg py-1.5 pl-1.5 pr-3 motion-safe:animate-[fade-up_.45s_ease-out_backwards]"
              >
                <Avatar persona={pp} size="sm" />
                <span className="text-[0.9375rem] font-medium text-navy">{PERSONA[pp]?.roleKo ?? pp}</span>
              </span>
            ))}
          </span>
        </div>

        {/* 4막 — 개회 */}
        <div className={cx("flex flex-wrap items-center gap-3", rise)}
             style={{ animationDelay: `${2100 + others.length * 190 + 300}ms` }}>
          <StageNum n={4} />
          <span className="text-[0.9375rem] font-medium text-navy">
            {convened.length}인 이사회가 시작됩니다
          </span>
          <span className="mono text-[0.8125rem] text-faint">CEO는 판정 전담 — 토론에 참여하지 않습니다</span>
        </div>
      </div>

      <p className="mono mt-5 text-[0.75rem] leading-[1.75] text-faint">
        유형 분류만 AI가 하고, 누가 앉는지는 소집 규칙이 정합니다 — 같은 유형이면 언제나 같은 자리가 앉습니다.
      </p>
    </Panel>
  );
}

/* 단계 인터스티셜 — 상단 고정바는 본문을 읽는 동안 시야 밖이다. 흐름은 **대화가
   흐르는 자리에서 한 번 멈춰** 알려야 눈에 걸린다 (08/27 팀장 지적: "대화를 따라가기
   때문에 이중 장치가 필요하다"). 그래서 구분선이 아니라 한 칸 크게 선다. */
const PHASE_LEAD: Record<number, string> = {
  0: "안건이 상정됩니다",
  1: "잠시 쉬고 — 각자의 모두발언이 시작됩니다",
  2: "잠시 쉬고 — 쟁점 토론이 시작됩니다",
  3: "토론을 마치고 — 최종 입장을 밝힙니다",
  4: "심의를 마치고 — 의장이 판정합니다",
  5: "회의를 정리합니다",
  6: "사람이 결정할 차례입니다",
};

function PhaseDivider({ phaseNo }: { phaseNo: number }) {
  const label = PHASE_STEPS[phaseNo] ?? `${phaseNo}단계`;
  return (
    <div className={cx("mt-6 first:mt-1", fadeUp)}>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-fill-2" />
        <span className="mono flex-none rounded-full bg-navy px-3.5 py-1 text-[0.8125rem] font-medium text-on-navy">
          {phaseNo === 0 ? "" : `${phaseNo} · `}{label}
        </span>
        <span className="h-px flex-1 bg-fill-2" />
      </div>
      <p className="mt-2 text-center text-[0.9375rem] font-medium text-navy">
        {PHASE_LEAD[phaseNo] ?? label}
      </p>
      {PHASE_NOTE[phaseNo] && (
        <p className="mono mt-1 text-center text-[0.75rem] text-faint">{PHASE_NOTE[phaseNo]}</p>
      )}
    </div>
  );
}

/** 소집 서사의 막 번호 — 이야기의 박자를 눈으로 센다 */
function StageNum({ n }: { n: number }) {
  return (
    <span className="mono flex size-7 flex-none items-center justify-center rounded-full bg-navy text-[0.8125rem] font-medium text-on-navy">
      {n}
    </span>
  );
}

/** 컨트롤 알약 — FoldPill과 같은 재질(테두리·모노·오렌지 없음). 켜진 것만 채운다. */
function Ctl({ on = false, label, hint, onClick, disabled }: {
  on?: boolean; label: string; hint?: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      aria-pressed={on}
      className={cx(
        "mono inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy/40",
        "disabled:cursor-not-allowed disabled:opacity-40",
        on
          ? "border-navy/45 bg-fill-2 font-medium text-navy"
          : "border-line bg-card text-body hover:border-line-2 hover:bg-fill-1 hover:text-navy",
      )}
    >
      {label}
    </button>
  );
}

/* 재생 컨트롤 — 08/31 신설 (팀장: "스크롤 따라가기 vs 멈추기, 일시정지 같은 게 필요하다").

   그전에는 [속도]·[전체 보기]가 상단 바에 흩어져 있고, **재생을 멈출 방법이 없었다** —
   연출을 통째로 버리는 [전체 보기]가 유일한 탈출구였다. 스크롤 추적은 코드로는 돌고 있었지만
   화면에 표시가 없어, 사람은 자기가 위로 올린 순간 추적이 꺼진 것을 모르고 "화면이 멈췄다"고
   읽었다. 회의를 따라가는 손잡이는 회의 곁에 있어야 하므로 고정 단계 막대 안으로 모았다.

   오렌지를 쓰지 않는다: 이 화면에서 오렌지는 「사람이 결정할 차례」 하나를 가리킨다.
   재생 보조 장치가 그 색을 빌리면 판정 패널이 눈에서 묻힌다 (08/28 팀장 규율). */
function PlaybackControls({
  playing, paused, onPause, onNext, speed, onSpeed, onFlush, onReplay,
  followOn, onFollow, foldedAll, onFoldAll, foldableCount,
}: {
  playing: boolean; paused: boolean; onPause: () => void; onNext: () => void;
  speed: number; onSpeed: () => void; onFlush: () => void; onReplay: () => void;
  followOn: boolean; onFollow: () => void;
  foldedAll: boolean; onFoldAll: () => void; foldableCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {playing ? (
        <>
          <Ctl on={paused} label={paused ? "▶ 재생" : "⏸ 일시정지"} hint="Space" onClick={onPause} />
          <Ctl label="⏭ 다음 발언" hint="J 또는 ↓" onClick={onNext} />
          <Ctl label={`속도 ×${speed}`} hint="타이프라이터와 발언 사이 간격에 함께 적용됩니다" onClick={onSpeed} />
          <Ctl label="전체 보기" hint="F — 남은 발언을 한 번에 펼칩니다" onClick={onFlush} />
        </>
      ) : (
        <Ctl label="↺ 처음부터 재생" hint="회의록을 대화가 벌어진 순서로 다시 재생합니다" onClick={onReplay} />
      )}
      {foldableCount > 0 && (
        <Ctl
          label={foldedAll ? `전문 펼치기 ${foldableCount}` : `요지만 보기 ${foldableCount}`}
          hint="E — 발언 전문을 한꺼번에 접거나 펼칩니다"
          onClick={onFoldAll}
        />
      )}
      <Ctl
        on={followOn}
        label={followOn ? "↓ 따라가기 켜짐" : "따라가기 꺼짐"}
        hint="새 발언이 나오면 화면이 그 자리로 따라갑니다 — 위로 올려 읽으면 저절로 꺼집니다"
        onClick={onFollow}
      />
    </div>
  );
}

/* 고정 헤더 — 스크롤을 내려도 **지금 어느 단계이고 누가 말하는가**는 사라지면 안 된다.

   작게 만들면 본문을 읽는 동안 눈에 안 들어와 회의의 흐름 자체가 안 보인다. 그래서
   칩을 키우고, 진행 중인 단계는 숨 쉬듯 깜빡이며, 지나온 단계는 채워진 막대로 남는다 —
   화면만 봐도 "여섯 단계 중 넷째"가 읽히게. */
function StickyBar({ hypId, currentPhase, humanDecided, decisionOpen, active, running,
                    controls, waitedSec }: {
  hypId: string; currentPhase: number | null; humanDecided: boolean;
  decisionOpen: boolean; active: Minute | null; running: boolean;
  /** 재생 컨트롤 — 회의를 따라가는 손잡이는 회의 곁에 있어야 한다 (08/31) */
  controls?: React.ReactNode;
  /** 서버를 기다린 초 — Screen 헤더의 `…{elapsed}s` 와 같은 자리·같은 어법 (09/01) */
  waitedSec?: number;
}) {
  const steps = [...PHASE_STEPS, "액션 결정"];
  const cur = humanDecided ? steps.length - 1
    : decisionOpen ? steps.length - 1
    : (currentPhase ?? 0);
  return (
    /* top-[58px] = Topbar 높이. 둘 다 top-0이면 z가 높은 이 바가 상단 도구(속도·전체 보기·
       재심의)를 통째로 덮는다 — 스크롤을 내린 뒤에는 누를 수 없었다 (08/28). 아래로 쌓는다. */
    /* `pt-6` 는 여백이 아니라 **글로우가 설 자리**다 (09/01 팀장 보고: "알약 칸 윗부분
       애니메이션이 안 보인다"). `.glow-running` 은 위아래로 23px(spread 3 + blur 20)
       번지는데 여기 위쪽 패딩이 12px 뿐이라, 넘친 몫이 이 바의 경계 밖으로 나가
       **상단 바(z-40)가 덮어 버렸다** — 발언자 칩이 지금 빛나고 있다는 표시가 정작
       위쪽만 잘려 나갔다. 칩을 상자 안쪽으로 내려 빛이 제 상자 안에서 끝나게 한다. */
    <div className="sticky top-[58px] z-30 -mx-6 mb-5 border-b border-glass-line bg-paper/90 px-6 pb-3 pt-6 backdrop-blur md:-mx-10 md:px-10">
      {/* 08/30: ContractBadge 가 /pipeline·/hypotheses 로 접히며 이 화면(/board)에는 더
          이상 뜨지 않는다 — 08/28에 배지 때문에 비웠던 우측 250px 예약을 돌려놓는다. */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="mono flex-none text-[0.8125rem] font-medium text-navy">{hypId}</span>
        <span className="mono flex-none rounded-lg bg-fill-1 px-2 py-0.5 text-[0.75rem] text-navy">
          {cur + 1} / {steps.length}
        </span>
        {active && (
          /* 09/01 — Screen 이 «지금 도는 것»에 쓰는 빛을 그대로 쓴다 (.glow-running).
             전에는 ring-2 유틸이었는데, 같은 뜻을 두 화면이 다른 그림으로 말하고 있었다. */
          /* 폭이 모자라면 **이름이 줄고**, 입장·「발언 중」은 끝까지 남는다 (09/01 팀장 보고:
             "짤리는데"). 그전에는 칩이 `flex-none` 에 자식이 전부 `whitespace-nowrap` 이라
             줄어들 수가 없었고, 좁은 화면에서 통째로 잘려 나갔다 — 하필 잘리는 쪽이
             오른쪽 끝이라 «발언 중» 이 먼저 사라졌다. 이 칩에서 가장 짧고 가장 중요한 두
             조각이 그것이다. 긴 직함은 마우스를 올리면 title 로 나온다. */
          <span
            className="glow-running ml-auto flex min-w-0 items-center gap-2 rounded-2xl border bg-card py-1 pl-1 pr-3"
            style={{ borderColor: `${pTint(active.persona)}66` }}
            title={pLabel(active.persona)}
          >
            <Avatar persona={active.persona} size="sm" />
            <span className="truncate text-[0.875rem] font-medium text-navy">
              {active.personaLabelKo || pLabel(active.persona)}
            </span>
            {active.stance && (
              <span className="flex-none"><StanceTag stance={active.stance} /></span>
            )}
            <span className="mono pulse-soft flex-none whitespace-nowrap text-[0.75rem] text-orange-deep">발언 중</span>
          </span>
        )}
        {!active && running && (
          <span className="mono pulse-soft ml-auto flex-none whitespace-nowrap text-[0.75rem] text-orange-deep">진행 중…</span>
        )}
      </div>

      {/* 단계 막대 — 지나온 것은 채워지고, 지금은 깜빡이고, 남은 것은 비어 있다 */}
      <div className="mt-2 flex items-stretch gap-1.5">
        {steps.map((label, i) => {
          const done = i < cur;
          const now = i === cur;
          return (
            <div key={label} className="relative flex min-w-0 flex-1 flex-col gap-1">
              {/* 지금 칸에는 진행 띠가 흐른다 (09/01 · Screen STEP 카드와 같은 클래스).
                  퍼센트를 지어내지 않는다 — 단계 시간은 LLM 응답에 달려 있어 불확정이다. */}
              {now && running && <span className="progress-shimmer" aria-hidden />}
              <span
                className={cx(
                  "h-[3px] rounded-full",
                  done && "bg-navy/55",
                  now && "bg-orange motion-safe:animate-[step-pulse_1.5s_ease-in-out_infinite]",
                  !done && !now && "bg-fill-2",
                )}
              />
              <span
                className={cx(
                  "mono truncate text-[0.75rem] leading-none",
                  now ? "font-medium text-orange-deep" : done ? "text-body" : "text-faint",
                )}
                title={label}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
      {(PHASE_NOTE[cur] || controls) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          {PHASE_NOTE[cur] && (
            <p className="mono min-w-0 text-[0.75rem] text-faint">
              {PHASE_NOTE[cur]}
              {/* 어느 단계가 얼마나 돌고 있는지 — Screen 이 헤더 우측에 쓰는 문법과 같다.
                  기다린 시간을 숨기지 않는다 (실호출은 실제로 오래 걸린다). */}
              {running && waitedSec !== undefined && waitedSec >= 3 && (
                <span className="pulse-soft text-orange-deep">
                  {" · "}{steps[cur]} 진행 중… {waitedSec}초
                </span>
              )}
            </p>
          )}
          {controls && <div className="ml-auto">{controls}</div>}
        </div>
      )}
    </div>
  );
}

/* 의장 판정 — 최종 입장이 끝나면 여기서 회의가 멈춘다.

   AI가 판정을 내리고 사람이 추인하는 그림은, 판단의 주체가 뒤바뀐 것처럼 보인다.
   그래서 **네 개의 버튼을 사람 앞에 놓고** 논의가 가리키는 쪽만 깜빡여 권한다.
   권고는 최종 입장을 확신도로 가중해 센 SQL 집계다 — 왜 그쪽인지 숫자로 보여준다.
   권고와 다른 것을 눌러도 그대로 진행되고, CEO가 그 긴장을 발언에서 드러낸다. */
function VerdictPanel({ hypId, recommended, tally, onSubmitted }: {
  hypId: string; recommended: string | null;
  tally: StanceTally | null; onSubmitted: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 판정을 내리는 자리는 의장(CEO)이다 — 서명하듯 직접 타이핑해 남긴다 (08/28 팀장 확정)
  const [decidedBy, setDecidedBy] = useState("CEO");
  const counts = tally?.counts;

  async function submit(decision: string) {
    setBusy(decision);
    setErr(null);
    try {
      await api(`/hypotheses/${hypId}/board/verdict`, {
        method: "POST", body: JSON.stringify({ decision, decidedBy }),
      });
      onSubmitted();
    } catch (e) {
      setErr(errText(e));
      setBusy(null);
    }
  }

  return (
    <Panel as="section" active pad="lg" className="mt-6">
      <Eyebrow>CHAIR VERDICT · 의장 판정</Eyebrow>
      <h2 className="mt-1.5 text-[1.0625rem] font-medium tracking-tight text-navy">
        판정은 사람이 내립니다
      </h2>
      <p className="mt-1.5 text-[0.9375rem] leading-[1.7] text-muted">
        논의가 가리키는 쪽을 깜빡여 권해 드립니다. 다른 판단을 하셔도 됩니다 —
        고른 판정을 CEO가 회의 논의에 근거해 설명합니다.
      </p>

      {counts && (
        <div className="mono mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-body">
          <span>최종 입장</span>
          <span>지지 {counts.SUPPORT}</span>
          <span className="text-faint">·</span>
          <span>보류 {counts.HOLD}</span>
          <span className="text-faint">·</span>
          <span>반대 {counts.OPPOSE}</span>
          <span className="text-faint">|</span>
          <span>Lead {tally?.leadExpert ? pLabel(tally.leadExpert) : "—"} {tally?.leadStance ?? ""}</span>
          <span className="text-faint">|</span>
          <span className="text-faint">computedBy: SQL</span>
        </div>
      )}
      {tally?.ruleKo && (
        <p className="mono mt-1.5 text-[0.75rem] leading-[1.7] text-faint">{tally.ruleKo}</p>
      )}

      {/* 결정 버튼은 공용 프리미티브 한 종류로 — 판정과 승인이 같은 무게의 행위이므로
          같은 크기여야 한다 (08/27: 화면마다 생버튼을 써서 크기가 갈렸다). */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(["GO", "CONDITIONAL_GO", "HOLD", "NO_GO"] as const).map((d) => {
          const rec = d === recommended;
          return (
            <Button
              key={d}
              variant={rec ? "default" : "outline"}
              size="lg"
              disabled={!!busy}
              onClick={() => submit(d)}
              title={rec ? "논의가 가리키는 방향입니다" : "권고와 다른 판정입니다"}
              className={rec ? "motion-safe:animate-[verdict-pulse_1.6s_ease-in-out_infinite]" : undefined}
            >
              {busy === d ? "CEO 발언 요청 중…" : VERDICT_KO[d]}
              {rec && <span className="mono text-[0.75rem] opacity-70">논의가 가리킴</span>}
            </Button>
          );
        })}
      </div>

      <label
        className="mono mt-4 flex items-center gap-2 text-[0.75rem] text-faint"
        title="판정을 내린 의장의 이름 — 회의록과 결정 이력에 그대로 남습니다"
      >
        의장 서명
        <input
          value={decidedBy}
          placeholder="CEO"
          onChange={(e) => setDecidedBy(e.target.value)}
          className="w-40 rounded-lg border border-glass-line bg-card px-2 py-1 text-[0.875rem] text-navy"
        />
      </label>
      {err && (
        <Panel tone="note" pad="sm" className="mt-3 text-[0.875rem] leading-[1.7] text-rust">{err}</Panel>
      )}
      <p className="mono mt-3 text-[0.75rem] leading-[1.7] text-faint">
        이 판정은 <b className="font-medium text-navy">회의의 결론</b>입니다 — 폐회 뒤
        [액션 결정]에서 이 판정을 가설 상태로 기록하고 후속 액션을 함께 확정합니다.
      </p>
    </Panel>
  );
}

function Turn({ m, text, showMeta, collapsed, onFold, lead }: {
  m: Minute; text: string; showMeta: boolean; collapsed: boolean;
  onFold: (e: React.MouseEvent<HTMLButtonElement>) => void; lead: string | null;
}) {
  const p = { m, text, showMeta, collapsed, onFold };
  if (m.turnType === "DECISION") return <CeoCard {...p} />;
  if (m.turnType === "CLOSE") return <CloseCard {...p} />;
  if (m.persona === "ORCHESTRATOR" || m.turnType === "SYSTEM") return <OrchestratorBand {...p} />;
  return <ExpertTurn {...p} isLead={m.persona === lead} />;
}

// ── 액션 결정 패널 — 오렌지 색면: "사람의 판단이 필요한 지점" ─────────────────

type ActionRowState = {
  key: string; checked: boolean; directiveKo: string;
  target: string; ownerRole: string; sourceKo: string;
  /** 이 지시를 받을 권역 — 지시마다 다르다(전국 공통도 있고 한 권역 전용도 있다).
   *  비워 두면 서버가 근거에서 계산한다. 현장 체크리스트가 아닌 지시에는 의미가 없다. */
  regions: string[];
};

/** CEO 지시(기본 채택) + 전문가 액션 제안(기본 해제)을 한 목록으로 — 출처를 반드시 남긴다. */
function buildActionRows(minutes: Minute[]): ActionRowState[] {
  const rows: ActionRowState[] = [];
  const ceo = minutes.find((m) => m.turnType === "DECISION");
  (ceo?.meta?.directives ?? []).forEach((d, i) => {
    if (!d?.directiveKo?.trim()) return;
    rows.push({
      key: `ceo-${i}`, checked: true, directiveKo: d.directiveKo,
      target: TARGET_KO[d.target] ? d.target : "FIELD_CHECKLIST",
      ownerRole: OWNER_KO[d.ownerRole] ? d.ownerRole : "MEDICAL_AFFAIRS",
      sourceKo: `CEO 권고${d.deadlineKo ? ` · ${d.deadlineKo}` : ""}`,
      regions: [],
    });
  });
  minutes.forEach((m) => {
    const p = m.meta?.actionProposal;
    if (!p?.actionKo?.trim()) return;
    rows.push({
      key: `exp-${m.seq}`, checked: false, directiveKo: p.actionKo,
      // 어디로 내려갈지는 **제안한 임원이 정한다**(board_expert_v2). 화면이 기본값을 찍으면
      // 책상 업무가 현장 체크리스트로 잘못 내려가거나 그 반대가 된다. 값이 없을 때만
      // 전문조직 검토로 둔다 — 사고가 나도 방향이 안전한 쪽이다.
      target: p.target && TARGET_KO[p.target] ? p.target : "SPECIALIST_REVIEW",
      ownerRole: p.ownerRole && OWNER_KO[p.ownerRole] ? p.ownerRole : "MEDICAL_AFFAIRS",
      sourceKo: `${pLabel(m.persona)} 제안${p.timelineKo ? ` · ${p.timelineKo}` : ""}`,
      regions: [],
    });
  });
  return rows;
}

/* 액션 결정 — 판정을 가설 상태로 기록하고, 현장에 내릴 후속 액션을 확정하는 자리.

   08/28 이전에는 사람이 의장 판정(추진·조건부·보류·기각)을 고른 뒤 CEO 발언을 듣고
   **또** 승인·보류·기각을 골랐다. 같은 사람에게 같은 질문을 두 번 한 셈이고, 팀장이
   "보류로 결정된 건인데 승인·보류·기각이 다 있어 혼란스럽다"고 지적한 자리다.
   이제 판정은 VERDICT_TO_STATUS로 상태에 이어지고, 이 패널은 그 판정을 **기록**하고
   액션을 **확정**한다. 판정과 다르게 남겨야 할 때만 나머지 둘을 펼친다 — 세 버튼을
   나란히 두면 다시 "무엇을 묻는 화면인지" 모르게 된다. */
function DecisionPanel({ hypId, card, minutes, onDecided }: {
  hypId: string; card: Card; minutes: Minute[]; onDecided: (noteKo: string) => void;
}) {
  const ceo = minutes.find((m) => m.turnType === "DECISION");
  const rec = ceo?.meta?.decision ?? null;
  const verdictKo = rec ? (VERDICT_KO[rec] ?? rec) : null;
  // 판정 기록을 못 찾은 예외에서만 세 선택지를 처음부터 펴 둔다 (기본값은 가장 보수적인 보류)
  const mapped = VERDICT_TO_STATUS[rec ?? ""] ?? "HOLD";
  const others = (["APPROVED", "HOLD", "REJECTED"] as const).filter((d) => d !== mapped);

  const [rows, setRows] = useState<ActionRowState[]>(() => buildActionRows(minutes));
  /* 기각의 다음 걸음 — 기각은 **끝이 아니라 되돌아가는 결정**이다 (docs/01 §3: "승인만이
     끝이다"). 그런데 08/30까지 이 자리는 "기각은 후속 액션을 두지 않습니다"라는 막다른
     문구 하나였고, 콘솔 어디에도 REJECTED 를 물릴 버튼이 없었다 — 백엔드는
     `("REJECTED","SCREEN_QUEUED")` 를 열어 두고 있었는데도. 그래서 기각을 누르는 것이
     사실상 가설을 버리는 일이 되어, 사람이 기각을 못 누르게 만들었다. */
  const [rejectNext, setRejectNext] = useState<"SCREEN_QUEUED" | "DRAFT" | "NONE">("SCREEN_QUEUED");
  // 결정자가 아니라 **의장 서명**이다 — 판정을 내린 자리의 이름을 그대로 남긴다 (08/28)
  const [decidedBy, setDecidedBy] = useState("CEO");
  const [rationale, setRationale] = useState(
    ceo ? `AI 권고(${REC_KO[rec ?? ""] ?? rec ?? "없음"}) 검토 — ${ceo.utteranceKo ?? ""}` : "",
  );
  const [showAlt, setShowAlt] = useState(!rec);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toggleRegion = (key: string, rg: string, cur: string[]) =>
    patch(key, { regions: cur.includes(rg) ? cur.filter((x) => x !== rg) : [...cur, rg] });

  const patch = (key: string, p: Partial<ActionRowState>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const picked = rows.filter((r) => r.checked && r.directiveKo.trim());
  // 기각만 액션을 못 싣는다 — 서버가 422로 막고, 대신 열린 액션을 닫는다 (docs/04 §4, 08/28).
  // 보류로 채택한 액션도 ACTIVE다: 보류는 "정보를 더 모으라"는 뜻이라 모을 수단이 있어야 한다.
  const takesActions = mapped !== "REJECTED";
  const hasChecklist = picked.some((r) => r.target === "FIELD_CHECKLIST");
  /* 전달 대상 전문과는 **서버가 저장할 때 근거에서 SQL로 센다**. 이미 적재된 액션이 있으면
     그 값을 그대로 보여주고(같은 가설이므로 같은 근거다), 없으면 값을 지어내지 않고
     규칙만 말한다 — 화면이 계산 결과를 앞질러 말하면 그게 곧 환각이다. */
  const knownSpecialty = card.approvedActions?.find((a) => a.targetSpecialty)?.targetSpecialty ?? null;

  const primaryLabel = takesActions
    ? `${RECORD_KO[mapped]} · ${picked.length ? `액션 ${picked.length}건 확정` : "채택 액션 없음"}`
    : `${RECORD_KO[mapped]} · ${REJECT_NEXT[rejectNext].btnKo}`;

  /** `back` = 기각을 기록한 뒤 되돌릴 단계. null이면 기록만 한다.
   *  주 버튼(의장 판정이 기각일 때)만 위 라디오를 넘긴다 — [판정과 다르게 기록]으로 누른
   *  기각은 라디오가 화면에 없으므로 **보이지 않는 전이를 대신 밟지 않는다.** */
  async function decide(decision: "APPROVED" | "HOLD" | "REJECTED",
                        back: { to: string | null; ko: string } = { to: null, ko: "" }) {
    setBusy(decision);
    setErr(null);
    try {
      const send = rows.filter((r) => r.checked && r.directiveKo.trim());
      const body: Record<string, unknown> = { decision, decidedBy, rationaleKo: rationale };
      // actionItems는 승인·보류에만 실린다 — 기각에 담으면 서버가 422로 막는다 (08/28 개정)
      if (decision !== "REJECTED") {
        body.actionItems = send.map((r) => ({
          directiveKo: r.directiveKo.trim(), target: r.target, ownerRole: r.ownerRole,
          // 지시마다 받을 권역이 다르다 — 비운 줄은 서버가 근거에서 계산한다 (08/28)
          ...(r.regions.length ? { targetRegions: r.regions.join(",") } : {}),
        }));
      }
      await api(`/hypotheses/${hypId}/decision`, { method: "POST", body: JSON.stringify(body) });
      // 성공 밴드는 부모가 그린다 — 이 패널은 결정과 함께 화면에서 내려가기 때문
      // 현장에 내려가는 것은 FIELD_CHECKLIST뿐이다 — 나머지 둘은 전달됐을 뿐 수집으로
      // 닫히지 않는다(docs/01 §3). 전부 Field로 간다고 말하면 실행 루프가 안 닫힌 것처럼 보인다.
      const toField = send.filter((r) => r.target === "FIELD_CHECKLIST").length;
      const toDesk = send.length - toField;
      const parts = [
        toField ? `${toField}건이 Field 체크리스트로 내려갑니다` : "",
        toDesk ? `${toDesk}건은 전문조직·의학정보 대응으로 전달됩니다` : "",
      ].filter(Boolean);

      if (decision !== "REJECTED") {
        onDecided(
          send.length
            ? `${RECORD_KO[decision]}되었습니다 — 액션 ${send.length}건 중 ${parts.join(" · ")}`
            : `${RECORD_KO[decision]}되었습니다 — 채택한 액션은 없습니다.`,
        );
        return;
      }

      /* 기각은 **두 걸음**이다 — 기록하고, 되돌린다. 호출도 둘이다.
         순서를 바꾸지 않는다: 되돌리기가 먼저면 상태가 REJECTED가 아니게 되어 결정
         기록이 남을 자리를 잃는다. 그리고 두 번째만 실패했을 때 **첫 걸음은 이미
         남았다고 말한다** — "실패했습니다" 한 줄로 덮으면 사람이 기각을 두 번 누른다. */
      if (!back.to) {
        onDecided("기각으로 기록되었습니다 — 이 가설의 열린 액션은 종료되었습니다."
                  + " 되돌리려면 가설 목록에서 [Screen으로 되돌리기]를 누르세요.");
        return;
      }
      try {
        await api("/hypotheses/transition", {
          method: "POST", body: JSON.stringify({ ids: [hypId], to: back.to }),
        });
      } catch (e2) {
        onDecided(`기각으로 기록되었습니다 — 다만 ${back.ko} 되돌리기는 실패했습니다: ${errText(e2)}`
                  + " 가설 목록에서 다시 되돌릴 수 있습니다.");
        return;
      }
      onDecided(`기각으로 기록되고 ${back.ko}으로 되돌렸습니다 — 열린 액션은 종료되었고, `
                + "외부 근거 검토 서명은 비워졌습니다. 근거가 다시 쌓이면 새 서명으로 상정합니다.");
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  }

  // 페르소나 × 입장 매트릭스 — 코드 집계다 (LLM에게 묻지 않는다, 절대 규칙 #1)
  const experts = Array.from(new Set(
    minutes
      .filter((m) => m.stance && m.persona !== "ORCHESTRATOR" && m.persona !== "CEO")
      .map((m) => m.persona),
  ));
  const matrix = experts.map((p) => {
    const opening = minutes.find((m) => m.persona === p && m.turnType === "OPENING")?.stance ?? null;
    const turns = minutes.filter((m) => m.persona === p && m.stance);
    const final = turns.length ? turns[turns.length - 1].stance : null;
    return { p, opening, final };
  });

  return (
    <Panel as="section" active pad="lg" className="mt-8">
      <Eyebrow>HUMAN DECISION · 판정 기록 · 후속 액션 확정</Eyebrow>
      <h2 className="mt-2 text-[1.0625rem] font-bold leading-[1.3] tracking-tight text-navy">액션 결정</h2>
      {verdictKo ? (
        <p className="mt-1.5 max-w-[70ch] text-[0.9375rem] leading-[1.7] text-body">
          의장 판정은 <b className="font-medium text-navy">{verdictKo}</b>입니다. 이 판정을 기록하고
          현장에 내릴 후속 액션을 확정합니다.
        </p>
      ) : (
        <p className="mt-1.5 max-w-[70ch] text-[0.9375rem] leading-[1.7] text-body">
          의장 판정 기록을 찾지 못했습니다 — 기록할 상태를 직접 고르세요.
        </p>
      )}
      {rec && (
        <p className="mono mt-2 text-[0.75rem] leading-[1.7] text-muted">
          CEO 판정 {REC_KO[rec] ?? rec} → 가설 상태 {DECISION_KO[mapped]} 매핑 · 기록은 사람이 합니다
        </p>
      )}

      {/* 매트릭스 */}
      <div className="mt-4">
        <Eyebrow>참석자 × 입장 — 모두발언에서 최종 입장까지</Eyebrow>
        <TableFrame className="mt-2.5">
          <thead>
            <tr>
              <th className={TH}>참석자</th>
              <th className={TH}>모두발언</th>
              <th className={TH}></th>
              <th className={TH}>최종 입장</th>
            </tr>
          </thead>
          <tbody>
            {matrix.length === 0 ? (
              <tr>
                <td className={cx(TD, "text-muted")} colSpan={4}>기록된 입장이 없습니다.</td>
              </tr>
            ) : (
              matrix.map((r) => (
                <tr key={r.p}>
                  <td className={cx(TD, "mono whitespace-nowrap font-medium text-navy")}>{pLabel(r.p)}</td>
                  <td className={cx(TD, "whitespace-nowrap")}><StanceTag stance={r.opening} /></td>
                  <td className={cx(TD, "mono whitespace-nowrap text-faint")}>
                    {r.opening && r.final && r.opening !== r.final ? "→ 변경" : "→"}
                  </td>
                  <td className={cx(TD, "whitespace-nowrap")}><StanceTag stance={r.final} /></td>
                </tr>
              ))
            )}
          </tbody>
        </TableFrame>
      </div>

      {/* 액션 채택 — 기각이면 그 자리가 「되돌릴 곳」이 된다 (08/31) */}
      <div className="mt-5">
        <SectionHead
          title={takesActions ? "액션 채택" : "기각의 다음 걸음"}
          dot="orange"
          right={takesActions ? "확정과 함께 저장된 것만 ACTIVE가 됩니다" : "승인만이 끝입니다 — 기각은 되돌아갑니다"}
        />
        {!takesActions ? (
          <>
            <Panel tone="note" pad="sm" className="mt-2.5 text-[0.875rem] leading-[1.7] text-body">
              기각은 후속 액션을 두지 않습니다 — 이 가설의 열린 액션도 함께 종료됩니다.
              대신 <b className="font-medium text-navy">어디로 되돌릴지</b>를 함께 정합니다.
            </Panel>
            <ul className="mt-2.5 flex flex-col gap-2">
              {(["SCREEN_QUEUED", "DRAFT", "NONE"] as const).map((k) => {
                const o = REJECT_NEXT[k];
                const on = rejectNext === k;
                return (
                  <li key={k}>
                    <label
                      className={cx(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
                        on ? "border-navy/40 bg-fill-1" : "border-glass-line bg-card hover:bg-fill-1",
                      )}
                    >
                      <input
                        type="radio" name="rejectNext" className="mt-1" checked={on}
                        onChange={() => setRejectNext(k)}
                      />
                      <span className="min-w-0">
                        <b className="text-[0.9375rem] font-medium text-navy">{o.btnKo}</b>
                        <span className="mt-0.5 block text-[0.875rem] leading-[1.7] text-muted">
                          {o.noteKo}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mono mt-2.5 text-[0.75rem] leading-[1.7] text-faint">
              기각을 기록한 뒤 이어서 되돌립니다 — 결정 이력에는 기각 한 줄이 그대로 남습니다.
            </p>
          </>
        ) : (
          <>
            {card.kind === "DEVELOPMENT" && (
              <Panel tone="note" pad="sm" className="mt-2.5 text-[0.875rem] leading-[1.7] text-body">
                <b className="font-medium text-navy">허가 범위 밖</b> — 전문조직 검토 대상으로만 전달됩니다
                (절대 규칙 #5 · 상업 액션 연결 차단).
              </Panel>
            )}
            {rows.length === 0 ? (
              <p className="mt-2.5 text-[0.875rem] text-muted">
                제안된 액션이 없습니다 — 판정만 기록할 수 있습니다.
              </p>
            ) : (
              <ul className="mt-2.5 flex flex-col gap-2">
                {rows.map((r) => (
                  <li
                    key={r.key}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-glass-line bg-card px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={() => patch(r.key, { checked: !r.checked })}
                      aria-label="이 액션을 채택"
                    />
                    <input
                      value={r.directiveKo}
                      onChange={(e) => patch(r.key, { directiveKo: e.target.value })}
                      className={cx(FIELD, "min-w-56 flex-1")}
                    />
                    <select
                      value={r.target}
                      onChange={(e) => patch(r.key, { target: e.target.value })}
                      className={FIELD}
                    >
                      {Object.entries(TARGET_KO).map(([v, ko]) => (
                        <option key={v} value={v}>{ko}</option>
                      ))}
                    </select>
                    {/* 전달 대상 옆에 **어느 전문과로 가는지** — 지시는 근거가 나온 자리로 돌아간다.
                        책상 업무(전문조직·의학정보)는 방문에 붙지 않으므로 이 표시가 없다. */}
                    {r.target === "FIELD_CHECKLIST" && (
                      <span
                        className="mono whitespace-nowrap rounded-lg border border-line bg-card px-2 py-0.5 text-[0.75rem] text-muted"
                        title="이 가설의 근거가 나온 전문과입니다"
                      >
                        → {knownSpecialty ? specialtyKo(knownSpecialty) : "근거 전문과"}
                      </span>
                    )}
                    <select
                      value={r.ownerRole}
                      onChange={(e) => patch(r.key, { ownerRole: e.target.value })}
                      className={FIELD}
                    >
                      {Object.entries(OWNER_KO).map(([v, ko]) => (
                        <option key={v} value={v}>{ko}</option>
                      ))}
                    </select>
                    <span className="mono whitespace-nowrap text-[0.75rem] text-faint">{r.sourceKo}</span>
                    {/* 받을 권역 — 현장에 내려가는 줄에만 있다. 책상 업무(전문조직·의학정보)는
                        방문에 붙지 않으므로 권역이 의미가 없다 (08/28). */}
                    {r.target === "FIELD_CHECKLIST" && (
                      <span className="flex w-full flex-wrap items-center gap-1.5 border-t border-glass-line pt-2">
                        <span className="mono text-[0.75rem] text-muted">받을 권역</span>
                        {REGIONS.map((rg) => (
                          <Button
                            key={rg}
                            type="button"
                            size="sm"
                            variant={r.regions.includes(rg) ? "default" : "outline"}
                            onClick={() => toggleRegion(r.key, rg, r.regions)}
                          >
                            {rg}
                          </Button>
                        ))}
                        <span className="mono text-[0.75rem] text-faint">
                          {r.regions.length ? `${r.regions.join("·")} 담당자에게만` : "비우면 서버가 계산"}
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {hasChecklist && !knownSpecialty && (
              <p className="mono mt-2.5 text-[0.75rem] leading-[1.7] text-faint">
                현장 체크리스트가 어느 전문과의 방문에 붙는지는 저장할 때 근거 면담에서 SQL로 계산됩니다.
              </p>
            )}
            {hasChecklist && (
              <p className="mono mt-2.5 text-[0.75rem] leading-[1.7] text-faint">
                현장 지시는 권역 담당자에게만 내려갑니다 — 줄마다 권역을 고르고, 비워 두면
                근거가 나온 권역을 서버가 계산합니다.
              </p>
            )}
          </>
        )}
      </div>

      {/* 의장 서명·근거 */}
      <div className="mt-5 grid gap-3 md:grid-cols-[13rem_1fr]">
        <label className="flex flex-col gap-1.5" title="판정을 내린 의장의 이름 — 결정 이력에 그대로 남습니다">
          <Eyebrow>의장 서명</Eyebrow>
          <input
            value={decidedBy}
            placeholder="CEO"
            onChange={(e) => setDecidedBy(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Eyebrow>결정 근거 — CEO 판정 요지가 채워져 있습니다. 사람의 말로 다듬으세요</Eyebrow>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={3}
            className={cx(FIELD, "leading-[1.7]")}
          />
        </label>
      </div>

      {err && (
        <Panel tone="note" pad="sm" className="mt-3 text-[0.875rem] leading-[1.7] text-rust">
          {err}
        </Panel>
      )}

      {/* 주 버튼은 하나다 — 판정이 이미 답한 질문을 다시 묻지 않는다 */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          variant={takesActions ? "default" : "destructive"}
          size="lg"
          onClick={() => decide(mapped, takesActions ? undefined : REJECT_NEXT[rejectNext])}
          disabled={!!busy || !decidedBy.trim()}
        >
          {busy === mapped ? "기록 중…" : primaryLabel}
        </Button>
        {!showAlt && (
          <button
            type="button"
            onClick={() => setShowAlt(true)}
            className="mono text-[0.8125rem] text-muted underline underline-offset-4 hover:text-navy"
          >
            판정과 다르게 기록
          </button>
        )}
      </div>

      {showAlt && (
        <div className="mt-3 rounded-xl border border-line bg-card px-3.5 py-3">
          <Eyebrow>판정과 다르게 기록</Eyebrow>
          <p className="mt-1.5 text-[0.875rem] leading-[1.7] text-muted">
            의장 판정과 다른 상태로 남깁니다 — 왜 다른지 결정 근거에 적어 두세요.
            기각을 고르면 채택한 액션은 저장되지 않고, <b className="font-medium text-navy">기록만</b> 합니다 —
            되돌리기는 가설 목록에서 하세요.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {others.map((d) => (
              <Button
                key={d}
                variant="outline"
                onClick={() => decide(d)}
                disabled={!!busy || !decidedBy.trim()}
              >
                {busy === d ? "기록 중…" : RECORD_KO[d]}
              </Button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-2.5 text-[0.875rem] leading-[1.7] text-muted">
        기각하면 이 가설의 열린 액션이 종료되고, 위에서 고른 단계로 되돌아갑니다 —
        Screen으로 되돌리면 외부 근거 검토 서명이 비워져 새 근거를 읽은 사람이 다시 서명해야 합니다.
        보류는 열린 액션을 그대로 두고 보강 액션을 더하며, 근거가 쌓이면 2차 심의로 올립니다.
      </p>
    </Panel>
  );
}

/* 회의 정보 — 회의록의 머리말이다 (08/28 팀장 요청).

   사내 심의 회의록은 "어느 회의의 · 언제 · 누가 · 어떤 권한으로 내린 결정인가"를 머리에
   고정한다. 그게 감사 추적의 첫 줄이라서다. 여기 값은 **전부 서버가 준 것**이고,
   없는 값은 줄 자체를 그리지 않는다 — 회의록에 지어낸 칸이 하나라도 있으면 나머지
   값도 못 믿게 된다 (절대 규칙 #1).

   장소·서명·보존기간·이해상충처럼 이 시스템에 실체가 없는 항목은 애초에 두지 않았다.
   불참자도 두지 않는다 — AI에게 결석은 없고, 안 부른 것은 소집 매트릭스의 결과이므로
   "미소집(사유: 소집 매트릭스)"으로 적는다. 그게 정직하고, 코드가 소집을 확정한다는
   이 제품의 주장과도 맞는다. */
function MinutesHeader({ hypId, snap }: { hypId: string; snap: Snapshot | null }) {
  if (!snap) return null;
  const rows: [string, React.ReactNode][] = [];
  if (snap.meetingNo) rows.push(["회의번호", snap.meetingNo]);
  rows.push(["안건번호", hypId]);
  if (snap.convenedAtKst) rows.push(["개회 일시", `${snap.convenedAtKst} KST`]);
  if (snap.closedAtKst) rows.push(["폐회 일시", `${snap.closedAtKst} KST`]);
  if (snap.roundNo) rows.push(["회차", `${snap.roundNo}차 심의`]);
  if (snap.urgency) {
    rows.push(["심의 유형", snap.urgency === "HIGH" ? "긴급 심의 · 안전성 신호" : "통상 심의"]);
  }
  if (snap.convenedPersonas.length) {
    rows.push(["참석자",
      `${snap.convenedPersonas.map(pLabel).join(" · ")} (${snap.convenedPersonas.length}인)`]);
  }
  if (snap.leadExpert) {
    rows.push(["주무", (
      <>
        {pLabel(snap.leadExpert)}
        {snap.leadRationaleKo && <span className="text-muted"> — {snap.leadRationaleKo}</span>}
      </>
    )]);
  }
  if (snap.notConvened?.length) {
    rows.push(["미소집", `${snap.notConvened.map(pLabel).join(" · ")} — 사유: 소집 매트릭스`]);
  }
  if (snap.quorumOk !== null && snap.quorumOk !== undefined) {
    rows.push(["정족수", snap.quorumOk ? "충족" : "미충족"]);
  }
  // 안건번호 한 줄만 남으면 머리말이라 부를 것이 없다 — 카드를 세우지 않는다
  if (rows.length <= 1) return null;

  return (
    <Panel tone="note" pad="md" className="mt-4">
      <Eyebrow>MINUTES · 회의 정보</Eyebrow>
      <dl className="mt-3 grid gap-x-7 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 border-b border-line pb-1.5">
            <dt className="mono w-[4.6rem] flex-none pt-1 text-[0.75rem] uppercase tracking-[0.12em] text-faint">
              {k}
            </dt>
            <dd className="min-w-0 flex-1 text-[0.875rem] leading-[1.7] text-navy">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mono mt-3 text-[0.75rem] leading-[1.7] text-faint">
        AI 심의 기록 — 가설 상태를 바꾸지 않습니다. 승인·보류·기각은 사람의 결정만 기록합니다.
      </p>
    </Panel>
  );
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export default function BoardRoom({ hypId }: { hypId: string }) {
  const router = useRouter();
  const [card, setCard] = useState<Card | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [minutes, setMinutes] = useState<Minute[]>([]);
  const [runNote, setRunNote] = useState<string | null>(null);   // RUN 이벤트 최신 메시지
  const [polling, setPolling] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [decisionNote, setDecisionNote] = useState<string | null>(null);
  const lastSeq = useRef(0);

  /* 재생 큐 — cursor번째 턴을 "인디케이터 → 타이프라이터 → 완료" 순으로 연출한다.
     단계를 따로 state로 두지 않고 **드러난 글자 수 하나로 파생**시킨다:
       chars < 0            타이핑 인디케이터
       0 ≤ chars < 전체길이  타이프라이터 진행 중
       chars ≥ 전체길이      발언 완료 (부가 구조를 함께 편다)
     단계 state를 따로 두면 "효과 안에서 setState → 단계 전환"이 생기고, 그건 React
     19 규칙(react-hooks/set-state-in-effect)에 걸린다. 상태를 하나로 줄이면 전환이
     전부 타이머 콜백 안에서만 일어난다. flush면 이 큐를 건너뛰고 전체를 편다. */
  const [cursor, setCursor] = useState(0);
  const [chars, setChars] = useState(-1);
  const [flushed, setFlushed] = useState(false);
  /* 재생 속도 — 시연에서 28턴을 실시간으로 다 보고 있을 수는 없다. 타이프라이터 속도와
     발언 사이 간격에 함께 나눠 곱한다 (demo/ai-board-demo.html의 속도 토글 이식, 08/28). */
  const [speed, setSpeed] = useState(1);
  /* 일시정지 — 08/31 신설. 그전에는 재생을 멈출 방법이 [전체 보기](= 연출을 통째로 버림)
     하나뿐이었다. 읽다가 손을 들 자리가 없으면 사람은 화면을 신뢰하지 못하고 서둘러 읽는다. */
  const [paused, setPaused] = useState(false);
  /* 접힌 턴 — seq 집합. **기본은 펴진 상태**다 (안 A: 접는 것은 사람의 행위).
     지난 회의록을 열람으로 열 때만 화면이 먼저 전부 접어 둔다 (그때는 읽을 문서이지
     따라갈 회의가 아니다). */
  const [folded, setFolded] = useState<Set<number>>(() => new Set());
  /** 「요지만 보기」는 **모드다** — 그 뒤에 도착하는 발언도 끝나면 접힌다 (09/01 팀장 보고:
   *  "움직이는 동안은 요지만 보기 전문 펼치기가 잘 안 되네").
   *
   *  그전에는 누르는 **순간 나와 있던 턴만** 접고 끝났다. 회의가 계속 도니까 다음 발언이
   *  펴진 채 도착하고, 그러면 「전부 접혔나」가 다시 거짓이 되어 라벨이 되돌아간다 —
   *  사람 눈에는 눌렀는데 안 먹은 것으로 보인다. 따라가기와 같은 종류의 사고다:
   *  **사람이 명시한 뜻을 자동 동작이 지운다.** 그러니 뜻을 기억한다.
   *  (접히는 것은 발언이 **끝난 뒤**다 — 흐르는 동안에는 그대로 흐른다. 안 A 그대로.)
 */
  const [foldMode, setFoldMode] = useState(false);
  /* 스크롤 따라가기 — ref 하나로만 들고 있으면 사람이 «지금 따라가는 중인가»를 알 수 없다.
     판정은 여전히 ref가 쥐고(스크롤 핸들러가 매 프레임 읽는다), state는 그것을 화면에 비춘다. */
  const [followOn, setFollowOn] = useState(true);
  const follow = useRef(true);
  const selfScrollUntil = useRef(0);
  /** 사람이 [따라가기]를 **손으로 껐다** — 스크롤이 이것을 되살리지 않는다 (09/01).
   *  그전에는 바닥 근처로만 가면 다시 켜졌다. 스크롤바를 끌어 내리거나 [전체 보기] 뒤
   *  끝으로 가기만 해도 «껐는데 다시 켜지는» 일이 났다 — 사람이 명시한 뜻이 우연한
   *  스크롤에 지워지면 그 버튼은 신뢰를 잃는다. 다시 켜는 것도 사람의 손으로만 한다. */
  const followLocked = useRef(false);
  /** 따라가기를 끈 뒤로 화면에 새로 들어온 발언 수 — 「새 발언 N건 ↓」의 근거 */
  const followOffAt = useRef<number | null>(null);

  const loadCard = useCallback(() => {
    api<Card>(`/hypotheses/${hypId}`).then(setCard).catch((e) => setLoadErr(errText(e)));
  }, [hypId]);

  const applySnapshot = useCallback((s: Snapshot, reset = false) => {
    setSnap(s);
    // 다음 폴링의 기준점은 **받은 이벤트의 최대 seq**다. s.lastSeq를 그대로 쓰면
    // 한 번에 돌려주는 상한(서버 MAX_EVENTS_PER_POLL)을 넘겼을 때 못 받은 턴을
    // 건너뛴다 — 회의록에 구멍이 뚫린다 (08/27 전임자 잔해에서 고침).
    lastSeq.current = s.events.length
      ? Math.max(...s.events.map((e) => e.seq))
      : Math.max(lastSeq.current, reset ? s.lastSeq : lastSeq.current);
    const turns = s.events
      .filter((e) => e.kind === "TURN" && e.minute)
      .map((e) => e.minute!);
    const runs = s.events.filter((e) => e.kind === "RUN" && e.messageKo);
    if (runs.length) setRunNote(runs[runs.length - 1].messageKo ?? null);
    if (reset) {
      setMinutes(turns);
      return;
    }
    if (!turns.length) return;
    // 같은 턴이 두 번 들어오는 일은 없어야 하지만, 들어와도 회의록이 겹쳐 보이지는 않게
    setMinutes((prev) => {
      const seen = new Set(prev.map((m) => m.seq));
      const fresh = turns.filter((m) => !seen.has(m.seq));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  /* 마운트: 카드 + 스냅샷 1회 — running이면 폴링 시작 (pipeline 선례의 seq 계약).

     **이미 폐회한 회의는 열람으로 연다** (08/31). 그전에는 끝난 회의도 주소로 열 때마다
     처음부터 연출 재생이었다 — 시연에서는 그게 맞지만, 결정을 내리려고 회의록을 다시
     펼치는 사람에게는 28턴을 기다리게 하는 일이다. 라이브 소집([심의 시작]·[재심의])은
     그대로 재생이고, 데모 ⑤는 항상 라이브 소집이라 각본이 바뀌지 않는다.
     상단 [처음부터 재생]으로 언제든 연출로 되돌린다. */
  useEffect(() => {
    let cancelled = false;
    loadCard();
    (async () => {
      try {
        const s = await api<Snapshot>(`/hypotheses/${hypId}/board?after=0`);
        if (cancelled) return;
        applySnapshot(s, true);
        if (s.running) { setPolling(true); return; }
        const seqs = s.events.filter((e) => e.kind === "TURN" && e.minute).map((e) => e.minute!.seq);
        if (seqs.length) { setFlushed(true); setFolded(new Set(seqs)); }
      } catch (e) {
        if (!cancelled) setLoadErr(errText(e));
      }
    })();
    return () => { cancelled = true; };
  }, [hypId, loadCard, applySnapshot]);

  // 폴링 — 1200ms, cancelled 가드·cleanup 필수 (pipeline/page.tsx 원본 패턴)
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await api<Snapshot>(`/hypotheses/${hypId}/board?after=${lastSeq.current}`);
        if (cancelled) return;
        applySnapshot(s);
        if (!s.running) {
          setPolling(false);
          loadCard();   // 심의 종료 — strategicProposals·decisions 반영분 재조회
        }
      } catch {
        /* 일시 오류는 다음 틱에 재시도 — 화면을 깨뜨리지 않는다 */
      }
    };
    tick();
    const t = setInterval(tick, 1200);
    return () => { cancelled = true; clearInterval(t); };
  }, [polling, hypId, applySnapshot, loadCard]);

  /* 인디케이터 0.8~1.2s → 타이프라이터 → 500ms 쉬고 다음 턴.
     빈 발언(모델이 문자열을 비워 보낸 경우)은 chars 0 ≥ 길이 0 이라 곧바로 다음 턴으로
     넘어간다 — 타이머가 영원히 도는 자리가 없다 (08/27 전임자 잔해에서 고침).

     **08/31: 버블당 3초 정률 상한을 길이 비례로 바꿨다.** 그전에는 `step = len/150`이라
     발언이 길수록 글자가 더 빨리 튀어나왔다 — 긴 CEO 판정문이 가장 빠르게 지나가는,
     읽기와 정반대인 페이싱이었다. 이제 글자당 18ms로 흐르고 1.2~6초로만 자른다:
     짧은 발언은 여전히 툭 들어오고, 긴 발언은 실제로 길게 흐른다. */
  useEffect(() => {
    if (paused || flushed || cursor >= minutes.length) return;
    const full = minutes[cursor].utteranceKo ?? "";
    if (chars < 0) {
      const t = setTimeout(() => setChars(0), (800 + Math.random() * 400) / speed);
      return () => clearTimeout(t);
    }
    if (chars < full.length) {
      const dur = Math.min(6000, Math.max(1200, full.length * 18));
      const step = Math.max(1, Math.ceil(full.length / (dur / 20)));
      const t = setTimeout(() => setChars((c) => Math.min(full.length, c + step)), 20 / speed);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      // 「요지만 보기」가 켜져 있으면 방금 끝난 발언도 접는다 — 사람이 그렇게 말했다
      const done = minutes[cursor];
      if (foldMode && done && foldableTurn(done)) {
        setFolded((prev) => (prev.has(done.seq) ? prev : new Set(prev).add(done.seq)));
      }
      setCursor((c) => c + 1);
      setChars(-1);
    }, 500 / speed);
    return () => clearTimeout(t);
  }, [paused, flushed, cursor, chars, minutes, speed, foldMode]);

  async function startMeeting() {
    setStarting(true);
    setStartErr(null);
    try {
      // 캐시를 무시하고 새로 묻고 싶으면 `?refresh=true` — 실호출 비용이 붙으므로
      // 화면 버튼은 기본(캐시 재생)만 연다. 재심의는 회의록을 통째로 교체한다.
      await api(`/hypotheses/${hypId}/board`, { method: "POST" });
      lastSeq.current = 0;
      setMinutes([]); setRunNote(null); setDecisionNote(null);
      resetPlayback();
      setPolling(true);
    } catch (e) {
      setStartErr(errText(e));
    } finally {
      setStarting(false);
    }
  }

  const running = snap?.running ?? false;
  const playbackDone = flushed || cursor >= minutes.length;
  const visible = flushed ? minutes : minutes.slice(0, cursor);
  const active = !flushed && cursor < minutes.length ? minutes[cursor] : null;
  const lead = snap?.leadExpert ?? null;

  /* 재생 단계는 state가 아니라 chars에서 파생한다 (위 주석의 규칙 그대로) —
     단계를 따로 들고 있으면 효과 안에서 상태를 옮기게 되고 React 19 규칙에 걸린다. */
  const stage: "dots" | "typing" | "done" =
    chars < 0 ? "dots"
    : chars >= (active?.utteranceKo ?? "").length ? "done"
    : "typing";

  /* 소집 무대가 도는 동안은 레일을 비워 둔다 — 참석자는 그 서사가 밝히는 것이지
     미리 다 보이면 4막이 김빠진다 (08/27 시연 피드백). 재생이 아직 첫 턴에 닿지
     않았고 회의가 막 시작된 상태를 '소집 중'으로 본다. */
  const convening = minutes.length > 0 && cursor === 0 && !flushed;

  /* 스크롤이 최신 발언을 따라간다 (demo/ai-board-demo.html의 anchorTo 이식, 08/28).

     두 가지 규칙만 지킨다.
       1) 새 발언의 **머리**로 띄운다 — 바닥으로 보내면 긴 판정문의 마지막 줄만 보인다.
       2) 사람이 위로 올려 읽고 있으면 따라가지 않는다 (흔한 채팅 UI 규칙). 바닥 근처로
          돌아오면 다시 따라간다.
     우리가 옮긴 스크롤도 scroll 이벤트를 낸다 — 그걸 사람의 뜻으로 읽으면 카드 머리로
     띄운 직후 "바닥이 아니다"가 되어 추적이 스스로 꺼진다. 그래서 잠깐(0.9초) 우리 몫으로
     표시해 두고, 그 사이라도 휠·터치가 오면 사람에게 주도권을 돌려준다. */
  const liveRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const anchorTo = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    selfScrollUntil.current = Date.now() + 900;
    // 고정바 두 겹(Topbar 58 + 단계 막대)만큼 띄운다 — 그만큼 안 띄우면 머리줄이 바 밑에 깔린다
    const top = el.getBoundingClientRect().top + window.scrollY - 152;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  /* 따라가기 켜기·끄기를 **한 자리에서** 한다 — ref(판정)와 state(표시)가 갈리면
     버튼을 눌렀는데 화면 표시만 바뀌는 사고가 난다.
     `byHuman` 은 «사람이 손으로 정했다»는 표시다 (버튼·pill). 손으로 끈 것은 잠기고,
     스크롤이 바닥 근처로 돌아와도 되살아나지 않는다 — 아래 onScroll 참조. */
  const setFollow = useCallback((on: boolean, byHuman = false) => {
    follow.current = on;
    setFollowOn(on);
    if (byHuman) followLocked.current = !on;
    followOffAt.current = on ? null : (followOffAt.current ?? Date.now());
  }, []);

  useEffect(() => {
    const nearBottom = () =>
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 220;
    const onScroll = () => {
      if (Date.now() < selfScrollUntil.current) return;
      const on = nearBottom();
      // 손으로 꺼 둔 것은 스크롤이 되살리지 않는다. 끄는 쪽으로는 언제나 반응한다 —
      // 위로 올려 읽기 시작하면 따라가기를 멈추는 것이 채팅 UI의 관례다.
      if (on && followLocked.current) return;
      if (on !== follow.current) setFollow(on);
    };
    /* 사람이 화면을 잡았다 — 우리가 옮긴 스크롤이라는 표시를 즉시 내린다.
       `pointerdown` 이 있어야 **스크롤바를 끄는 것**도 잡힌다: 휠·터치만 보면
       스크롤바 드래그는 «우리가 옮긴 것»으로 남아, 사람이 끌어 올리는 동안 다음 틱이
       도로 바닥으로 끌어내린다 (09/01). */
    const onUser = () => { selfScrollUntil.current = 0; };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onUser, { passive: true });
    window.addEventListener("touchmove", onUser, { passive: true });
    window.addEventListener("pointerdown", onUser, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onUser);
      window.removeEventListener("touchmove", onUser);
      window.removeEventListener("pointerdown", onUser);
    };
  }, [setFollow]);

  /* 접기·펼치기는 **스크롤을 같은 자리에 붙들고** 일어난다 (팀장 선택의 C 몫).
     높이가 줄면 그 아래 있던 글이 위로 밀려 올라와, 접은 사람이 읽던 자리를 잃는다 —
     접기 전 그 카드의 화면상 위치를 재 두고, 커밋 뒤 그만큼 스크롤을 되돌린다. */
  const foldWithAnchor = useCallback((el: HTMLElement | null, fn: () => void) => {
    const before = el?.getBoundingClientRect().top ?? null;
    fn();
    if (before === null || !el) return;
    requestAnimationFrame(() => {
      const after = el.getBoundingClientRect().top;
      const dy = after - before;
      if (Math.abs(dy) < 1) return;
      selfScrollUntil.current = Date.now() + 400;
      window.scrollBy({ top: dy });
    });
  }, []);

  /** 한 턴을 접거나 편다 — 누른 버튼이 속한 카드를 앵커로 쓴다 */
  const toggleFold = useCallback((seq: number) =>
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const card = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-turn]");
      foldWithAnchor(card, () => setFolded((prev) => {
        const next = new Set(prev);
        if (next.has(seq)) next.delete(seq); else next.add(seq);
        return next;
      }));
    }, [foldWithAnchor]);

  useEffect(() => {
    if (flushed || !follow.current) return;
    anchorTo(liveRef.current);
  }, [cursor, flushed, anchorTo]);


  // ── 재생 컨트롤 (08/31) ──────────────────────────────────────────────────
  const playing = !flushed && minutes.length > 0 && cursor < minutes.length;
  /** 화면에 이미 다 나온 턴 중 접을 것이 있는 것 — [요지만 보기]가 세는 모집단 */
  const foldables = (flushed ? minutes : minutes.slice(0, cursor)).filter(foldableTurn);
  const foldedAll = foldables.length > 0 && foldables.every((m) => folded.has(m.seq));

  const foldAllRef = useRef<HTMLDivElement>(null);
  /** 「요지만 보기」는 **모드다** — 그 뒤에 도착하는 발언도 끝나면 접힌다 (09/01 팀장 보고:
   *  "움직이는 동안은 요지만 보기 전문 펼치기가 잘 안 되네").
   *
   *  그전에는 누르는 **순간 나와 있던 턴만** 접고 끝났다. 회의가 계속 도니까 다음 발언이
   *  펴진 채 도착하고, 그러면 「전부 접혔나」가 다시 거짓이 되어 라벨이 되돌아간다 —
   *  사람 눈에는 눌렀는데 안 먹은 것으로 보인다. 따라가기와 같은 종류의 사고다:
   *  **사람이 명시한 뜻을 자동 동작이 지운다.** 그러니 뜻을 기억한다.
   *  (접히는 것은 발언이 끝난 뒤다 — 흐르는 동안에는 그대로 흐른다. 안 A 그대로.) */
  const foldAll = useCallback(() => {
    // 여러 카드가 한꺼번에 접히므로 앵커는 «지금 화면 맨 위에 걸린 카드»로 잡는다
    const cards = foldAllRef.current?.querySelectorAll<HTMLElement>("[data-turn]") ?? [];
    const anchor = Array.from(cards).find((el) => el.getBoundingClientRect().bottom > 160) ?? null;
    foldWithAnchor(anchor, () => setFolded((prev) => {
      const seqs = (flushed ? minutes : minutes.slice(0, cursor)).filter(foldableTurn);
      const all = seqs.length > 0 && seqs.every((m) => prev.has(m.seq));
      setFoldMode(!all);                // 편 것이면 모드도 끈다
      if (all) {
        const next = new Set(prev);
        seqs.forEach((m) => next.delete(m.seq));
        return next;
      }
      return new Set([...prev, ...seqs.map((m) => m.seq)]);
    }));
  }, [foldWithAnchor, flushed, minutes, cursor]);

  /** 한 턴 건너뛴다 — 지금 발언을 다 채운 뒤 다음으로 (읽던 문장을 잘라 버리지 않는다) */
  const nextTurn = useCallback(() => {
    setPaused(false);
    setCursor((c) => {
      const done = minutes[c];
      if (foldMode && done && foldableTurn(done)) {
        setFolded((prev) => (prev.has(done.seq) ? prev : new Set(prev).add(done.seq)));
      }
      return Math.min(minutes.length, c + 1);
    });
    setChars(-1);
  }, [minutes, foldMode]);

  /** 남은 발언을 한 번에 편다 — 「요지만 보기」가 켜져 있으면 접힌 채로 선다 */
  const flushAll = useCallback(() => {
    if (foldMode) {
      setFolded((prev) => new Set([...prev, ...minutes.filter(foldableTurn).map((m) => m.seq)]));
    }
    setFlushed(true);
  }, [minutes, foldMode]);

  /** 회의록을 대화가 벌어진 순서로 다시 재생한다 — 서버를 다시 부르지 않는다 */
  /** 재생 상태를 처음으로 되돌린다 — [재심의]와 [처음부터 재생]이 함께 쓴다.
   *  ref 를 만지는 자리를 한 곳으로 모아 둔다 (효과가 읽는 값을 렌더 본문에서 고치면
   *  React 컴파일러 규칙에 걸린다). */
  const resetPlayback = useCallback(() => {
    setFolded(new Set());
    setFoldMode(false);
    setFlushed(false); setPaused(false);
    setCursor(0); setChars(-1);
    setFollow(true, true);
  }, [setFollow]);

  /** 회의록을 대화가 벌어진 순서로 다시 재생한다 — 서버를 다시 부르지 않는다 */
  const replay = resetPlayback;

  /* 키보드 — 회의를 «읽는» 화면이므로 손이 마우스를 떠나 있다 (08/31).
     입력 칸(의장 서명·결정 근거) 안에서는 삼키지 않는다. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (e.code === "Space" && playing) { e.preventDefault(); setPaused((p) => !p); return; }
      if ((k === "j" || e.key === "ArrowDown") && playing) { e.preventDefault(); nextTurn(); return; }
      if (k === "f" && playing) { e.preventDefault(); flushAll(); return; }
      if (k === "e") { e.preventDefault(); foldAll(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, nextTurn, foldAll, flushAll]);

  // 참석자 레일의 stance는 "화면에 이미 나온 발언"까지만 — 연출과 어긋나지 않게
  const shown = flushed
    ? minutes
    : minutes.slice(0, cursor + (active && stage !== "dots" ? 1 : 0));
  const stanceOf = (p: string): { stance: Stance | null; changed: boolean } => {
    const turns = shown.filter((m) => m.persona === p && m.stance);
    const last = turns.length ? turns[turns.length - 1] : null;
    return { stance: last?.stance ?? null, changed: !!last?.stanceChanged };
  };

  const rail: string[] = [...(snap?.convenedPersonas ?? [])];
  if (rail.length && !rail.includes("CEO")) rail.push("CEO");

  // Phase 스테퍼 — 재생 중에는 화면에 나온 턴 기준, 재생이 끝나면 서버 phase 기준
  const shownPhase = shown.length ? Math.max(...shown.map((m) => m.phaseNo ?? 0)) : null;
  const currentPhase = playbackDone ? (snap?.phaseNo ?? shownPhase) : shownPhase;

  const decidedStatus = ["APPROVED", "HOLD", "REJECTED"].includes(card?.status ?? "");
  const humanDecided = decidedStatus || (card?.decisions?.length ?? 0) > 0;
  const meetingComplete = !running && minutes.some((m) => m.turnType === "DECISION");
  const showDecisionPanel =
    card?.status === "IN_REVIEW" && meetingComplete && playbackDone && !humanDecided;

  // 사람 차례가 열리는 순간은 그 자리로 옮겨 준다 — 재생을 따라오던 사람에게만
  const panelOpen = (!!snap?.awaitingVerdict && playbackDone && !running) || showDecisionPanel;
  useEffect(() => {
    if (panelOpen && follow.current) anchorTo(panelRef.current);
  }, [panelOpen, anchorTo]);

  // running 중 큐가 빈 동안의 대기 인디케이터 라벨 — speakingOrder·phase로 추정
  const waitingLabel = (() => {
    if (!running) return null;
    const order = snap?.speakingOrder ?? [];
    const phase = snap?.phaseNo ?? 0;
    if (phase === 1 || phase === 3) {
      const want = phase === 1 ? "OPENING" : "FINAL";
      const done = minutes.filter((m) => m.turnType === want).length;
      if (done < order.length && order[done]) return `${pLabel(order[done])} 발언 작성 중…`;
    }
    if (phase === 4) return "CEO가 판정문을 작성 중…";
    if (phase === 5) return "간사가 회의록을 정리하는 중…";
    return "간사 진행 중…";
  })();

  // 대기 중인 사람 — 아바타를 함께 띄워 "누구를 기다리는가"를 눈으로 보이게
  const waitingPersona = (() => {
    if (!running) return null;
    const phase = snap?.phaseNo ?? 0;
    if (phase === 4) return "CEO";
    if (phase === 5 || phase === 2 || phase === 0) return "ORCHESTRATOR";
    const order = snap?.speakingOrder ?? [];
    const want = phase === 1 ? "OPENING" : phase === 3 ? "FINAL" : null;
    if (!want) return "ORCHESTRATOR";
    const done = minutes.filter((m) => m.turnType === want).length;
    return order[done] ?? "ORCHESTRATOR";
  })();

  // 경과 초 — 기다린 시간을 숨기지 않는다 (실호출은 실제로 오래 걸린다).
  // 값은 타이머 콜백에서만 옮긴다 — 효과 본문에서 setState하면 연쇄 렌더가 된다(React 19 규칙).
  const waitFrom = useRef<number | null>(null);
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (!(running && playbackDone)) { waitFrom.current = null; return; }
    waitFrom.current = Date.now();
    const iv = setInterval(
      () => setWaited(Math.floor((Date.now() - (waitFrom.current ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [running, playbackDone, minutes.length]);

  const totals = snap?.totals ?? null;
  const allCached = !!totals && totals.llmCalls > 0 && totals.cacheHits >= totals.llmCalls;
  const urgencyHigh = snap?.urgency === "HIGH";
  const typeKo = snap?.hypothesisType ? (HYPTYPE_KO[snap.hypothesisType] ?? snap.hypothesisType) : null;

  return (
    <>
      {/* 7. 헤더 우측 — **회의를 여는 행위**만 남긴다 (08/31).
          재생 손잡이(일시정지·속도·전체 보기·따라가기)는 단계 막대 안으로 내려갔다:
          회의를 따라가는 도구가 회의에서 두 뼘 떨어져 있으면 쓰이지 않는다. */}
      <Topbar
        title="AI Board 회의장"
        right={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={startMeeting}
              disabled={running || starting}
              title="회의록을 통째로 교체하고 처음부터 다시 심의합니다 (캐시 재생)"
            >
              {running ? "심의 진행 중…"
                : starting ? "시작 중…"
                : minutes.length === 0 ? "심의 시작" : "재심의"}
            </Button>
          </>
        }
      />

      <div className="mx-auto max-w-5xl">
        {/* 1. 헤더 */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Eyebrow>BOARD · {hypId}</Eyebrow>
            <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
              {card?.titleKo ?? "가설을 불러오는 중…"}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {card && (
                card.kind === "DEVELOPMENT"
                  ? <Chip tone="orange">허가 범위 밖 · 상업 액션 차단</Chip>
                  : <Chip>In-label</Chip>
              )}
              {urgencyHigh && <Chip tone="orange">긴급 · SAFETY</Chip>}
              {typeKo && <Chip>{typeKo}</Chip>}
              {card && <Chip>{card.status}</Chip>}
            </div>
          </div>

          {/* 호출 회계 — "캐시 재생이면 그렇다고 말한다" */}
          <div className="flex flex-col items-end gap-1.5">
            {totals && (
              <p className="mono text-[0.75rem] text-muted">
                {allCached
                  ? `캐시 재생 ${totals.cacheHits}/${totals.llmCalls} — API 미호출`
                  : `LLM 호출 ${totals.llmCalls}회 · 캐시 ${totals.cacheHits}회`}
              </p>
            )}
            {snap?.runId && <p className="mono text-[0.75rem] text-faint">{snap.runId}</p>}
          </div>
        </div>

        {/* 1.5 회의 정보 — 회의록의 머리말 (08/28). 회의가 열린 뒤에만 세운다 */}
        {minutes.length > 0 && <MinutesHeader hypId={hypId} snap={snap} />}

        {/* 5단계 범례 — 색이 아니라 채도로 가른다 (절대 규칙 #8 · 08/27 테마) */}
        <div className="mono mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[0.75rem] text-muted">
          {LEGEND.map(([ko, dot]) => (
            <span key={ko} className="inline-flex items-center gap-1.5">
              <span className={cx("size-[7px] rounded-full", dot)} />
              {ko}
            </span>
          ))}
          <span className="text-faint">— 네이비는 AI가 말한 것 · 오렌지는 사람이 손대는 것</span>
        </div>

        {startErr && (
          <Panel tone="note" pad="sm" className="mt-4 text-[0.875rem] leading-[1.7] text-rust">
            {startErr}
          </Panel>
        )}
        {loadErr && (
          <Panel tone="note" pad="sm" className="mt-4 text-[0.875rem] leading-[1.7] text-rust">
            {loadErr}
          </Panel>
        )}

        {/* 2. 고정 헤더 — 스크롤을 내려도 단계와 발언자는 늘 보인다 */}
        <StickyBar
          hypId={hypId}
          currentPhase={currentPhase}
          humanDecided={humanDecided}
          decisionOpen={showDecisionPanel || !!snap?.awaitingVerdict}
          active={active}
          running={running}
          waitedSec={waited}
          controls={minutes.length > 0 ? (
            <PlaybackControls
              playing={playing}
              paused={paused}
              onPause={() => setPaused((p) => !p)}
              onNext={nextTurn}
              speed={speed}
              onSpeed={() => setSpeed((v) => (v === 1 ? 2 : v === 2 ? 4 : 1))}
              onFlush={flushAll}
              onReplay={replay}
              followOn={followOn}
              onFollow={() => {
                const on = !followOn;
                setFollow(on, true);          // 손으로 정한 뜻이다 — 잠긴다·풀린다
                if (on) anchorTo(liveRef.current ?? panelRef.current);
              }}
              foldedAll={foldedAll}
              onFoldAll={foldAll}
              foldableCount={foldables.length}
            />
          ) : undefined}
        />

        {runNote && (
          <Panel tone="note" pad="sm" className="mono mt-3 text-[0.8125rem] leading-[1.7] text-body">
            {runNote}
          </Panel>
        )}

        {/* 3. 참석자 레일 — 가로 스크롤이면 뒤쪽 참석자가 화면 밖에 숨는다. 소집된 전원이
            한눈에 보여야 "이 안건에 누가 앉았나"가 읽히므로 줄바꿈으로 펴고, 긴 직함 대신
            역할 한 단어를 쓴다 (전체 직함은 아이콘 툴팁에 있다). */}
        {rail.length > 0 && !convening && (
          /* mt-6 — 같은 이유다. 바로 위 고정 막대가 z-30 으로 이 줄 위를 덮으므로,
             발언 중인 칩의 글로우가 설 자리를 위에 남겨 둔다. */
          <div className="mt-6 flex flex-wrap gap-1.5">
            {rail.map((p) => {
              const s = stanceOf(p);
              const speaking = !!active && active.persona === p;
              /* 09/01 — Screen 릴레이 미니행의 **상태 어휘**를 그대로 쓴다
                 (완료 ✓ / ● 검토 중 / 대기). 그전에는 이 칩이 «누가 앉았나»만 말하고
                 «지금 어디까지 왔나»는 말하지 않아, 회의가 도는 동안 비어 있었다.
                 판정은 화면에 이미 나온 발언까지만 본다 — 연출을 앞지르지 않는다. */
              const spoken = shown.some((m) => m.persona === p);
              return (
                <div
                  key={p}
                  title={pLabel(p)}
                  className={cx(
                    "flex items-center gap-1.5 rounded-2xl border bg-card py-1 pl-1 pr-2",
                    speaking ? "glow-running border-orange/60" : "border-glass-line",
                  )}
                >
                  <Avatar persona={p} size="sm" />
                  <span className="whitespace-nowrap text-[0.8125rem] font-medium text-navy">
                    {PERSONA[p]?.short ?? p}
                  </span>
                  <span className="mono whitespace-nowrap text-[0.75rem] text-faint">
                    {PERSONA[p]?.roleKo}
                  </span>
                  {p === lead && <Tag tone="mark">LEAD</Tag>}
                  <span
                    className={cx(
                      "mono whitespace-nowrap text-[0.6875rem] font-bold",
                      speaking ? "pulse-soft text-orange-deep"
                        : spoken ? "text-green"
                        : "text-faint",
                    )}
                  >
                    {speaking ? "● 발언 중" : spoken ? "완료 ✓" : "대기"}
                  </span>
                  {p === "CEO" ? <Tag>판정</Tag> : (
                    <>
                      <StanceTag stance={s.stance} />
                      {s.changed && <Tag tone="mark">변경</Tag>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 4. 트랜스크립트 */}
        <div ref={foldAllRef} className="mt-6 flex flex-col gap-4">
          {minutes.length === 0 && !running && (
            <Panel tone="note" pad="lg" className="text-[0.9375rem] leading-[1.7] text-muted">
              아직 심의 기록이 없습니다.{" "}
              {card?.status === "IN_REVIEW"
                ? "상단의 [심의 시작]으로 회의를 소집하세요."
                : card
                  ? `이 가설은 ${card.status} 상태입니다 — 심의는 IN_REVIEW에서만 실행됩니다.`
                  : ""}
            </Panel>
          )}

          {minutes.length > 0 && (
            <ConveneStage
              hypType={snap?.hypothesisType ?? null}
              lead={lead}
              convened={snap?.convenedPersonas ?? []}
              urgency={snap?.urgency}
            />
          )}

          {visible.map((m, i) => {
            // 단계가 바뀌는 자리마다 구분선을 세운다 — 회의는 절차이지 이어지는 글이 아니다
            const prev = i > 0 ? visible[i - 1] : null;
            const newPhase = m.phaseNo !== null && m.phaseNo !== undefined
              && (prev?.phaseNo ?? -1) !== m.phaseNo;
            return (
              <React.Fragment key={m.seq}>
                {newPhase && <PhaseDivider phaseNo={m.phaseNo!} />}
                {/* data-turn — 접을 때 스크롤을 붙들 앵커를 찾는 표식 (foldWithAnchor) */}
                <div data-turn>
                  <Turn
                    m={m} text={m.utteranceKo ?? ""} showMeta lead={lead}
                    collapsed={folded.has(m.seq)} onFold={toggleFold(m.seq)}
                  />
                </div>
              </React.Fragment>
            );
          })}

          {active && (
            <div ref={liveRef} className="flex flex-col gap-4">
              {(visible.length === 0
                || (visible[visible.length - 1]?.phaseNo ?? -1) !== active.phaseNo)
                && active.phaseNo !== null && active.phaseNo !== undefined && (
                  <PhaseDivider phaseNo={active.phaseNo} />
                )}
              {stage === "dots" ? (
                <div className={cx("flex items-center gap-3", fadeUp)}>
                  <span className={cx("flex rounded-full", !paused && "glow-running")}>
                    <Avatar persona={active.persona} />
                  </span>
                  <Panel pad="sm"><TypingDots /></Panel>
                  <span className={cx("mono text-[0.8125rem]",
                                      paused ? "text-faint" : "pulse-soft text-orange-deep")}>
                    {active.personaLabelKo || pLabel(active.persona)}
                    {paused ? " 발언 — 일시정지" : " 발언 작성 중…"}
                  </span>
                </div>
              ) : (
                <div data-turn>
                  <Turn
                    m={active}
                    text={stage === "done" ? (active.utteranceKo ?? "") : (active.utteranceKo ?? "").slice(0, chars)}
                    showMeta={stage === "done"}
                    /* 방금 끝난 발언은 **접지 않는다** — 사람이 손대기 전에는 펴진 채다 (안 A) */
                    collapsed={folded.has(active.seq)}
                    onFold={toggleFold(active.seq)}
                    lead={lead}
                  />
                </div>
              )}
            </div>
          )}

          {/* running 중 큐가 비면 다음 발언자 자리에 인디케이터를 유지한다.
              CEO 판정은 1~2분이 걸린다 — 누구를 얼마나 기다리는지 말해 주지 않으면
              화면이 멈춘 것처럼 보인다. */}
          {running && playbackDone && waitingLabel && (
            <div className={cx("flex items-center gap-3", fadeUp)}>
              {waitingPersona && (
                <span className="glow-running flex rounded-full">
                  <Avatar persona={waitingPersona} />
                </span>
              )}
              <Panel pad="sm"><TypingDots /></Panel>
              <span className="mono pulse-soft text-[0.8125rem] text-orange-deep">{waitingLabel}</span>
              {waited >= 4 && (
                <span className="mono text-[0.75rem] text-faint">{waited}초</span>
              )}
            </div>
          )}
        </div>

        {/* 4.7 따라가기가 꺼진 동안의 손잡이 — 채팅 UI의 관례 그대로 (08/31).
            사람이 위로 올려 읽으면 추적이 저절로 꺼지는데, 그 사실을 화면이 말해 주지
            않으면 «회의가 멈췄다»로 읽힌다. 회의가 아직 도는 동안만 뜬다. */}
        {!followOn && (playing || running) && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-6">
            <button
              type="button"
              onClick={() => { setFollow(true, true); anchorTo(liveRef.current ?? panelRef.current); }}
              className="mono pointer-events-auto inline-flex items-center gap-2 rounded-full border border-line-2 bg-card px-3.5 py-2 text-[0.8125rem] text-navy shadow-card transition-colors hover:bg-fill-1"
            >
              <span aria-hidden>↓</span>
              회의가 계속 진행 중입니다 — 최신 발언으로
            </button>
          </div>
        )}

        {/* 4.5 의장 판정 · 5. 액션 결정 — 재생이 끝난 뒤에 연다 (연출보다 앞서가지 않는다).
            둘 다 "사람 차례"라 한 자리에 묶어 두고, 열리는 순간 그 자리로 스크롤을 옮긴다. */}
        <div ref={panelRef}>
          {snap?.awaitingVerdict && playbackDone && !running && (
            <VerdictPanel
              hypId={hypId}
              recommended={snap.recommendedDecision ?? null}
              tally={snap.stanceTally ?? null}
              onSubmitted={() => { lastSeq.current = snap.lastSeq; setPolling(true); }}
            />
          )}

          {showDecisionPanel && card && (
            <DecisionPanel
              hypId={hypId}
              card={card}
              minutes={minutes}
              onDecided={(noteKo) => { setDecisionNote(noteKo); loadCard(); router.refresh(); }}
            />
          )}
        </div>

        {decisionNote && (
          <Panel tone="note" pad="md" className="mt-4 text-[0.9375rem] leading-[1.7] text-navy">
            <b className="font-medium">{decisionNote}</b>
          </Panel>
        )}

        {/* 5.2 결정 이후의 다음 걸음 — **기각·보류는 되돌아갈 길이 있다** (docs/01 §3:
            "승인만이 끝이다"). 08/30까지 회의장에는 이 자리가 없어서, 기각된 안건을 열면
            결정 이력 한 줄만 남고 아무 데도 갈 수 없었다. 같은 걸음에는 같은 이름이므로
            버튼은 가설 목록과 같은 `HandoffBar` 를 그대로 쓴다 (전이 판정은 서버 몫). */}
        {(card?.status === "REJECTED" || card?.status === "HOLD") && (
          <Panel as="section" pad="md" className="mt-6">
            <Eyebrow>다음 걸음 · 결정 이후</Eyebrow>
            <p className="mt-1.5 max-w-[70ch] text-[0.9375rem] leading-[1.7] text-body">
              {card.status === "REJECTED"
                ? "기각은 가설의 끝이 아닙니다 — 근거를 다시 쌓으려면 Screen으로 되돌립니다. 되돌리면 외부 근거 검토 서명이 비워지고, 새 근거를 읽은 사람이 다시 서명해야 심의로 올라옵니다."
                : "보류는 열린 액션을 그대로 두고 근거를 더 모으는 결정입니다 — 쌓이면 2차 심의로 올립니다."}
            </p>
            <HandoffBar
              id={hypId}
              status={card.status}
              onMoved={() => { loadCard(); router.refresh(); }}
            />
          </Panel>
        )}

        {/* 5.5 채택된 액션 — GET /hypotheses/{id} 의 approvedActions(=_action_row) 그대로.
            "전달 대상" 옆에 **어느 전문과로 가는지**를 세운다: 지시는 그 신호가 나온
            자리로 돌아간다는 것이 이 열의 뜻이고, 값은 서버가 근거 면담에서 SQL로 센다.
            null은 대상 조건이 없다는 뜻이라 "전 방문 공통"이다 (docs/04 §6, 08/28). */}
        {(card?.approvedActions?.length ?? 0) > 0 && (
          <section className="mt-8">
            <SectionHead
              title="채택된 액션"
              dot="orange"
              right={`${card!.approvedActions!.length}건 · 사람이 채택한 것만`}
            />
            <TableFrame className="mt-3">
              <thead>
                <tr>
                  <th className={TH}>액션</th>
                  <th className={TH}>전달 대상</th>
                  <th className={TH}>전문과</th>
                  <th className={TH}>상태</th>
                </tr>
              </thead>
              <tbody>
                {card!.approvedActions!.map((a) => (
                  <tr key={a.actionItemId}>
                    <td className={TD}>{a.directiveKo}</td>
                    <td className={cx(TD, "whitespace-nowrap text-muted")}>
                      {TARGET_KO[a.target] ?? a.target}
                    </td>
                    <td
                      className={cx(TD, "mono whitespace-nowrap text-muted")}
                      title="이 가설의 근거가 나온 전문과입니다"
                    >
                      {specialtyKo(a.targetSpecialty)}
                    </td>
                    <td className={cx(TD, "mono whitespace-nowrap text-faint")}>{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </section>
        )}

        {/* 6. 결정 이력 — "의사결정 히스토리가 반드시 남는다"의 실물 */}
        {(card?.decisions?.length ?? 0) > 0 && (
          <section className="mt-8">
            <SectionHead
              title="결정 이력"
              right={`${card!.decisions!.length}건 · 사람이 기록한 것만`}
            />
            <TableFrame className="mt-3">
              <thead>
                <tr>
                  <th className={TH}>결정</th>
                  <th className={TH}>결정자</th>
                  <th className={TH}>근거</th>
                  <th className={TH}>일시</th>
                </tr>
              </thead>
              <tbody>
                {card!.decisions!.map((d, i) => (
                  <tr key={i}>
                    <td className={cx(TD, "whitespace-nowrap")}>
                      <span
                        className={cx(
                          "mono rounded-lg border px-2 py-0.5 text-[0.75rem]",
                          d.decision === "APPROVED"
                            ? "border-line-2 bg-fill-2 text-navy"
                            : "border-line bg-card text-muted",
                        )}
                      >
                        {DECISION_KO[d.decision] ?? d.decision}
                      </span>
                    </td>
                    <td className={cx(TD, "mono whitespace-nowrap font-medium text-navy")}>{d.decidedBy}</td>
                    <td className={TD}>{d.rationaleKo || "—"}</td>
                    <td className={cx(TD, "mono whitespace-nowrap text-faint")}>{stamp(d.decidedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </section>
        )}
      </div>
    </>
  );
}
