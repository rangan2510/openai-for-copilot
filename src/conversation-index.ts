import { createHash } from "node:crypto";

import type { LanguageModelChatMessage } from "vscode";
import * as vscode from "vscode";

import { logger } from "./logger";

interface ConversationEntry {
  /** Number of VS Code messages we had already sent for this session. */
  sentMessageCount: number;
  /** Last response.id from /v1/responses, used as `previous_response_id`. */
  responseId: string;
  /** Wall-clock time of last update. Used to expire stale entries. */
  updatedAt: number;
}

/**
 * Tracks `previous_response_id` for stored conversations so subsequent turns
 * only need to send the new tail of the message list.
 *
 * Keyed by a stable hash of the conversation prefix (system messages plus
 * the first user turn), which is the closest thing to a "session id" the
 * VS Code provider API gives us.
 *
 * Entries expire after 1 hour of inactivity to prevent unbounded memory growth.
 */
const ENTRY_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 256;

export class ConversationIndex {
  private readonly entries = new Map<string, ConversationEntry>();

  /**
   * Get a stable session key for the given message list. Returns undefined
   * when the messages contain no user turn (we cannot anchor a session).
   */
  static computeKey(
    messages: readonly LanguageModelChatMessage[],
  ): string | undefined {
    const hash = createHash("sha256");
    let foundFirstUser = false;

    for (const msg of messages) {
      if (msg.role === vscode.LanguageModelChatMessageRole.User) {
        hash.update("user\n");
        hash.update(extractText(msg));
        foundFirstUser = true;
        break;
      } else if (msg.role === vscode.LanguageModelChatMessageRole.Assistant) {
        // Skip; we anchor on the first user turn.
        continue;
      } else {
        // Unknown role (e.g. system in older proposals) - fold into the prefix.
        hash.update("prefix\n");
        hash.update(extractText(msg));
        hash.update("\n");
      }
    }

    return foundFirstUser ? hash.digest("hex") : undefined;
  }

  /**
   * Look up the previous response id for this session, if we still have it
   * and the message list is a strict superset of what we sent before.
   *
   * Returns the response id and the count of messages already represented
   * server-side; the caller should send only messages[skipCount..].
   */
  lookup(
    key: string,
    currentMessageCount: number,
  ): { responseId: string; skipCount: number } | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.updatedAt > ENTRY_TTL_MS) {
      this.entries.delete(key);
      return undefined;
    }

    if (currentMessageCount < entry.sentMessageCount) {
      // History got shorter (user retried/edited). Invalidate.
      this.entries.delete(key);
      return undefined;
    }

    return {
      responseId: entry.responseId,
      skipCount: entry.sentMessageCount,
    };
  }

  /**
   * Record the response id and how many input messages were sent in total
   * for this session.
   */
  record(key: string, responseId: string, totalMessageCount: number): void {
    if (this.entries.size >= MAX_ENTRIES) {
      this.evictOldest();
    }
    this.entries.set(key, {
      responseId,
      sentMessageCount: totalMessageCount,
      updatedAt: Date.now(),
    });
    logger.debug("[ConversationIndex] Recorded response id", {
      key: key.slice(0, 12),
      responseId,
      totalMessageCount,
    });
  }

  /** Drop a session, e.g. after a server error indicates the response id is invalid. */
  invalidate(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [k, v] of this.entries) {
      if (v.updatedAt < oldestTime) {
        oldestTime = v.updatedAt;
        oldestKey = k;
      }
    }
    if (oldestKey !== undefined) {
      this.entries.delete(oldestKey);
    }
  }
}

function extractText(msg: LanguageModelChatMessage): string {
  const texts: string[] = [];
  for (const part of msg.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      texts.push(part.value);
    }
  }
  return texts.join("");
}
