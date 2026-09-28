import { api } from "@/lib/api";
import { Panel, Eyebrow, Chip, Quote, Topbar, Placeholder } from "@/app/components/ui";

type Cand = { id: string; interactionId: string; verbatimQuote: string; routedAt: string; status: string };

export const dynamic = "force-dynamic";

export default async function SafetyPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  // Screen 안전성 줄이 짚어 보낸 건들 (08/31) — «어느 2건인지»를 여기서 바로 찾게 한다.
  // 링크로 온 식별번호일 뿐 조회 권한 규약은 그대로다(이 화면만 SAFETY 롤).
  const { focus = "" } = await searchParams;
  const focusIds = new Set(focus.split(",").map((x) => x.trim()).filter(Boolean));
  let cands: Cand[] = [];
  let error: string | null = null;
  try {
    // 이 화면만 SAFETY 롤로 조회 — 다른 롤은 서버가 403으로 막는 것이 정상 동작 (절대 규칙 #6)
    cands = await api<Cand[]>("/safety/candidates", { role: "SAFETY" });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <Topbar
        title="안전"
        right={<Chip tone="orange">집계 반영 0</Chip>}
      />

      <div className="mx-auto max-w-4xl">
        <Eyebrow>AUDIT</Eyebrow>
        <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
          안전성·차단 로그
        </h1>
        <p className="mt-1.5 max-w-[72ch] text-[0.9375rem] leading-[1.7] text-body">
          AE 후보는 일반 분석 흐름과 분리됩니다 — 집계·가설·Screen은 이 데이터를 읽지 않습니다
         . 이 화면은 SAFETY 롤 헤더로만 조회합니다.
        </p>

        {error && (
          <Panel tone="note" pad="md" className="mt-4 text-[0.9375rem] text-rust">{error}</Panel>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {cands.length === 0 && !error && (
            <Placeholder title="분리된 AE 후보 없음">
              추출이 이상사례 후보를 이 경로로 보내기 시작하면 여기 쌓입니다.
              합성 코퍼스에 해당 후보 5건이 포함돼 있습니다.
            </Placeholder>
          )}

          {[...cands]
            .sort((x, y) => Number(focusIds.has(y.id)) - Number(focusIds.has(x.id)))
            .map((c) => (
            <Panel key={c.id} pad="md"
                   className={focusIds.has(c.id) ? "ring-2 ring-orange-soft border-orange" : undefined}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono text-[0.8125rem] font-medium text-navy">{c.id}</span>
                <Chip tone="orange">{c.status}</Chip>
                {focusIds.has(c.id) && <Chip>Screen에서 짚어 온 건</Chip>}
                <span className="mono ml-auto text-[0.75rem] text-muted">{c.routedAt}</span>
              </div>
              <Quote>{c.verbatimQuote}</Quote>
            </Panel>
          ))}

          <Placeholder title="Critic 차단 이력">
            근거가 원문과 맞지 않는 판정은 저장되지 않고 이 목록에 남습니다 —
            막은 것을 기록으로 남기는 것이 이 화면의 일입니다. 합성 코퍼스에 그 사례 2건이 포함돼 있습니다.
          </Placeholder>
        </div>
      </div>
    </>
  );
}
