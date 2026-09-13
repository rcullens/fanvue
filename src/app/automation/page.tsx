import { AutomationPanel } from "@/components/AutomationPanel";

export default function AutomationPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Automation</h1>
        <p className="page-sub">
          Shared mock/LLM engine · persona packs · sales policy · PPV drafts ·
          approval queue · $0 mock by default
        </p>
      </div>
      <AutomationPanel />
    </div>
  );
}
