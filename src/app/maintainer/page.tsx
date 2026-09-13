import { MaintainerPanel } from "@/components/MaintainerPanel";

export default function MaintainerPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Maintainer</h1>
        <p className="text-sm text-[var(--muted)]">
          Fanvue ops panel · simulated metrics · dynamic pricing · checklist export
        </p>
      </div>
      <MaintainerPanel />
    </div>
  );
}
