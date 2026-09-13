import { MIN_AGE, Persona } from "./types";

export type ValidationErrors = Partial<Record<keyof Persona | "form", string>>;

export function validatePersona(
  input: Partial<Persona>
): { ok: true; data: Partial<Persona> } | { ok: false; errors: ValidationErrors } {
  const errors: ValidationErrors = {};

  const name = (input.name ?? "").trim();
  if (!name) errors.name = "Name is required";
  if (name.length > 80) errors.name = "Name must be under 80 characters";

  const age = Number(input.age);
  if (!Number.isFinite(age)) {
    errors.age = `Age is required (minimum ${MIN_AGE})`;
  } else if (age < MIN_AGE) {
    errors.age = `Age must be at least ${MIN_AGE}. Under-21 personas are not allowed.`;
  } else if (age > 99) {
    errors.age = "Age must be 99 or under";
  } else if (!Number.isInteger(age)) {
    errors.age = "Age must be a whole number";
  }

  const price = Number(input.baseSubscriptionPrice);
  if (!Number.isFinite(price) || price < 0) {
    errors.baseSubscriptionPrice = "Subscription price must be a non-negative number";
  } else if (price > 999) {
    errors.baseSubscriptionPrice = "Price seems too high";
  }

  const tone = Number(input.contentTone ?? 0);
  if (tone < 0 || tone > 100) {
    errors.contentTone = "Content tone must be 0–100";
  }

  const mistake = Number(input.mistakeRate ?? 0);
  if (mistake < 0 || mistake > 1) {
    errors.mistakeRate = "Mistake rate must be 0–1";
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      ...input,
      name,
      age: Math.floor(age),
      baseSubscriptionPrice: Math.round(price * 100) / 100,
      contentTone: Math.min(100, Math.max(0, tone)),
      mistakeRate: Math.min(1, Math.max(0, mistake)),
      tags: Array.isArray(input.tags)
        ? input.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
        : [],
    },
  };
}

export function assertAdultPersona(persona: Pick<Persona, "age" | "name">): void {
  if (persona.age < MIN_AGE) {
    throw new Error(
      `Refusing persona under ${MIN_AGE}. Fanvue AI Profile Studio only supports 21+ adult fictional personas.`
    );
  }
}
