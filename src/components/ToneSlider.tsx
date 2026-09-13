"use client";

type Props = {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  compact?: boolean;
};

function labelFor(v: number): string {
  if (v < 20) return "Friendly chat (SFW)";
  if (v < 45) return "Warm · light flirty";
  if (v < 70) return "Suggestive blend";
  if (v < 90) return "NSFW explicit";
  return "NSFW XXX";
}

export function ToneSlider({ value, onChange, disabled, compact }: Props) {
  return (
    <div className={compact ? "" : "card p-5"}>
      {!compact && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Content tone</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Left = friendly SFW · Right = NSFW XXX (21+ fictional only)
            </p>
          </div>
          <span className="badge bg-violet-500/20 text-violet-200">
            {value} · {labelFor(value)}
          </span>
        </div>
      )}
      {compact && (
        <div className="mb-2 flex justify-between text-xs text-[var(--muted)]">
          <span>Friendly</span>
          <span className="text-violet-200">{labelFor(value)}</span>
          <span>NSFW XXX</span>
        </div>
      )}
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tone-slider w-full"
        aria-label="Content tone slider"
      />
      {!compact && (
        <div className="mt-2 flex justify-between text-[11px] text-[var(--muted)]">
          <span>Friendly</span>
          <span>Flirty</span>
          <span>Suggestive</span>
          <span>Explicit</span>
          <span>XXX</span>
        </div>
      )}
    </div>
  );
}
