"use client";

/**
 * Field 수집분 검토 (08/28) — 문서가 없는 면담(현장 수집)의 본부 승인 화면.
 *
 * 옛 Data Review(/review, 08/31 삭제)는 문서 목록 기반이라 원본 문서가 없는 Field
 * 수집분은 나타나지 않았다 — 검토 대기 수에는 잡히는데 UI로는 승인할 수 없던 공백.
 * 이 화면은 같은 검토 문법(원문 형광펜 ↔ claim 카드 → 승인/반려)을 전사 원문 위에서
 * 반복한다. 승인 경로는 기존 PATCH /claims/{id} 그대로 — 새 상태 기계를 만들지 않는다.
 * 여기서의 승인이 데모 ③의 마지막 고리다: 한국어 수집분이 영문 원석과 같은 집계에 합산된다.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Panel, Eyebrow, Chip, Btn, Quote, Topbar, SectionHead, Placeholder } from "@/app/components/ui";

type FieldRow = {
  interactionId: string;
  occurredOn: string;
  hcpRef: string;
  hcpSpecialty: string;
  language: string;
  charCount: number;
  maskedCount: number;
  claimCount: number;
  fieldReviewedCount: number;
  extractedAt: string | null;
  safetyCount: number;
  extractState: string;
  collectedBy: string | null;
  pendingCount: number;
  approvedCount: number;
};

type FieldClaim = {
  claimId: string;
  signalType: string;
  patientSegment: string;
  labelScope: string;
  verbatimQuote: string;
  summaryKo: string;
  reviewGrade: string;
  status: string;
  evidence: { charStart: number | null; charEnd: number | null };
  fieldReviewedBy: string | null;
  fieldReviewedAt: string | null;
};

type FieldDetail = {
  interactionId: string;
  collectedBy: string | null;
  hcpRef: string;
  occurredOn: string;
  rawText: string;
  maskedSpans: unknown[];
  extractedAt: string | null;
  claims: FieldClaim[];
};

const STATE_KO: Record<string, string> = {
  PENDING: "추출 전",
  NO_SIGNAL: "신호 없음 — 정상 종료",
  SAFETY_ONLY: "이상사례만 — 안전 경로 분리",
  DONE: "구조화 완료",
};

function Highlighted({ text, claims }: { text: string; claims: FieldClaim[] }) {
  const spans = claims
    .filter((c) => c.evidence.charStart !== null && c.evidence.charEnd !== null)
    .map((c) => ({ start: c.evidence.charStart!, end: c.evidence.charEnd!, id: c.claimId }))
    .sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) parts.push(text.slice(cursor, s.start));
    parts.push(
      <mark key={s.id} id={`ev-${s.id}`} className="evidence">
        {text.slice(s.start, s.end)}
      </mark>,
    );
    cursor = Math.max(cursor, s.end);
  }
  parts.push(text.slice(cursor));
  return <pre className="whitespace-pre-wrap font-mono text-[0.875rem] leading-relaxed">{parts}</pre>;
}

export default function FieldReviewPage() {
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [detail, setDetail] = useState<FieldDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadRows = useCallback(() => {
    api<{ interactions: FieldRow[] }>("/field/interactions")
      .then((d) => setRows(d.interactions))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(loadRows, [loadRows]);

  const select = useCallback((id: string) => {
    setError(null);
    api<FieldDetail>(`/field/interactions/${id}`)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, []);

  async function review(claimId: string, action: "approve" | "reject") {
    setBusy(claimId);
    try {
      await api(`/claims/${claimId}`, {
        method: "PATCH",
        body: JSON.stringify({ action, reviewedBy: "본부" }),
      });
      if (detail) select(detail.interactionId);
      loadRows(); // 목록의 대기/승인 수도 갱신 — 집계는 서버 SQL이 다시 센다
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* 08/30(#115): 「여기서 승인해야만 합산됩니다」였다. 규칙 #3 개정으로 **승인은
          현장에서** 일어난다 — 그 대화에 있었고 원문을 본 수집자가 앱에서 카드를 승인하는
          것이 곧 사람 승인이다. 본부가 여기서 [승인]을 누르면 `reviewed_by` 가 본부로 덮이고
          현장 도장이 빈 채로 남아, Field 앱 목록은 그 행을 영영 «검토 대기»로 표시한다.
          그래서 이 화면의 일은 승인이 아니라 **현장이 놓친 것을 보고 걷어내는 것**이다. */}
      <Topbar
        title="현장 수집분 — 검토"
        right={<Chip>승인은 현장에서</Chip>}
      />

      <div className="mx-auto max-w-7xl">
        <Eyebrow>SENSE · 현장 수집분</Eyebrow>
        <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
          현장 수집분 검토
        </h1>
        <p className="mt-1.5 max-w-[72ch] text-[0.9375rem] leading-[1.7] text-body">
          현장에서 수집된 면담의 추출 후보입니다. 근거는 전사 원문 형광펜과 1:1로 연결됩니다 (절대
          규칙 #2). <b className="font-medium text-ink">승인은 수집자가 Field 앱에서</b> 카드를
          승인할 때 찍힙니다 — 그 대화에 있었고 원문을 본 사람이 그쪽이기 때문입니다 (#3).
          여기는 그 결과를 본부가 확인하고 <b className="font-medium text-ink">틀린 것을
          걷어내는</b> 자리입니다. 문서 원석의 추출 결과는{" "}
          <Link href="/pipeline" className="underline decoration-navy/30 underline-offset-2">
            처리 라인
          </Link>
          에서 봅니다.
        </p>
        {error && (
          <Panel tone="note" pad="md" className="mt-4 text-[0.9375rem] text-rust">{error}</Panel>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-[300px_1fr_360px]">
          {/* 면담 목록 — 본부 모드 (repId 없음) */}
          <Panel pad="sm" className="max-h-[75vh] overflow-y-auto">
            <Eyebrow>검토 큐 · 현장 수집</Eyebrow>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {rows.map((r) => (
                <button
                  key={r.interactionId}
                  onClick={() => select(r.interactionId)}
                  className={`block w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                    detail?.interactionId === r.interactionId
                      ? "bg-orange-soft"
                      : "bg-card hover:bg-card"
                  }`}
                >
                  <div className="mono text-[0.8125rem] font-medium text-navy">{r.interactionId}</div>
                  <div className="mono mt-1 flex flex-wrap gap-x-1.5 gap-y-1 text-[0.75rem] text-muted">
                    <span>{r.hcpRef}</span>
                    <span>· {r.language}</span>
                    <span>· 수집 {r.collectedBy ?? "?"}</span>
                    {r.pendingCount > 0 && (
                      <span className="text-orange-deep">· 검토 {r.pendingCount}</span>
                    )}
                    {r.approvedCount > 0 && (
                      <span className="text-body">· 승인 {r.approvedCount}</span>
                    )}
                    {r.claimCount === 0 && (
                      <span>· {STATE_KO[r.extractState] ?? r.extractState}</span>
                    )}
                  </div>
                </button>
              ))}
              {rows.length === 0 && (
                <p className="px-3 py-6 text-center text-[0.875rem] text-muted">
                  현장 수집분이 없습니다 — Field 앱에서 면담을 저장하면 여기 나타납니다.
                </p>
              )}
            </div>
          </Panel>

          {/* 전사 원문 패널 — 문서가 없으므로 원문이 곧 전사 텍스트다 */}
          <Panel pad="lg" className="max-h-[75vh] overflow-y-auto">
            {detail ? (
              <>
                <SectionHead
                  title={`${detail.hcpRef} 면담 전사`}
                  right={`${detail.occurredOn} · 마스킹 ${detail.maskedSpans.length}곳 · 후보 ${detail.claims.length}개`}
                />
                <div className="mt-3.5">
                  <Highlighted text={detail.rawText} claims={detail.claims} />
                </div>
              </>
            ) : (
              <p className="py-20 text-center text-[0.9375rem] text-muted">
                왼쪽에서 면담을 선택하세요 — 전사 원문과 추출 카드가 나란히 열립니다.
              </p>
            )}
          </Panel>

          {/* claim 카드 */}
          <div className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto">
            {detail && detail.claims.length === 0 && (
              <Placeholder title="추출 후보 없음">
                {detail.extractedAt
                  ? "추출이 돌았지만 담을 신호가 없었습니다 — 정상 종료입니다."
                  : "추출이 아직 돌지 않았습니다 — Field 앱의 [AI 구조화]가 이 단계를 실행합니다."}
              </Placeholder>
            )}
            {detail?.claims.map((c) => (
              <Panel key={c.claimId} pad="md">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip>{c.signalType}</Chip>
                  <Chip>{c.patientSegment}</Chip>
                  <Chip tone={c.labelScope === "OUT_OF_LABEL" ? "orange" : "plain"}>
                    {c.labelScope === "OUT_OF_LABEL" ? "허가 범위 밖 · Development" : "In-label"}
                  </Chip>
                  <Chip>{c.reviewGrade}</Chip>
                  {c.fieldReviewedAt && <Chip tone="navy">현장 검토 완료</Chip>}
                </div>

                <p className="mt-2.5 text-[0.9375rem] font-medium leading-[1.55] text-navy">{c.summaryKo}</p>

                {/* 근거는 항상 원문 인용 모양으로 — 클릭하면 왼쪽 형광펜으로 간다 */}
                <a href={`#ev-${c.claimId}`} className="block">
                  <Quote
                    meta={
                      c.evidence.charStart !== null
                        ? `전사 ${c.evidence.charStart}–${c.evidence.charEnd}자 → 클릭하면 형광펜으로 이동`
                        : "전사 원문 인용"
                    }
                  >
                    {c.verbatimQuote}
                  </Quote>
                </a>

                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  {c.status === "CANDIDATE" ? (
                    <>
                      <Btn
                        variant="primary"
                        size="sm"
                        disabled={busy === c.claimId}
                        onClick={() => review(c.claimId, "approve")}
                      >
                        승인
                      </Btn>
                      <Btn size="sm" disabled={busy === c.claimId} onClick={() => review(c.claimId, "reject")}>
                        반려
                      </Btn>
                    </>
                  ) : (
                    <Chip tone={c.status === "APPROVED" ? "navy" : "plain"}>
                      {c.status === "APPROVED" ? "승인됨 — 집계 반영" : "반려됨 — 집계 제외·보존"}
                    </Chip>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
