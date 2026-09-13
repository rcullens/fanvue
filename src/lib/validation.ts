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

  const data: Partial<Persona> = {
    ...input,
    name,
    age: Math.floor(age),
    baseSubscriptionPrice: Math.round(price * 100) / 100,
    contentTone: Math.min(100, Math.max(0, tone)),
    mistakeRate: Math.min(1, Math.max(0, mistake)),
    tags: Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
      : [],
  };

  if (Array.isArray(input.ppvCatalog)) {
    data.ppvCatalog = input.ppvCatalog
      .map((item) => ({
        id: String(item.id || crypto.randomUUID()),
        title: String(item.title || "").trim().slice(0, 120),
        description: String(item.description || "").trim().slice(0, 500),
        priceCents: Math.max(300, Math.round(Number(item.priceCents) || 300)),
        mediaUuids: Array.isArray(item.mediaUuids)
          ? item.mediaUuids.map(String).slice(0, 20)
          : undefined,
        pitchHints: item.pitchHints
          ? String(item.pitchHints).trim().slice(0, 240)
          : undefined,
      }))
      .filter((i) => i.title)
      .slice(0, 40);
  }

  if (input.salesPolicy && typeof input.salesPolicy === "object") {
    const sp = input.salesPolicy;
    data.salesPolicy = {
      maxPpvOffersPerDay: Math.max(0, Math.min(50, Number(sp.maxPpvOffersPerDay) || 0)),
      minMessagesBeforePitch: Math.max(0, Math.min(100, Number(sp.minMessagesBeforePitch) || 0)),
      cooldownHoursAfterOfferOrPurchase: Math.max(
        0,
        Math.min(168, Number(sp.cooldownHoursAfterOfferOrPurchase) || 0)
      ),
      allowAutoSend: sp.allowAutoSend === true,
      quietHours: sp.quietHours?.start && sp.quietHours?.end
        ? { start: String(sp.quietHours.start), end: String(sp.quietHours.end) }
        : undefined,
    };
  }

  return { ok: true, data };
}

export function assertAdultPersona(persona: Pick<Persona, "age" | "name">): void {
  if (persona.age < MIN_AGE) {
    throw new Error(
      `Refusing persona under ${MIN_AGE}. Fanvue AI Profile Studio only supports 21+ adult fictional personas.`
    );
  }
}
