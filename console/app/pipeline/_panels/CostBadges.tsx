"use client";

import type { Agent } from "../_lib/types";
import { Chip } from "@/app/components/ui";

// 단계별 비용 구조 배지 (08/25) — 이 단계가 어떤 모드로 돌고 얼마가 드는지를
// 화면이 스스로 말한다. 값은 서버(/system/agents)의 실제 설정에서 온다.
//
// 색으로 가르지 않는다 (08/26): 여기 있는 것은 상태가 아니라 비용 구조 정보다.
// 사람이 눌러서 절약할 수 있는 것(배치)만 오렌지, 나머지는 중립 유리.
export default function CostBadges({ spec, alwaysOpen }: { spec?: Agent; alwaysOpen?: boolean }) {
  if (!spec) return null;
  // 접어 둔다 (08/26 — 건태): 이건 **이 단계가 지금 무슨 상태인가**가 아니라
  // 비용 구조가 어떻게 생겼는가다. 값은 정확하지만(서버 /system/agents 그대로)
  // 매번 볼 것은 아니라서 카드 머리에서 네 줄을 차지할 이유가 없다.
  return (
    <details className="group mt-2" open={alwaysOpen}>
      {!alwaysOpen && (
        <summary className="mono inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg text-[0.75rem] text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange">
          <span aria-hidden>▶</span>{/* 회전은 globals.css 전역 규칙이 한다 — 여기 클래스를 붙이면 180도 돈다 */}
          비용 구조
        </summary>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {spec.batchSupported && (
        <span title="이 단계의 대량 호출은 배치 API로 처리할 수 있습니다 — 정가의 50%. 아래 '배치 프리로드' 카드에서 실행">
          <Chip tone="orange"><span aria-hidden>📦</span>배치 지원 (반값)</Chip>
        </span>
      )}
      {spec.promptCaching && (
        <span title="매 호출 동일한 부분(페르소나·규칙·허용값 표)을 캐시해 재사용합니다 — 그 부분의 입력비가 1/10. 모델이 읽는 내용은 동일">
          <Chip><span aria-hidden>♻️</span>프롬프트 캐싱</Chip>
        </span>
      )}
      <span title="같은 입력이면 저장된 응답을 재생합니다 — API를 부르지 않아 0원. 호출 기록에는 CACHE로 남습니다">
        <Chip><span aria-hidden>🔁</span>응답 캐시 재생 (0원)</Chip>
      </span>
      {spec.effort && (
        <span title="effort — 모델의 사고 깊이. 낮추면 출력 토큰(=비용)이 줄어듭니다">
          <Chip><span aria-hidden>🧠</span>사고 {spec.effort}</Chip>
        </span>
      )}
      {spec.rate && (
        <span title={`입력/출력 백만 토큰당 단가${spec.rate.noteKo ? ` — ${spec.rate.noteKo}` : ""}`}>
          <Chip><span aria-hidden>💵</span>${spec.rate.in}/${spec.rate.out} per 1M</Chip>
        </span>
      )}
      </div>
    </details>
  );
}
