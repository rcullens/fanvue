"use client";

import { FormEvent, useEffect, useState } from "react";
import { MIN_AGE, Persona, emptyPersona } from "@/lib/types";
import { ToneSlider } from "./ToneSlider";

type Props = {
  initial?: Persona | null;
  onSaved: (persona: Persona) => void;
  onCancel?: () => void;
};

type FormState = Omit<Persona, "id" | "createdAt" | "updatedAt" | "isActive" | "tags"> & {
  tagsText: string;
};

function toForm(p?: Persona | null): FormState {
  const base = p ?? emptyPersona({ name: "Ava" });
  return {
    name: base.name,
    age: base.age,
    raceEthnicity: base.raceEthnicity,
    location: base.location,
    education: base.education,
    occupation: base.occupation,
    bio: base.bio,
    personalityTraits: base.personalityTraits,
    hobbies: base.hobbies,
    languages: base.languages,
    appearanceNotes: base.appearanceNotes,
    voiceToneNotes: base.voiceToneNotes,
    baseSubscriptionPrice: base.baseSubscriptionPrice,
    contentTone: base.contentTone,
    mistakeRate: base.mistakeRate,
    tagsText: (base.tags || []).join(", "),
  };
}

export function PersonaForm({ initial, onSaved, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toForm(initial));
    setErrors({});
  }, [initial]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = {
      ...form,
      age: Number(form.age),
      baseSubscriptionPrice: Number(form.baseSubscriptionPrice),
      contentTone: Number(form.contentTone),
      mistakeRate: Number(form.mistakeRate),
      tags: form.tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    delete (payload as { tagsText?: string }).tagsText;

    try {
      const res = await fetch(
        initial ? `/api/personas/${initial.id}` : "/api/personas",
        {
          method: initial ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setErrors(json.errors || { form: json.error || "Save failed" });
        return;
      }
      onSaved(json.persona);
    } catch {
      setErrors({ form: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  const field = (
    key: keyof FormState,
    label: string,
    opts?: {
      type?: string;
      textarea?: boolean;
      min?: number;
      max?: number;
      step?: number;
      placeholder?: string;
      required?: boolean;
    }
  ) => (
    <div>
      <label className="label" htmlFor={String(key)}>
        {label}
        {opts?.required ? " *" : ""}
      </label>
      {opts?.textarea ? (
        <textarea
          id={String(key)}
          className="input min-h-[88px] resize-y"
          value={String(form[key] ?? "")}
          placeholder={opts?.placeholder}
          onChange={(e) => set(key, e.target.value as FormState[typeof key])}
        />
      ) : (
        <input
          id={String(key)}
          className="input"
          type={opts?.type || "text"}
          min={opts?.min}
          max={opts?.max}
          step={opts?.step}
          required={opts?.required}
          placeholder={opts?.placeholder}
          value={form[key] as string | number}
          onChange={(e) => {
            const v =
              opts?.type === "number" ? Number(e.target.value) : e.target.value;
            set(key, v as FormState[typeof key]);
          }}
        />
      )}
      {errors[key] && (
        <p className="mt-1 text-xs text-rose-300">{errors[key]}</p>
      )}
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {errors.form && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {errors.form}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Name", { required: true, placeholder: "Ava Night" })}
        {field("age", "Age (min 21)", {
          type: "number",
          min: MIN_AGE,
          max: 99,
          required: true,
        })}
        {field("raceEthnicity", "Race / ethnicity", {
          placeholder: "e.g. Latina, East Asian, Mixed…",
        })}
        {field("location", "Location", { placeholder: "City / vibe" })}
        {field("education", "Education")}
        {field("occupation", "Occupation", { placeholder: "Creator, model…" })}
      </div>

      {field("bio", "Bio", {
        textarea: true,
        placeholder: "Short first-person bio fans will see…",
      })}

      <div className="grid gap-4 sm:grid-cols-2">
        {field("personalityTraits", "Personality traits", {
          placeholder: "warm, witty, curious",
        })}
        {field("hobbies", "Hobbies", {
          placeholder: "yoga, cooking, late-night talks",
        })}
        {field("languages", "Languages", { placeholder: "English, Spanish" })}
        {field("baseSubscriptionPrice", "Base subscription price ($)", {
          type: "number",
          min: 0,
          step: 0.01,
        })}
      </div>

      {field("appearanceNotes", "Appearance notes", {
        textarea: true,
        placeholder: "Hair, style, vibe (fictional adult)…",
      })}
      {field("voiceToneNotes", "Voice / tone notes", {
        textarea: true,
        placeholder: "Casual, playful, uses slang…",
      })}
      {field("tagsText", "Tags (comma-separated)", {
        placeholder: "fitness, gamer, soft-domme",
      })}

      <ToneSlider
        value={form.contentTone}
        onChange={(v) => set("contentTone", v)}
      />

      <div className="card p-5">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="text-sm font-semibold">Mistake rate</h3>
            <p className="text-xs text-[var(--muted)]">
              Typos, filler words, casual grammar in mock / humanized replies
            </p>
          </div>
          <span className="badge bg-white/10 text-white/80">
            {Math.round(form.mistakeRate * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(form.mistakeRate * 100)}
          onChange={(e) => set("mistakeRate", Number(e.target.value) / 100)}
          className="tone-slider w-full"
        />
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
        Age must be {MIN_AGE}+. Under-21 / CSAM content is blocked. NSFW applies
        to fictional adult personas only.
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : initial ? "Update persona" : "Create persona"}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
