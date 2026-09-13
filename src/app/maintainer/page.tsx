import { MaintainerPanel } from "@/components/MaintainerPanel";

export default function MaintainerPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Maintainer</h1>
        <p className="page-sub">
          Ops console · Mock / Checklist / Live Fanvue · honest remote writes only
        </p>
      </div>
      <MaintainerPanel />
    </div>
  );
}
