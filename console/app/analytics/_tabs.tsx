import { TabBar } from "@/app/components/ui";

/** 홈 대시보드의 서브탭 (08/28).
 *
 * 홈은 "라인이 지금 어디까지 왔나"만 말하고, **무엇이 보이는가**는 이 탭들이 말한다.
 * 전부 같은 재료(claims·interactions·safety_candidates)를 다른 축으로 자른 것이라
 * 별도 화면이 아니라 홈의 서브탭이 맞다.
 *
 * 숫자 배지는 붙이지 않는다 — 탭마다 세는 대상이 달라(환자군 / 이관 건 / 의료진)
 * 나란히 놓으면 비교되는 것처럼 보인다. 각 탭이 자기 숫자를 안에서 말한다.
 *
 * **「신규 적응증」을 뺐다 (08/29 팀장: "환자군 확장이랑 겹치는 거 같은데").**
 * 겹치는 게 맞았다 — 그 탭이 세던 질환 표현 52종의 대부분은 새 질환이 아니라
 * **같은 환자군을 다르게 부른 표기**였다(전신발작 13종 · 청소년 24종 · LGS 5종).
 * 별도 분석 축이 아니라 표기 정규화(온톨로지) 재료이므로 「환자군 확장」 안의
 * 패널 하나로 옮겼다. 탭 여섯이 다섯이 됐다.
 */
export const ANALYTICS_TABS = [
  { id: "overview", label: "개요", href: "/" },
  { id: "segments", label: "환자군 확장", href: "/analytics?tab=segments" },
  { id: "safety", label: "안전성 신호", href: "/analytics?tab=safety" },
  { id: "kol", label: "KOL 탐색", href: "/analytics?tab=kol" },
  { id: "trend", label: "추이 분석", href: "/analytics?tab=trend" },
];

export default function AnalyticsTabs({ current }: { current: string }) {
  return (
    <div className="mt-5">
      <TabBar items={ANALYTICS_TABS} active={current} />
    </div>
  );
}
