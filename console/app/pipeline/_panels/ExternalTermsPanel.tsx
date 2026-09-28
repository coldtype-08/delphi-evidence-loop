"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Btn, FIELD, TH } from "@/app/components/ui";

// 외부 표준 용어 매핑 (08/25) — 질환형 환자군 → MeSH 영문 질환명 (Screen 검색어 축).
// 조회는 NLM 공공 API 결정론(LLM 아님·캐시), 채택은 사람(Steward). 인구형(연령 판정)은
// 매핑이 없는 게 정상 — 그 상태 자체를 화면이 말한다.
// defaultOpen (08/30): 파이프라인에서는 접이식 보조 패널이지만 온톨로지의 MeSH 탭에서는
// 이게 탭 내용 전부다 — 접힌 채 시작하면 탭이 빈 화면으로 보인다(실제로 그렇게 보였다).
export default function ExternalTermsPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  type SegValue = { value: string; labelKo: string; labelScope?: string };
  type ExtTerm = { id: number; canonicalId: string; code: string; termEn: string;
                   entryTerms: string[]; query: string | null; decidedBy: string };
  type Candidate = { code: string; termEn: string; entryTerms: string[]; scopeNote: string };

  const [segs, setSegs] = useState<SegValue[] | null>(null);
  const [terms, setTerms] = useState<ExtTerm[]>([]);
  const [editing, setEditing] = useState<string | null>(null);   // 지금 조회 중인 enum 값
  const [query, setQuery] = useState("");
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(defaultOpen);

  const refresh = useCallback(() => {
    api<ExtTerm[]>("/contract/external-terms").then(setTerms).catch(() => {});
  }, []);

  const load = () => {
    if (segs) return;
    api<{ fields: Record<string, { values: SegValue[] | null }>;
          axes?: { segment: string } }>("/contract/active")
      .then((c) => setSegs(c.fields[c.axes?.segment ?? "patient_segment"]?.values ?? []))
      .catch(() => {});
    refresh();
  };

  const lookup = async () => {
    setBusy(true); setErr(null); setCands(null);
    try {
      const out = await api<{ candidates: Candidate[]; cached: boolean }>(
        "/contract/external-terms/resolve",
        { method: "POST", role: "DATA_STEWARD", body: JSON.stringify({ query }) });
      setCands(out.candidates);
      if (out.candidates.length === 0) setErr("후보 없음 — 검색어를 영문 질환명 쪽으로 다듬어 보세요 (예: Lennox-Gastaut)");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const adopt = async (c: Candidate) => {
    setBusy(true); setErr(null);
    try {
      await api("/contract/external-terms", {
        method: "POST", role: "DATA_STEWARD",
        body: JSON.stringify({ canonicalId: editing,   // field 생략 = 서버가 계약의 환자군 축 사용 (08/26)
                               code: c.code, termEn: c.termEn, entryTerms: c.entryTerms, query }) });
      setEditing(null); setCands(null);
      refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    try {
      await api(`/contract/external-terms/${id}`, { method: "DELETE", role: "DATA_STEWARD" });
      refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const termOf = (v: string) => terms.find((t) => t.canonicalId === v);

  // SSR로 open 속성이 이미 붙어 나오면 toggle 이벤트가 안 온다 — 펼친 채 시작할 때는 직접 적재
  useEffect(() => { if (defaultOpen) load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <details className="mt-2 w-full" open={open}
             onToggle={(e) => { const el = e.target as HTMLDetailsElement; setOpen(el.open); if (el.open) load(); }}>
      <summary className="cursor-pointer text-xs font-bold text-navy">
        외부 표준 용어 매핑 (MeSH) — 근거 검증 검색어
      </summary>
      <p className="mt-2 text-[0.75rem] text-muted">
        질환형 환자군(LGS·PGTC 등)은 외부 근거 검색(PubMed·CT.gov)에 넣을 <b className="text-ink">표준
        영문 질환명</b>이 필요합니다 — <b className="text-ink">인구형(청소년·노인 등 연령 판정)은 검색어가
        필요 없어 매핑하지 않는 게 정상</b>입니다. 조회는 미국 국립의학도서관 MeSH 공공 API
        (결정론 · LLM 아님 · 응답 캐시 = 재조회 0원)이고, 어느 후보를 쓸지는 사람이 채택합니다.
        채택 결과는 가설 상세(<code>externalSearch</code>)로 Screen에 전달됩니다.
      </p>
      {err && <p className="mt-1 text-[0.75rem] font-bold text-rust">{err}</p>}
      {!segs ? (
        <p className="mt-2 text-xs text-muted">불러오는 중…</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-glass-line bg-card">
          <table className="w-full text-left text-[0.75rem]">
            <thead className="">
              <tr>
                {["환자군", "매핑 (MeSH)", "채택 정보", ""].map((h, i) => (
                  <th key={i} className={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {segs.filter((s) => s.value !== "UNSPECIFIED").map((s) => {
                const t = termOf(s.value);
                return (
                  <Fragment key={s.value}>
                    <tr className="align-top">
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <code className="font-bold text-navy">{s.value}</code>
                        <span className="ml-1 text-ink">{s.labelKo}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        {t ? (
                          <span>
                            <b className="text-ink">{t.termEn}</b>{" "}
                            <code className="rounded bg-fill-1 px-1 text-body">{t.code}</code>
                          </span>
                        ) : <span className="text-muted">— (인구형이면 이 상태가 정상)</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                        {t && <>{t.decidedBy} 채택{t.query && <> · 검색어 &ldquo;{t.query}&rdquo;</>}</>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">
                        <Btn size="xs"  onClick={() => { setEditing(s.value); setQuery(s.labelKo); setCands(null); setErr(null); }}
                                >
                          {t ? "다시 조회" : "MeSH 조회"}
                        </Btn>
                        {t && (
                          <Btn size="xs"  onClick={() => remove(t.id)}
                                  className={`ml-1 !text-rust`}>
                            해제
                          </Btn>
                        )}
                      </td>
                    </tr>
                    {editing === s.value && (
                      <tr className="bg-fill-1">
                        <td colSpan={4} className="px-2 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[0.75rem] text-muted">검색어 (영문 질환명 권장 — 약어는 MeSH에 없을 수 있음):</span>
                            <input value={query} onChange={(e) => setQuery(e.target.value)}
                                   onKeyDown={(e) => { if (e.key === "Enter") lookup(); }}
                                   className={`w-64 ${FIELD}`} />
                            <Btn size="xs" variant="primary"  onClick={lookup} disabled={busy || !query.trim()}
                                    >
                              {busy ? "조회 중…" : "조회"}
                            </Btn>
                            <button onClick={() => { setEditing(null); setCands(null); }}
                                    className="text-[0.75rem] text-muted underline">닫기</button>
                          </div>
                          {cands && cands.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {cands.map((c) => (
                                <li key={c.code} className="flex flex-wrap items-center gap-2 text-[0.75rem]">
                                  <Btn size="xs" variant="primary" onClick={() => adopt(c)} disabled={busy}>
                                    채택
                                  </Btn>
                                  <b className="text-ink">{c.termEn}</b>
                                  <code className="rounded bg-fill-1 px-1 text-body">{c.code}</code>
                                  {c.scopeNote && <span className="text-muted">— {c.scopeNote.slice(0, 120)}…</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
