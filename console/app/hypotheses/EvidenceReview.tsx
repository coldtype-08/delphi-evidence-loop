"use client";

/**
 * 외부 근거 검토 서명 — **Human in the loop 의 실물** (08/30 회의).
 *
 * Screen 은 판정하는 단계가 아니라 **사람이 검토할 외부 근거를 모으는** 단계다.
 * PubMed·CT.gov·openFDA·CMS 판정이 지지 3 대 반대 7이어도, 그 근거를 읽은 사람이
 * "그래도 심의해 볼 값어치가 있다"고 판단할 수 있어야 한다 — 기계가 센 개수가 사람의
 * 판단을 대신 내리면 그건 loop 안에 사람이 없는 것이다.
 *
 * 그래서 이 체크박스는 **조건 충족 표시가 아니라 서명**이다. 문구가 "조건을 만족합니다"가
 * 아니라 "제가 직접 봤습니다"인 이유이고, 누가 언제 눌렀는지 남기는 이유다.
 * 서버가 같은 것을 막는다(`NEEDS_EVIDENCE_SIGNOFF`) — 화면을 우회해도 안 넘어간다.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Panel } from "@/app/components/ui";

type Props = {
  id: string;
  /** Screen 이 끝났나 — 근거가 없으면 검토할 것도 없다 */
  reviewable: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** 검토자가 무엇을 보고 판단하는지 카드에 같이 적는다 */
  externalSupport?: number;
  judgments?: number;
};

export default function EvidenceReview({
  id, reviewable, reviewedBy, reviewedAt, externalSupport, judgments,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const signed = !!reviewedAt;

  async function toggle() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/hypotheses/${id}/evidence-review`, {
        method: "POST",
        body: JSON.stringify({ reviewed: !signed }),
      });
      router.refresh();
      window.dispatchEvent(new CustomEvent("delphi:pipeline-changed"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel tone="inset" pad="sm" className="mt-3">
      <label className={`flex items-start gap-2.5 ${reviewable ? "cursor-pointer" : "cursor-not-allowed"}`}>
        <input
          type="checkbox"
          checked={signed}
          disabled={!reviewable || busy}
          onChange={toggle}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--orange-deep)] disabled:opacity-40"
        />
        <span className="min-w-0">
          <b className={`block text-[0.8125rem] font-medium leading-[1.5] ${
            reviewable ? "text-navy" : "text-muted"}`}>
            외부 근거를 직접 검토했습니다
          </b>
          {/* 무엇을 보고 판단하는지 — 숫자는 서버 집계 그대로 (절대 규칙 #1) */}
          <span className="mono mt-1 block text-[0.6875rem] leading-[1.6] text-body">
            {!reviewable
              ? "Screen 검증이 끝나면 검토할 수 있습니다."
              : signed
                ? `${reviewedBy ?? "—"} · ${(reviewedAt ?? "").slice(0, 16).replace("T", " ")}`
                : typeof judgments === "number"
                  ? `판정 ${judgments}건 · 외부 지지 ${externalSupport ?? 0}건 — [근거 보기]로 확인 후 체크`
                  : "[근거 보기]로 확인 후 체크"}
          </span>
        </span>
      </label>

      {/* 이 문장이 이 화면의 요점이다 — 반대가 많아도 사람이 올릴 수 있다 */}
      {reviewable && !signed && (
        <p className="mt-2 text-[0.75rem] leading-[1.6] text-body">
          <b className="text-navy">상정 여부는 검토자가 정합니다.</b> 지지·반대 판정 수는
          판단의 재료이고, 안건으로 올릴지는 근거를 읽은 사람이 결정합니다.
        </p>
      )}
      {err && <p className="mono mt-2 text-[0.6875rem] text-rust">{err}</p>}
    </Panel>
  );
}
