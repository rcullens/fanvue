/**
 * Process one inbound fan message:
 * load pack → history → draft → policy pitch → queue or send.
 * Mock mode works with $0 and no Fanvue credentials.
 * Live send only when OAuth connected AND (allowAutoSend or explicit approve).
 */
import { readStore, updateStore } from "../store";
import {
  AutomationLogEntry,
  AutomationQueueItem,
  ChatMessage,
  MIN_PPV_CENTS,
} from "../types";
import { loadTokens } from "../fanvue/tokens";
import { fanvueFetch, FanvueApiError } from "../fanvue/api";
import { buildPersonaPack } from "./persona-pack";
import {
  bumpFanMessage,
  bumpFanOffer,
  decidePitch,
} from "./sales-policy";
import { draftAutomationReply } from "./draft-reply";

export type ProcessInboundInput = {
  fanUserUuid: string;
  inboundText: string;
  fanHandle?: string;
  fanDisplayName?: string;
  personaId?: string;
  /** Prefer live Fanvue history when connected */
  preferLive?: boolean;
  source?: AutomationQueueItem["source"];
  /** Force mock path even if tokens exist */
  forceMock?: boolean;
};

function logEntry(
  partial: Omit<AutomationLogEntry, "id" | "createdAt">
): AutomationLogEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

function friendlyFanvueError(err: unknown): string {
  if (err instanceof FanvueApiError) {
    if (err.status === 401) {
      return "Fanvue auth expired — reconnect OAuth in Maintainer";
    }
    if (err.status === 403) {
      return "Fanvue forbidden — check chat scopes (read:chat / write:chat)";
    }
    if (err.status === 429) {
      return "Fanvue rate limit — wait a bit, then retry Pull unread";
    }
    return err.message || `Fanvue API ${err.status}`;
  }
  if (err instanceof Error) return err.message;
  return "Unknown Fanvue error";
}

async function fetchLiveHistory(
  fanUserUuid: string,
  myUuid?: string
): Promise<ChatMessage[]> {
  const history = await fanvueFetch<{
    data: Array<{
      text?: string | null;
      sender?: { uuid?: string };
      sentAt?: string | null;
    }>;
  }>(
    `/chats/${encodeURIComponent(fanUserUuid)}/messages?size=16&markAsRead=false`
  );
  const msgs = history.data || [];
  return [...msgs]
    .reverse()
    .filter((m) => m.text)
    .map((m, i) => {
      const fromMe = myUuid && m.sender?.uuid === myUuid;
      return {
        id: `fv-${i}`,
        role: (fromMe ? "assistant" : "user") as "assistant" | "user",
        content: String(m.text),
        createdAt: m.sentAt || new Date().toISOString(),
      };
    });
}

export async function sendFanvueMessage(opts: {
  fanUserUuid: string;
  text: string;
  priceCents?: number | null;
  mediaUuids?: string[];
}): Promise<{ messageUuid: string }> {
  const body: Record<string, unknown> = { text: opts.text };
  if (opts.priceCents != null && opts.priceCents >= MIN_PPV_CENTS) {
    body.price = opts.priceCents;
    if (opts.mediaUuids?.length) body.mediaUuids = opts.mediaUuids;
  }
  return fanvueFetch<{ messageUuid: string }>(
    `/chats/${encodeURIComponent(opts.fanUserUuid)}/message`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function processInboundMessage(
  input: ProcessInboundInput
): Promise<{ queueItem: AutomationQueueItem; autoSent: boolean }> {
  const store = await readStore();
  const personaId =
    input.personaId ||
    store.settings.activePersonaId ||
    store.personas[0]?.id;
  const persona = store.personas.find((p) => p.id === personaId);
  if (!persona) {
    throw new Error("No persona — create/activate one first");
  }

  const tokens = input.forceMock ? null : await loadTokens();
  const mode: "mock" | "live" =
    tokens && input.preferLive !== false ? "live" : "mock";

  const pack = buildPersonaPack(persona);
  const fanKey = input.fanUserUuid;
  let fanState = bumpFanMessage(store.fanSales[fanKey], fanKey);

  let history: ChatMessage[] = [];
  if (mode === "live") {
    try {
      history = await fetchLiveHistory(fanKey, tokens?.profile?.uuid);
    } catch {
      history = store.chatSessions[persona.id]?.messages?.slice(-16) || [];
    }
  } else {
    history = store.chatSessions[persona.id]?.messages?.slice(-16) || [];
  }

  const inboundMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: input.inboundText,
    createdAt: new Date().toISOString(),
  };
  history = [...history, inboundMsg];

  const pitch = decidePitch({
    persona,
    fanState,
    catalog: pack.ppvCatalog,
  });

  const draft = await draftAutomationReply({
    persona,
    history,
    inboundText: input.inboundText,
    pitch,
  });

  const catalogItem =
    draft.ppvItemId && pitch.pitch && pitch.item.id === draft.ppvItemId
      ? pitch.item
      : pitch.pitch
        ? pitch.item
        : null;

  const now = new Date().toISOString();
  let queueItem: AutomationQueueItem = {
    id: crypto.randomUUID(),
    personaId: persona.id,
    fanUserUuid: fanKey,
    fanHandle: input.fanHandle,
    fanDisplayName: input.fanDisplayName,
    inboundText: input.inboundText,
    draftText: draft.text,
    ppvItemId: catalogItem?.id ?? null,
    ppvPriceCents: catalogItem?.priceCents ?? null,
    ppvMediaUuids: catalogItem?.mediaUuids,
    policyReason: draft.policyReason || pitch.reason,
    pitchStyle: draft.pitchStyle || (pitch.pitch ? pitch.style : undefined),
    status: "pending",
    mode,
    source: input.source || "manual",
    createdAt: now,
    updatedAt: now,
  };

  let autoSent = false;

  if (pack.salesPolicy.allowAutoSend) {
    if (mode === "live") {
      try {
        const result = await sendFanvueMessage({
          fanUserUuid: fanKey,
          text: draft.text,
          priceCents: catalogItem?.priceCents,
          mediaUuids: catalogItem?.mediaUuids,
        });
        queueItem = {
          ...queueItem,
          status: "sent",
          remoteMessageUuid: result.messageUuid,
          updatedAt: new Date().toISOString(),
        };
        autoSent = true;
        if (catalogItem) fanState = bumpFanOffer(fanState);
      } catch (err) {
        const msg = friendlyFanvueError(err);
        queueItem = {
          ...queueItem,
          status: "failed",
          error: msg,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      queueItem = {
        ...queueItem,
        status: "sent",
        remoteMessageUuid: `mock-${crypto.randomUUID()}`,
        updatedAt: new Date().toISOString(),
      };
      autoSent = true;
      if (catalogItem) fanState = bumpFanOffer(fanState);
    }
  }

  await updateStore((s) => {
    s.fanSales[fanKey] = fanState;
    s.automationQueue.unshift(queueItem);
    s.automationQueue = s.automationQueue.slice(0, 200);
    s.automationLog.unshift(
      logEntry({
        kind: autoSent ? "send" : pitch.pitch ? "draft" : "policy_block",
        summary: autoSent
          ? `Auto-sent to ${input.fanHandle || fanKey} (${mode})`
          : `Draft queued for ${input.fanHandle || fanKey} (${mode})${
              catalogItem ? ` +PPV ${catalogItem.title}` : " · reply-only"
            }`,
        detail: pitch.reason,
        queueId: queueItem.id,
      })
    );
    s.automationLog = s.automationLog.slice(0, 300);
    if (mode === "mock") {
      const sess = s.chatSessions[persona.id] || {
        personaId: persona.id,
        messages: [],
        updatedAt: now,
      };
      sess.messages = [...sess.messages, inboundMsg].slice(-80);
      if (autoSent) {
        sess.messages.push({
          id: crypto.randomUUID(),
          role: "assistant",
          content: draft.text,
          createdAt: new Date().toISOString(),
        });
      }
      sess.updatedAt = new Date().toISOString();
      s.chatSessions[persona.id] = sess;
    }
  });

  return { queueItem, autoSent };
}

export async function pullUnreadAndDraft(opts?: {
  personaId?: string;
  limit?: number;
}): Promise<{
  processed: number;
  items: AutomationQueueItem[];
  error?: string;
  empty?: boolean;
  skipped?: number;
}> {
  const tokens = await loadTokens();
  if (!tokens) {
    return {
      processed: 0,
      items: [],
      error:
        "Not connected to Fanvue — use Simulate fan message (mock, $0) or Connect OAuth first",
    };
  }

  let data: {
    data: Array<{
      user?: { uuid: string; handle?: string; displayName?: string };
      lastMessage?: { text?: string | null; senderUuid?: string };
      unreadMessagesCount?: number;
    }>;
  };

  try {
    data = await fanvueFetch<typeof data>(
      "/chats?filter=unread&page=1&size=50"
    );
  } catch (err) {
    const msg = friendlyFanvueError(err);
    await updateStore((s) => {
      s.automationLog.unshift(
        logEntry({
          kind: "error",
          summary: "Unread pull failed",
          detail: msg,
        })
      );
    });
    return { processed: 0, items: [], error: msg };
  }

  const all = data.data || [];
  if (!all.length) {
    await updateStore((s) => {
      s.automationLog.unshift(
        logEntry({
          kind: "run",
          summary: "Unread pull — no unread chats",
        })
      );
    });
    return {
      processed: 0,
      items: [],
      empty: true,
      error: undefined,
    };
  }

  const chats = all.slice(0, opts?.limit ?? 10);
  const items: AutomationQueueItem[] = [];
  let skipped = 0;
  let lastErr: string | undefined;

  for (const chat of chats) {
    const uuid = chat.user?.uuid;
    if (!uuid) {
      skipped += 1;
      continue;
    }
    const text =
      chat.lastMessage?.text?.trim() ||
      "(fan sent media / empty text — still drafting a check-in)";
    // Skip if last message is ours
    if (
      tokens.profile?.uuid &&
      chat.lastMessage?.senderUuid === tokens.profile.uuid
    ) {
      skipped += 1;
      continue;
    }
    try {
      const { queueItem } = await processInboundMessage({
        fanUserUuid: uuid,
        inboundText: text,
        fanHandle: chat.user?.handle,
        fanDisplayName: chat.user?.displayName,
        personaId: opts?.personaId,
        preferLive: true,
        source: "unread-pull",
      });
      items.push(queueItem);
    } catch (err) {
      lastErr = friendlyFanvueError(err);
      // Stop hard on auth / rate limit
      if (err instanceof FanvueApiError && (err.status === 401 || err.status === 429)) {
        break;
      }
      skipped += 1;
    }
  }

  await updateStore((s) => {
    s.automationLog.unshift(
      logEntry({
        kind: "run",
        summary: `Unread pull drafted ${items.length} chat(s)${
          skipped ? `, skipped ${skipped}` : ""
        }`,
        detail: lastErr,
      })
    );
  });

  if (!items.length && lastErr) {
    return { processed: 0, items: [], error: lastErr, skipped };
  }

  return { processed: items.length, items, skipped, empty: items.length === 0 };
}

export async function approveQueueItem(
  id: string,
  editedText?: string
): Promise<AutomationQueueItem> {
  const store = await readStore();
  const item = store.automationQueue.find((q) => q.id === id);
  if (!item) throw new Error("Queue item not found");
  if (item.status !== "pending") throw new Error(`Item is ${item.status}`);

  const text = (editedText ?? item.draftText).trim();
  if (!text) throw new Error("Draft text empty");

  let updated: AutomationQueueItem = {
    ...item,
    draftText: text,
    updatedAt: new Date().toISOString(),
  };

  if (item.mode === "live") {
    const tokens = await loadTokens();
    if (!tokens) throw new Error("Connect Fanvue to send live");
    try {
      const result = await sendFanvueMessage({
        fanUserUuid: item.fanUserUuid,
        text,
        priceCents: item.ppvPriceCents,
        mediaUuids: item.ppvMediaUuids,
      });
      updated = {
        ...updated,
        status: "sent",
        remoteMessageUuid: result.messageUuid,
      };
    } catch (err) {
      const msg = friendlyFanvueError(err);
      updated = { ...updated, status: "failed", error: msg };
      await updateStore((s) => {
        const i = s.automationQueue.findIndex((q) => q.id === id);
        if (i >= 0) s.automationQueue[i] = updated;
        s.automationLog.unshift(
          logEntry({
            kind: "error",
            summary: `Approve send failed`,
            detail: msg,
            queueId: id,
          })
        );
      });
      return updated;
    }
  } else {
    updated = {
      ...updated,
      status: "sent",
      remoteMessageUuid: `mock-${crypto.randomUUID()}`,
    };
  }

  await updateStore((s) => {
    const i = s.automationQueue.findIndex((q) => q.id === id);
    if (i >= 0) s.automationQueue[i] = updated;
    if (updated.ppvItemId && updated.status === "sent") {
      const fan = s.fanSales[item.fanUserUuid];
      if (fan) s.fanSales[item.fanUserUuid] = bumpFanOffer(fan);
    }
    s.automationLog.unshift(
      logEntry({
        kind: "send",
        summary: `Approved & ${updated.mode === "live" ? "sent live" : "marked sent (mock)"}`,
        queueId: id,
      })
    );
  });

  return updated;
}

export async function rejectQueueItem(id: string): Promise<AutomationQueueItem> {
  const store = await readStore();
  const item = store.automationQueue.find((q) => q.id === id);
  if (!item) throw new Error("Queue item not found");
  if (item.status !== "pending") throw new Error(`Item is ${item.status}`);

  const updated: AutomationQueueItem = {
    ...item,
    status: "rejected",
    updatedAt: new Date().toISOString(),
  };

  await updateStore((s) => {
    const i = s.automationQueue.findIndex((q) => q.id === id);
    if (i >= 0) s.automationQueue[i] = updated;
    s.automationLog.unshift(
      logEntry({
        kind: "reject",
        summary: `Rejected draft for ${item.fanHandle || item.fanUserUuid}`,
        queueId: id,
      })
    );
  });

  return updated;
}
