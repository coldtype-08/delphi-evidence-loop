/**
 * 처리 라인 화면이 공유하는 타입 (docs/04 §1·§5·§8).
 * page.tsx 에서 그대로 옮겨온 것이다 — 정의를 바꾸지 않았다 (REFACTOR.md A 단계).
 */

export type Agent = {
  agent: string; labelKo: string; model: string;
  keyEnv: string; keySource: string | null; ready: boolean;
  // 비용 구조 메타 (08/25) — 단계 카드가 배지로 보여준다
  effort?: string | null; promptCaching?: boolean; batchSupported?: boolean;
  rate?: { in: number; out: number; noteKo: string | null };
};

export type DocRow = {
  id: string; sourceType: string; sourceFormat: string; language: string;
  occurredOn: string; interactionCount: number;
  claimCounts: { candidate: number; approved: number; rejected: number };
};

export type DocDetail = DocRow & {
  rawText: string;
  filename?: string; sha256?: string; charCount?: number;
  interactions: { interactionId: string; hcpRef: string; blockIndex: number | null;
                  docCharStart: number | null; docCharEnd: number | null }[];
};

export type Block = {
  hcpSurface: string; specialtySurface: string | null; institutionSurface: string | null;
  confidence: "CLEAR" | "INFERRED" | "UNCERTAIN"; boundaryNoteKo: string | null;
  charStart: number; charEnd: number;
};

export type Attribution = {
  documentId: string; blocks: Block[];
  dropped: { hcpSurface: string; reason: string }[];
  unattributedNoteKo: string | null; coverageRatio: number;
  confidenceCounts: Record<string, number>;
  score: { truthBlocks: number; aiBlocks: number; matched: number; missed: number;
           extra: number; meanIou: number; blockRecall: number } | null;
  storedAt?: string;   // 실행 결과가 서버에 저장된 시각 (08/25 — 문서당 1회만 실행)
};

// 저장된 귀속 검증 결과 (08/25) — 문서를 열 때 이걸 먼저 읽어 모델 재실행을 피한다
export type StoredAttribution = { available: boolean; asOf: string | null; result: Attribution | null };

export type Extraction = {
  documentId: string; skipped: boolean; existingClaims?: number;
  blocks: number; claims: number; safety: number; safetyRerouted: number;
  rejectedNoEvidence: number; unmapped: number; malformed?: number;
  byGrade: Record<string, number>;
};

export type Claim = {
  id: string; interactionId: string; signalType: string; patientSegment: string;
  labelScope: string; reviewGrade: string; status: string; summaryKo: string;
  verbatimQuote: string; evidence: { docId: string; charStart: number; charEnd: number };
};

export type Proposal = {
  sampledDocuments: string[]; sourceFormats: string[]; activeContractVersion: string;
  fields: { key: string; labelKo: string; kind: string; rationaleKo: string;
            observedInDocs: number; alreadyInContract: boolean;
            values: { value: string; labelKo: string }[];
            evidence: { docId: string; quote: string }[] }[];
  rejected: { key: string; reasonKo: string }[];
  droppedEvidence: number;
  note_ko: string;
  scan?: { chunks: number; chunkSize: number; scoutCandidates: number };
  vocab?: { harvested: number; droppedSurfaces: number; added: number;
            updated: number; skippedKnown: number; skippedDecided: number };
};

export type FullScan = {
  runId: string | null; running: boolean;
  phase: "IDLE" | "SCOUT" | "MERGE" | "DONE" | "ABORTED";
  totalDocs: number; chunkSize: number; totalChunks: number; chunksDone: number;
  candidateFields: number; droppedQuotes: number;
  events: { seq: number; ts: string; kind: string; chunk: number | null; messageKo: string }[];
  lastSeq: number; result: Proposal | null;
};

export type LlmRunRow = {
  id: number; purpose: string; model: string; promptVersion: string;
  schemaName: string; latencyMs: number; cached: boolean;
  callMode?: "REALTIME" | "BATCH" | "CACHE"; createdAt: string;
  inputTokens?: number; outputTokens?: number;
  cacheReadTokens?: number; cacheWriteTokens?: number; costUsd?: number;
};

export type Strip = {
  computedBy: string; asOf: string; rawDocuments: number; analyzedRecords: number;
  // 08/30: 「잠정 / 공식」 두 숫자가 한 숫자가 됐다 (절대 규칙 #3 개정 #115 — 승인이 수집
  // 시점으로 옮겨져 «승인 전 잠정»이라는 대기 상태가 이 라인의 산출물에 없다).
  // `heldForReview` = 검증에 걸려 자동 승인하지 않은 몫. COMMERCIAL 롤에는 오지 않는다.
  signals: { total: number; approved: number; heldForReview?: number;
             provenance?: { seed: number; extracted: number }; labelKo: string };
  // `total` 은 RETIRED 를 뺀 가설 전체 — `GET /hypotheses` 목록의 기본 필터와 같은 기준.
  hypotheses: { total: number; draft: number; nearThreshold: number };
};

// ⓪ 원본 파일 실물 파싱 (08/24) — 원본은 docx/pdf뿐이고, 서버가 그 자리에서 파싱해
// DB 원문과 문자 단위로 대조한다 (docx·pdf 모두 왕복 무손실이라 FULL/MISMATCH 둘뿐)
export type SourceCheck = {
  documentId: string; available: boolean; noteKo?: string;
  binary: { filename: string; format: string; sha256: string; bytes: number } | null;
  extraction: { engine: string; chars: number; match: "FULL" | "MISMATCH";
                detailKo: string } | null;
  dbMatch?: boolean; maskedChars?: number;
};

// ⓪ 데이터 로드가 실제로 수행하는 전건 파싱 결과 (08/24) — 숫자가 주장이 아니라 측정값이 되게
export type ParseScan = {
  parsedDocuments: number; byFormat: Record<string, number>;
  matched: number;
  mismatched: { documentId: string; filename: string; parsedChars: number; dbChars: number }[];
  missing: string[];
  parsedChars: number; elapsedMs: number; engine: string;
  // 의료진 블록 분리 — 파싱 텍스트의 구조에서 도출, 수집 기록과 오프셋 대조 (08/24)
  doctorSplit: {
    derivedBlocks: number; docsMatched: number; docsMismatched: string[];
    distinctSurfaces: number;
    doctors: { surface: string; blocks: number; docs: number }[];
    methodKo: string;
  };
};

// 원석 블록 원장 — 파싱·분리 결과가 적재된 SQL 테이블(interactions) 그 자체 (08/24)
export type BlockLedger = {
  total: number;
  rows: { documentId: string; filename: string; sourceFormat: string; occurredOn: string | null;
          hcpRef: string; hcpSpecialty: string | null; region: string | null; setting: string | null;
          language: string; blockIndex: number | null;
          charStart: number | null; charEnd: number | null; preview: string }[];
};

// AI Readable 데이터의 실물 — claims 테이블 행 (08/24, GET /claims/table)
export type ClaimRow = Claim & {
  origin: "SEED" | "EXTRACTED";
  /* 08/28: API 가 주는데 타입이 안 받고 있던 둘. docs/08 §2.1 의 AI Readable 5조건 중
     ③ 목적 도메인 태그와 ① 정해진 스키마(versioned)의 증거라서 표에 컬럼으로 세운다. */
  purposeDomain?: string;
  contractVersion?: string;
  hcpRef: string; hcpSpecialty: string | null; region: string | null;
  documentId: string; occurredOn: string | null;
  // 축 밖 스키마 필드 — 동적 저장(claim_fields)에서 camelCase 키로 온다 (08/26)
  fields?: Record<string, string>;
};

export type ClaimsTable = {
  total: number; byOrigin: { seed: number; extracted: number };
  rows: ClaimRow[];
};

// 용어 사전 후보 — 코퍼스에서 수확된 표면형→표준어 제안 (08/25 심사 UI)
export type VocabProp = {
  id: number; surface: string; lang: string; canonicalId: string; labelKo: string;
  evidenceDocId: string; evidenceQuote: string; observedChunks: number;
  status: "PROPOSED" | "APPROVED" | "REJECTED"; decidedBy: string | null;
};

export type VocabInfo = { bySource?: Record<string, number>; terms: unknown[]; sttKeyterms: string[] };

export type RunEvent = {
  seq: number; ts: string; kind: string;
  docId: string | null; claimId: string | null; messageKo: string;
};

export type RunState = {
  runId: string | null; running: boolean; startedAt: string | null; finishedAt: string | null;
  // 08/30: 서버 재시작으로 메모리 로그가 비었을 때, 서버가 **DB에 남은 행에서 지난 판독을
  // 복원**해 준다 (backend/app/runner.py `_replay_events`). true 면 이벤트의 `ts` 는
  // 시각이 아니라 **그 문서의 면담일**이다 — claims 에 적재 시각이 남지 않기 때문.
  replay?: boolean;
  limit: number; totalDocs: number; processed: number; currentDocId: string | null;
  totals: { claims: number; safety: number; rejected: number; unmapped: number;
            llmCalls: number; cacheHits: number; errors?: number };
  events: RunEvent[]; lastSeq: number;
};

// 제품 맥락 (08/25) — "이 시스템이 어느 약의 신호를 다루는가"를 화면이 말한다.
// 출처는 GET /system/product (app/product.py 도메인 상수) — 프론트 하드코딩이 아니다.
export type Product = {
  brand: string; inn: string; brandKo: string; innKo: string; company: string;
  indication: { ko: string; en: string };
  searchTerms: { product: string[]; indication: string[] };
};

export type HypCard = {
  id: string; titleKo: string; kind: string; labelScope: string; status: string;
  patientSegment: string; notBoardReadyReason: string | null;
  driverSummaryKo: string | null;
  aggregate: { signalType?: string; claimCount?: number; distinctHcp?: number;
               distinctRegions?: number; provisional?: boolean; asOf?: string;
               // 에이전트의 판정 (08/26) — 수치와 나란히 두어 출처가 구분되게
               signalKind?: string; priority?: string; priorityReasonKo?: string;
               nextQuestionKo?: string; writtenBy?: string;
               // 이 가설이 근거로 삼은 신호들 (08/26) — 가설 하나가 여럿을 묶을 수 있다
               signals?: SignalStrength[] } | null;
};

export type HypGenOut = {
  evaluatedCombos: number; passedCombos: number; created: string[]; updated: string[];
  thresholds: { repeat: number; distinctHcp: number; noteKo: string }; asOf: string;
  retired?: string[]; weakened?: string[];
  // 임계에 못 미친 조합 — "조금만 더 모이면 되는 것"을 보여준다 (08/26)
  nearMiss?: SignalStrength[];
  // 통과 조합이 0일 때만 붙는다 — 어느 관문에서 빠졌는지 (08/26)
  diagnosis?: {
    computedBy: "SQL";
    axes: { segment: string; signal: string };
    autoSignals: string[];
    gates: { key: string; labelKo: string; count: number; hintKo: string }[];
    leakedSignals: { value: string; count: number }[];
  };
};

// 신호 = 환자군 × 신호유형 조합의 SQL 강도. 가설이 아니라 가설의 재료다 (08/26).
export type SignalStrength = {
  signalId: string; segment: string; signalType: string;
  claimCount: number; distinctHcp: number; distinctRegions: number; distinctDocs: number;
  recentCount: number; recentShare: number; recentWindowDays: number;
  firstSeen: string | null; lastSeen: string | null;
};

// 비용 요약 (08/25) — "비용 효율 구조"를 주장이 아니라 실측으로. 전부 SQL 합계.
export type CostSummary = {
  totalCalls: number; spentUsd: number; fullPriceUsd: number; savedUsd: number;
  promptCacheHitTokens: number;
  byMode: Record<string, { calls: number; costUsd: number; cacheReadTokens: number }>;
  noteKo: string;
};

// 배치는 claim을 만들지 않는다: 캐시만 채우고, 적재는 기존 실행 버튼이 캐시 재생(0원)으로
// 한다 — 검증 경로가 갈라지지 않는다. 모든 건이 llm_runs에 call_mode=BATCH로 남는다.
export type BatchState = {
  running: boolean; target: string | null; batchId: string | null;
  startedAt: string | null; finishedAt: string | null;
  total: number; succeeded: number; errored: number; alreadyCached: number;
  events: { seq: number; ts: string; kind: string; messageKo: string }[]; lastSeq: number;
  // 재배포·재시작으로 수거가 끊긴 배치 (08/26) — 이미 과금된 결과를 되찾는 경로
  pending?: { batchId: string; target: string; startedAt: string } | null;
};
