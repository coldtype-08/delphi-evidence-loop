/**
 * Screen 층 공용 상수 — 검토관 이름표·출처 라벨 (08/31 렌더 단일화).
 *
 * ScreenBench 와 ScreenRunner 가 각자 이름표를 들고 있었다 — 같은 에이전트가
 * 한쪽에서는 "허가 규제 검토관", 다른쪽에서는 "허가·규제 검토관 · openFDA"로 불렸다.
 * 표가 두 벌이면 반드시 갈린다. 여기 한 벌만 두고 둘 다 여기서 읽는다.
 */

/** 검토관 역할명 — 출처는 붙이지 않는다. 출처는 AGENT_VIA 가 따로 말한다. */
export const AGENT_KO: Record<string, string> = {
  FIELD_SIGNAL: "내부 신호",
  EVIDENCE_OPENFDA: "허가·규제 검토관",
  EVIDENCE_CTGOV: "임상개발 전략가",
  EVIDENCE_PUBMED: "메디컬 어페어 리뷰어",
  EVIDENCE_CMS: "마켓 액세스 애널리스트",
  SAFETY: "안전성 경로",
};

/** 검토관이 읽는 출처 — 역할명 옆의 작은 글씨. */
export const AGENT_VIA: Record<string, string> = {
  FIELD_SIGNAL: "SQL",
  EVIDENCE_OPENFDA: "openFDA",
  EVIDENCE_CTGOV: "CT.gov",
  EVIDENCE_PUBMED: "PubMed",
  EVIDENCE_CMS: "CMS",
  SAFETY: "분리 경로",
};

/** 판정을 사람 말로 — 색이 뜻하는 것은 세기가 아니라 방향이다 (08/27 회의 결정 유지). */
export const TYPE_KO: Record<string, string> = {
  SUPPORT: "지지",
  COUNTER: "반대",
  SAFETY_SIGNAL: "안전성 신호",
};

/** 출처 링크의 이름 — 무엇이 열릴지 누르기 전에 알게 한다 (08/28).
 *  "질의 결과(JSON)"는 08/31 용어 정리에서 "조회 기록"으로 — 형식(JSON)은 화면의
 *  관심사가 아니고, 그것이 검토관의 실제 조회 기록이라는 사실이 관심사다. */
export function sourceLabel(url: string): string {
  // DailyMed = 같은 FDA 라벨의 사람용 열람 사이트(미 국립의학도서관 운영) — "openFDA 검토관인데
  // 왜 DailyMed?"라는 오해가 없도록 링크 이름이 관계를 스스로 말한다 (08/28)
  if (url.includes("dailymed.nlm.nih.gov")) return "FDA 라벨 원문(DailyMed) ↗";
  if (url.includes("accessdata.fda.gov")) return "FDA 허가 정보(Drugs@FDA) ↗";
  if (url.includes("api.fda.gov")) return "조회 기록 ↗";
  if (url.includes("/search") || url.includes("?term=")) return "검색 결과 ↗";
  return "출처 원문 ↗";
}

const SOURCE_TITLE: [string, string][] = [
  ["dailymed.nlm.nih.gov", "검토관이 읽은 것과 같은 FDA 허가 라벨을 사람이 읽도록 미 국립의학도서관(NLM)이 제공하는 공식 열람 페이지입니다."],
  ["accessdata.fda.gov", "FDA가 직접 운영하는 허가 데이터베이스(Drugs@FDA) — 이 신청번호의 승인 이력이 열립니다."],
  ["api.fda.gov", "검토관이 실제로 조회한 기록이 열립니다."],
];
export function sourceTitle(url: string): string | undefined {
  return SOURCE_TITLE.find(([h]) => url.includes(h))?.[1];
}

/** 이중 확인(출처 검증)의 제외 사유 — 내부 코드를 사람 말로 (blocked_log.reason_code).
 *  기본 화면에는 안 나온다 — «확인에서 걸러진 판정» 서랍을 열었을 때만 보인다 (08/31). */
export const REVIEW_REASON_KO: Record<string, string> = {
  MISSING_SOURCE: "출처가 없어 걸렀습니다",
  UNTRUSTED_SOURCE: "재료 밖 출처라 걸렀습니다",
  MISSING_CAVEAT: "해석 한계 문구가 없어 걸렀습니다",
  OVER_CAP: "한 검토관이 낼 수 있는 판정 수를 넘어 걸렀습니다",
  INVALID_TYPE: "판정 형식이 맞지 않아 걸렀습니다",
  EMPTY_STATEMENT: "판정문이 비어 있어 걸렀습니다",
};
