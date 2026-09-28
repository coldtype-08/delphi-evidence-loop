import { TabBar } from "@/app/components/ui";

/** /contract 하위 화면 공용 탭 — 활성 스키마 ↔ 유래(Provenance).
 *  경로가 바뀌는 전환이라 TabBar 의 href 모드를 쓴다 (08/26). */
export default function ContractTabs({ active }: { active: "schema" | "provenance" | "evolve" | "ontology" }) {
  return (
    <div className="mt-4">
      <TabBar
        active={active}
        items={[
          { id: "schema", label: "활성 스키마", href: "/contract" },
          { id: "provenance", label: "유래 — 어디서 왔는가", href: "/contract/provenance" },
          // 08/28: AI Readable 전환에 있던 SCP 큐·구조 루프 도구를 여기로 옮겼다.
          // 계약을 고치는 일은 전부 Data Contract 아래로 모은다.
          { id: "evolve", label: "변경 심사", href: "/contract/evolve" },
          // 08/28: 사전(canonical 125·표면형 164)이 화면 없이 잠들어 있었다.
          // docs/02 는 §2 스키마와 §3 어휘를 같은 문서의 형제로 둔다 — 한 계약의 두 면이다.
          { id: "ontology", label: "온톨로지", href: "/contract/ontology" },
        ]}
      />
    </div>
  );
}
