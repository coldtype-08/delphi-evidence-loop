/**
 * 활성 스키마 — 계약이 지금 무엇을 담고 있나 (08/31 재구성).
 *
 * 그전에는 필드 18개가 **같은 위계로 나열**되어 세 가지가 전달되지 않았다:
 *  ① 집계의 기준이 되는 분석 축 2개를 구분할 수 없었다.
 *  ② 자유 서술 필드가 「허용값 0」으로 표기되어 정의가 누락된 필드처럼 보였다.
 *  ③ 각 필드의 실제 사용 현황을 확인할 수 없었다.
 *
 * 이제 **정의 주체**로 세 묶음을 만든다 — 분석 축 / 고정 헤더 / 발견 헤더.
 * 계층 판정은 해석이 아니라 계약이 갖고 있는 기록이고(`fixed_headers.yaml`),
 * 사용량은 서버가 센 값이다. 화면은 세지 않는다.
 */

import { api } from "@/lib/api";
import { Panel, Eyebrow, Chip, Topbar } from "@/app/components/ui";
import ContractTabs from "./tabs";
import { fmt, type SchemaView, type SchemaField } from "./_schema-view";

export const dynamic = "force-dynamic";

/** 필드 목록 — 라벨과 키만 (08/31 정리).
 *
 * 그전에는 「종류」·「쓰인 값」 두 열이 더 있었다. 이 화면이 답하는 질문은
 * **«계약에 무엇이 들어 있나»** 하나이고, 사용량은 「유래」 화면이 범주 단위로
 * 답한다 — 같은 숫자를 두 화면이 다른 낟알로 말하면 둘 다 흐려진다.
 *
 * 두 칸씩 세우는 이유: 열이 둘로 줄면 한 줄짜리 표는 오른쪽 절반이 비어 버린다.
 */
function FieldRows({ items }: { items: SchemaField[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-glass-line
                    bg-line sm:grid-cols-2">
      {items.map((f) => (
        <div key={f.key}
             className={`flex items-baseline gap-3 px-3.5 py-2.5 ${
               f.isAxis ? "bg-orange/[.05]" : "bg-card"}`}>
          <span className="min-w-0 text-[0.84rem] font-semibold text-navy">
            {f.isAxis && (
              <span className="mono mr-1.5 rounded bg-orange-deep px-1.5 py-px align-[1px]
                               text-[0.6rem] font-bold text-on-navy">축</span>
            )}
            {f.labelKo}
          </span>
          <code className="mono ml-auto truncate text-[0.71rem] text-faint">{f.key}</code>
        </div>
      ))}
    </div>
  );
}

function Group({ title, badge, badgeTone, note, items, children }: {
  title: string; badge: string; badgeTone: "hot" | "cool"; note: string;
  items: SchemaField[]; children?: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className="text-[0.95rem] font-bold text-navy">{title}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold ${
          badgeTone === "hot" ? "bg-orange-soft text-orange-deep" : "bg-fill-2 text-navy"}`}>
          {badge}
        </span>
        <span className="mono ml-auto text-[0.7rem] text-faint">
          {items.length}개 필드
        </span>
        <p className="basis-full text-[0.78rem] leading-[1.7] text-muted">{note}</p>
      </div>
      <div className="mt-2.5">
        <FieldRows items={items} />
        {children}
      </div>
    </section>
  );
}

export default async function ContractPage() {
  let view: SchemaView | null = null;
  let error: string | null = null;
  try {
    view = await api<SchemaView>("/contract/schema-view");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const fields = view?.fields ?? [];
  const axes = fields.filter((f) => f.isAxis);
  const fixed = fields.filter((f) => f.layer === "FIXED" && !f.isAxis);
  const found = fields.filter((f) => f.layer === "DISCOVERED");
  const active = view?.versions.find((v) => v.status === "ACTIVE");

  return (
    <>
      <Topbar title="Data Contract" right={<Chip tone="navy">AI 변경 불가</Chip>} />

      <div className="mx-auto max-w-4xl">
        <Eyebrow>DATA CONTRACT</Eyebrow>
        <h1 className="mt-2 text-[1.5rem] font-bold leading-[1.25] tracking-tight text-navy">
          활성 스키마 {view && <span className="text-orange-deep">v{view.version}</span>}
        </h1>
        <p className="mt-1.5 max-w-[72ch] text-[0.9375rem] leading-[1.7] text-body">
          추출·검증·DB·Field 폼·필터·에이전트 여섯 곳이 이 정의 하나를 공유합니다. AI 는 이 정의를 스스로
          바꿀 수 없으며, 변경은 「변경 심사」를 거쳐 Data Steward 가 승인해야 반영됩니다.
        </p>

        <ContractTabs active="schema" />

        {error && (
          <Panel tone="note" pad="md" className="mt-4 text-[0.9375rem] text-rust">{error}</Panel>
        )}

        {view && (
          <>
            {/* 요약 — 「무엇이 몇 개이고 누가 정했나」를 먼저. 홈 KPI 스트립과 같은 재질
                (카드 넉 장이 아니라 헤어라인 한 장 · gap-px + bg-line). */}
            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl
                            border border-line bg-line xl:grid-cols-4">
              {[
                { lb: "필드", v: fmt(fields.length), u: "개",
                  nt: `분석 축 ${axes.length}개 · 속성 필드 ${fields.length - axes.length}개` },
                { lb: "도메인 전문가 정의", v: fmt(axes.length + fixed.length), u: "개",
                  nt: "고정 헤더 · 시장 확대 판단에 필요한 항목" },
                { lb: "AI 발견", v: fmt(found.length), u: "개",
                  nt: "발견 헤더 · 코퍼스 분석으로 제안된 항목" },
                // 08/31: 여기도 「이 버전으로 N건 판독」이었다 — 활성 버전의 stamp 만 세어
                // 2건이 나왔고, 그게 "지금 계약은 2건밖에 못 읽었다"로 읽혔다. 실제로 활성
                // 계약으로 읽히는 것은 «같은 필드 구성으로 판독된 전부»다 (서버가 잰다).
                { lb: "확정", v: active?.approvedAt ? active.approvedAt.slice(5, 10) : "—",
                  u: active?.approvedBy ?? "", nt: `이 계약으로 ${fmt(view.readableUnderActive)}건 판독` },
              ].map((t) => (
                <div key={t.lb} className="bg-card px-4 py-3.5">
                  <div className="mono text-[0.66rem] uppercase tracking-[0.12em] text-faint">{t.lb}</div>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-[1.6rem] font-medium leading-none tabular-nums text-navy">{t.v}</span>
                    <span className="mono text-[0.72rem] text-faint">{t.u}</span>
                  </div>
                  <p className="mt-1.5 text-[0.7rem] leading-[1.55] text-muted">{t.nt}</p>
                </div>
              ))}
            </div>

            <Group title="분석 축" badge="필수" badgeTone="hot" items={axes}
                   note="반복 횟수와 독립 의료진 수를 이 두 축의 조합으로 집계합니다. 집계값이 임계에 도달하면 가설이 생성됩니다.">
              {/* 축의 허용값만 펼쳐 둔다 — 이 화면이 「무엇으로 세는가」를 말하는 자리다.
                  나머지 enum 까지 펼치면 값 46개가 화면을 덮어 축이 묻힌다. */}
              {axes.map((f) => (
                <div key={f.key} className="mt-2 flex flex-wrap gap-1.5">
                  {f.values.map((v) => (
                    <span key={v.value}
                          title={v.labelKo ?? undefined}
                          className={`mono rounded-md border px-2 py-0.5 text-[0.7rem] ${
                            v.labelScope === "OUT_OF_LABEL"
                              ? "border-orange-soft bg-orange/[.08] text-orange-deep"
                              : "border-line-2 bg-fill-1 text-body"}`}>
                      {v.value}
                    </span>
                  ))}
                </div>
              ))}
            </Group>

            <Group title="고정 헤더" badge="도메인 전문가 정의" badgeTone="hot" items={fixed}
                   note="시장 확대 판단에 필요한 항목으로, 도메인 지식을 가진 담당자가 데이터를 보기 전에 확정했습니다. AI 의 발견 대상이 아니라 요구사항입니다." />

            <Group title="발견 헤더" badge="AI 발견" badgeTone="cool" items={found}
                   note="분할 독해 과정에서 AI 가 이 코퍼스에만 있는 항목으로 제안한 것입니다. 반복이 누적되면 변경 심사를 거쳐 계약이 확장됩니다." />

            {/* 08/31: 여기 있던 「SCP 는 지금 비어 있습니다 · POST_STROKE 가 일부러 없고」
                안내를 지웠다. 사실과 다르고(post_stroke_epilepsy 가 지금 계약에 있다),
                SCP 큐는 08/28 에 「변경 심사」 탭으로 옮겨 갔다. */}
            <p className="mt-4 text-[0.75rem] leading-[1.7] text-muted">
              스키마를 바꾸는 일은 <b className="font-medium text-ink">변경 심사</b> 탭에서 합니다.
            </p>
          </>
        )}
      </div>
    </>
  );
}
