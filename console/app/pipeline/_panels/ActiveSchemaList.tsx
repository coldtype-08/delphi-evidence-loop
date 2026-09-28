"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { hhmmss } from "../_lib/format";
import { TH } from "@/app/components/ui";

// 확정 스키마 목록 (08/25) — "최종적으로 어떤 스키마가 형성됐는지"를 접기로 펼쳐 본다.
// 출처는 /contract/active (DB의 활성 계약 본문 그대로) — 화면이 지어내는 목록이 아니다.
export default function ActiveSchemaList() {
  type ActiveContract = {
    version: string; status: string; approvedBy: string | null; approvedAt: string | null;
    fields: Record<string, { labelKo: string; required: boolean; requiredIf?: string | null;
                             values: { value: string; labelKo: string;
                                       labelScope?: string; isNew?: boolean }[] | null }>;
  };
  const [c, setC] = useState<ActiveContract | null>(null);
  const enumCount = c
    ? Object.values(c.fields).reduce((n, f) => n + (f.values?.length ?? 0), 0)
    : 0;
  return (
    <details className="mt-2 w-full"
             onToggle={(e) => {
               if ((e.target as HTMLDetailsElement).open && !c) {
                 api<ActiveContract>("/contract/active").then(setC).catch(() => {});
               }
             }}>
      <summary className="cursor-pointer text-xs font-bold text-navy">확정된 스키마 목록 보기</summary>
      {!c ? (
        <p className="mt-2 text-xs text-muted">불러오는 중…</p>
      ) : (
        <div className="mt-2">
          <p className="mb-1 text-[0.75rem] text-muted">
            Contract v{c.version} · 필드 {Object.keys(c.fields).length}개 · 허용값 {enumCount}개
            {c.approvedAt && <> · {c.approvedBy}가 {hhmmss(c.approvedAt)} 확정</>}
            {" — "}이 정의는 08/19 Contract 부트스트랩(코퍼스 분할 독해 → 사람 확정)에서 왔다:{" "}
            <a href="/contract/provenance" className="font-bold text-navy underline">유래 보기</a>
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border border-glass-line bg-card">
            <table className="w-full text-left text-[0.75rem]">
              <thead className="sticky top-0 bg-on-navy-3 backdrop-blur-sm">
                <tr>
                  {["필드", "라벨", "필수", "허용값 — 코드와 뜻이 모두 스키마다"].map((h) => (
                    <th key={h} className={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(c.fields).map(([key, f]) => (
                  <tr key={key} className="align-top">
                    <td className="whitespace-nowrap px-2 py-1"><code className="font-bold text-navy">{key}</code></td>
                    <td className="whitespace-nowrap px-2 py-1 text-ink">{f.labelKo}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-muted">
                      {f.required ? "✓" : f.requiredIf ? <span title={f.requiredIf}>조건부</span> : ""}
                    </td>
                    <td className="px-2 py-1">
                      {f.values?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {f.values.map((v) => (
                            <span key={v.value}
                                  className="inline-flex items-center gap-1 rounded-md border border-glass-line bg-card px-1.5 py-0.5">
                              <code className="font-bold text-navy">{v.value}</code>
                              <span className="text-ink">{v.labelKo}</span>
                              {v.labelScope === "OUT_OF_LABEL" && (
                                <span className="rounded bg-rust-soft px-1 text-[0.75rem] font-bold text-rust">허가범위 밖</span>
                              )}
                              {v.isNew && (
                                <span className="rounded bg-green-soft px-1 text-[0.75rem] font-bold text-green">변경 심사로 추가</span>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : <span className="italic text-muted">자유 텍스트</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </details>
  );
}
