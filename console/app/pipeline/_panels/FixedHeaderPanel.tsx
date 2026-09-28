"use client";

/**
 * 고정 헤더 — 사람이 도메인 지식으로 미리 정한 층 (08/26).
 *
 * 이게 화면에 없으면 AI 제안만 보이다가 조립 순간 필드가 두 배로 늘어
 * "저건 어디서 나왔지"가 된다. 그리고 이 제품의 주장 자체가 여기 있다 —
 * 회사가 이미 아는 질문은 사람이 쥐고, 그 데이터에만 있는 것은 AI가 찾는다.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Val = { value: string; labelKo: string; coversKo: string; labelScope: string | null };
type Field = {
  key: string; labelKo: string; coversKo: string;
  isAxis: string | null; values: Val[]; valuesFromCorpus: boolean;
};
type Fixed = { axes: Record<string, string>; autoHypothesisSignals: string[];
               fields: Field[]; noteKo: string };

export default function FixedHeaderPanel() {
  const [fx, setFx] = useState<Fixed | null>(null);

  useEffect(() => {
    let alive = true;
    api<Fixed>("/contract/fixed-headers", { role: "DATA_STEWARD" })
      .then((d) => { if (alive) setFx(d); })
      .catch(() => { if (alive) setFx(null); });
    return () => { alive = false; };
  }, []);

  if (!fx) return null;
  const axisFields = fx.fields.filter((f) => f.isAxis);
  const detail = fx.fields.filter((f) => !f.isAxis);

  return (
    <div className="mb-3 rounded-xl border border-line bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="eyebrow text-body">사람이 정한 층 · 고정 헤더</span>
        <span className="mono text-[0.75rem] text-muted">{fx.fields.length}개 항목</span>
      </div>
      <p className="mt-1.5 max-w-[74ch] text-[0.8125rem] leading-relaxed text-body">
        <b className="text-navy">시장 확대를 위해 반드시 알아야 하는 것은 도메인 지식으로 미리 정했습니다.</b>{" "}
        AI가 발견할 대상이 아니라 요구사항이라서, 분할 독해는 이 항목들을 찾지 않습니다 —
        대신 <b className="text-navy">환자군 허용값</b>과 <b className="text-navy">이 데이터에만 있는 것</b>을 찾습니다.
      </p>

      <div className="mt-2.5 flex flex-col gap-2">
        {axisFields.map((f) => (
          <div key={f.key} className="rounded-lg border border-line bg-card px-2.5 py-2">
            <div className="flex flex-wrap items-baseline gap-2 text-[0.75rem]">
              <span className="mono font-medium text-navy">{f.key}</span>
              <span className="text-body">{f.labelKo}</span>
              <span className="mono rounded bg-orange/15 px-1.5 py-0.5 text-[0.75rem] text-orange-deep">
                {f.isAxis === "segment" ? "환자군 축" : "신호 축"}
              </span>
              {f.valuesFromCorpus && (
                <span className="mono text-[0.75rem] text-muted">허용값은 AI가 찾은 것을 씁니다</span>
              )}
            </div>
            {f.values.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {f.values.map((v) => (
                  <span key={v.value} title={v.coversKo}
                        className="mono rounded border border-line bg-white px-1.5 py-0.5 text-[0.75rem] text-body">
                    {v.value}
                    <span className="ml-1 text-muted">{v.labelKo}</span>
                    {v.labelScope === "OUT_OF_LABEL" && (
                      <span className="ml-1 text-orange-deep">밖</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <details className="mt-2">
        <summary className="mono cursor-pointer text-[0.75rem] text-muted">
          상세 항목 {detail.length}개 — 축이 가리키는 것의 내용
        </summary>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {detail.map((f) => (
            <span key={f.key} title={f.coversKo}
                  className="mono rounded border border-line bg-card px-1.5 py-0.5 text-[0.75rem] text-body">
              {f.key}<span className="ml-1 text-muted">{f.labelKo}</span>
            </span>
          ))}
        </div>
      </details>

      <p className="mono mt-2 text-[0.75rem] text-muted">
        가설 임계 대상: {fx.autoHypothesisSignals.join(" · ")}
      </p>
    </div>
  );
}
