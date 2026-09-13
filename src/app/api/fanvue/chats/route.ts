import { NextRequest, NextResponse } from "next/server";
import { fanvueFetch, FanvueApiError } from "@/lib/fanvue/api";
import { loadTokens } from "@/lib/fanvue/tokens";
import { readStore } from "@/lib/store";
import { generateReply } from "@/lib/chat-engine";
import { ChatMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

type ChatListItem = {
  isRead?: boolean;
  unreadMessagesCount?: number;
  user?: {
    uuid: string;
    handle?: string;
    displayName?: string;
  };
  lastMessage?: { text?: string | null; senderUuid?: string };
};

/**
 * GET ?action=unread — list unread chats
 * GET ?action=messages&userUuid= — fetch messages
 * POST { action: "draft", userUuid, personaId? } — draft reply via chat-engine
 * POST { action: "send", userUuid, text } — send (explicit only)
 */
export async function GET(req: NextRequest) {
  const tokens = await loadTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Not connected to Fanvue" }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get("action") || "unread";

  try {
    if (action === "unread") {
      const data = await fanvueFetch<{
        data: ChatListItem[];
        pagination?: unknown;
      }>("/chats?filter=unread&page=1&size=50");
      return NextResponse.json({
        chats: (data.data || []).map((c) => ({
          userUuid: c.user?.uuid,
          handle: c.user?.handle,
          displayName: c.user?.displayName,
          unreadMessagesCount: c.unreadMessagesCount ?? 0,
          lastMessage: c.lastMessage?.text ?? null,
          isRead: c.isRead,
        })),
      });
    }

    if (action === "messages") {
      const userUuid = req.nextUrl.searchParams.get("userUuid");
      if (!userUuid) {
        return NextResponse.json({ error: "userUuid required" }, { status: 400 });
      }
      const data = await fanvueFetch<{ data: unknown[] }>(
        `/chats/${encodeURIComponent(userUuid)}/messages?size=20&markAsRead=false`
      );
      return NextResponse.json({ messages: data.data || [] });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg =
      err instanceof FanvueApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Chat fetch failed";
    const status = err instanceof FanvueApiError ? err.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  const tokens = await loadTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Not connected to Fanvue" }, { status: 401 });
  }

  const body = await req.json();
  const action = String(body.action || "");

  try {
    if (action === "draft") {
      const userUuid = String(body.userUuid || "");
      if (!userUuid) {
        return NextResponse.json({ error: "userUuid required" }, { status: 400 });
      }

      const store = await readStore();
      const personaId =
        body.personaId ||
        store.settings.activePersonaId ||
        store.personas[0]?.id;
      const persona = store.personas.find((p) => p.id === personaId);
      if (!persona) {
        return NextResponse.json(
          { error: "Create/activate a persona to draft replies" },
          { status: 400 }
        );
      }

      const history = await fanvueFetch<{
        data: Array<{
          text?: string | null;
          sender?: { uuid?: string; handle?: string };
          sentAt?: string | null;
        }>;
      }>(
        `/chats/${encodeURIComponent(userUuid)}/messages?size=12&markAsRead=false`
      );

      const myUuid = tokens.profile?.uuid;
      const msgs = history.data || [];
      // Convert Fanvue newest-first history into chronological ChatMessage[] for engine
      const chronological = [...msgs].reverse();
      const chatMessages: ChatMessage[] = chronological
        .filter((m) => m.text)
        .map((m, i) => {
          const fromMe = myUuid && m.sender?.uuid === myUuid;
          return {
            id: `fv-${i}`,
            role: fromMe ? ("assistant" as const) : ("user" as const),
            content: String(m.text),
            createdAt: m.sentAt || new Date().toISOString(),
          };
        });

      // If empty, seed a synthetic fan hello
      if (!chatMessages.length) {
        chatMessages.push({
          id: "seed",
          role: "user",
          content: "hey",
          createdAt: new Date().toISOString(),
        });
      }

      const lastUser =
        [...chatMessages].reverse().find((m) => m.role === "user")?.content ||
        "hey";

      const draft = await generateReply(persona, chatMessages, lastUser);

      return NextResponse.json({
        draft: draft.content,
        source: draft.source,
        personaId: persona.id,
        personaName: persona.name,
        historyCount: msgs.length,
      });
    }

    if (action === "send") {
      const userUuid = String(body.userUuid || "");
      const text = String(body.text || "").trim();
      if (!userUuid || !text) {
        return NextResponse.json(
          { error: "userUuid and text required" },
          { status: 400 }
        );
      }
      if (text.length > 5000) {
        return NextResponse.json(
          { error: "Message too long (max 5000)" },
          { status: 400 }
        );
      }

      const result = await fanvueFetch<{ messageUuid: string }>(
        `/chats/${encodeURIComponent(userUuid)}/message`,
        {
          method: "POST",
          body: JSON.stringify({ text }),
        }
      );

      return NextResponse.json({
        ok: true,
        remote: true,
        messageUuid: result.messageUuid,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg =
      err instanceof FanvueApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Chat action failed";
    const status = err instanceof FanvueApiError ? err.status : 500;
    return NextResponse.json({ error: msg, ok: false, remote: false }, { status });
  }
}
