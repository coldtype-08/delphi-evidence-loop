/**
 * 처리 라인 화면의 표기 상수 — 라벨·색·틴트.
 * page.tsx 에서 그대로 옮겨온 것이다 (REFACTOR.md A 단계).
 */

export const CONF_KO: Record<string, string> = {
  CLEAR: "문서가 명시", INFERRED: "문맥으로 이어붙임", UNCERTAIN: "경계 모호",
};

export const BLOCK_TINT = ["#EAF0FF", "#FCF1E0", "#E2F5EE", "#FBE9EC", "#F0EDFB", "#EAF6FA"];

// 로그 이벤트 종류별 표기 (08/26 재조정)
// 진행 표시(런·문서·LLM)는 색을 쓰지 않는다 — 네이비 농도로만 가른다.
// 결과(저장·거부·AE)만 상태색을 쓴다. 로그가 알록달록하면 무엇이 문제인지 안 보인다.
export const EVENT_TAG: Record<string, { label: string; cls: string }> = {
  RUN: { label: "런", cls: "bg-navy/90 text-[#FCFCFA]" },
  DOC: { label: "문서", cls: "bg-navy/[.07] text-navy/60" },
  LLM: { label: "LLM", cls: "bg-navy/[.12] text-navy/70" },
  SAVE: { label: "저장", cls: "bg-green-soft text-green" },
  REJECT: { label: "거부", cls: "bg-rust-soft text-rust" },
  AE: { label: "AE", cls: "bg-rust-soft text-rust" },
};

export const SIGNAL_KIND_KO: Record<string, string> = {
  INDICATION_EXPANSION: "적응증 확대", UNMET_NEED: "미충족 수요", ACCESS_BARRIER: "접근 장벽",
  SAFETY_TOLERABILITY: "안전성·내약성", DATA_QUALITY: "데이터 품질", OPERATIONAL: "운영",
  UNCLASSIFIED: "미분류",
};

export const PRIORITY_STYLE: Record<string, string> = {
  HIGH: "bg-orange text-white", MEDIUM: "bg-sky-soft text-navy", LOW: "bg-paper text-muted",
};

export const MODE_KO: Record<string, { label: string; icon: string; cls: string }> = {
  REALTIME: { label: "실호출 (정가)", icon: "⚡", cls: "bg-sky-soft text-navy" },
  BATCH: { label: "배치 (반값)", icon: "📦", cls: "bg-orange-soft text-orange-deep" },
  CACHE: { label: "캐시 재생 (0원)", icon: "🔁", cls: "bg-green-soft text-green" },
};
