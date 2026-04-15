/**
 * ChatBox — in-game chat, collapsed by default, expandable.
 *
 * Collapsed: shows the single most-recent message (or "Chat…" placeholder)
 *            with a chevron to expand.
 * Expanded:  a ~200-px scrollable list of the last 50 messages + a text-input
 *            row with a "Send" button.
 *
 * The component is intentionally self-contained; the parent passes `messages`
 * and an `onSend` callback.  Auto-scrolling to the latest message is handled
 * here.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ChatMessage } from "../../store/game-store";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ChatBoxProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (text: string) => void;
  testID?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 50;
const QUICK_EMOJIS = ["😄", "👍", "🔥", "🤔", "😢"];

export function ChatBox({ messages, currentUserId, onSend, testID }: ChatBoxProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft]       = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Auto-scroll to latest when messages change (expanded view).
  useEffect(() => {
    if (expanded && messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages, expanded]);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }, [draft, onSend]);

  const latest = messages[messages.length - 1];

  return (
    <View
      style={[styles.container, expanded && styles.containerExpanded]}
      testID={testID ?? "chat-box"}
    >
      {/* Collapsed header / preview row */}
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        testID="chat-toggle"
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Collapse chat" : "Expand chat"}
      >
        <Text style={styles.headerIcon}>💬</Text>
        {latest ? (
          <Text style={styles.headerPreview} numberOfLines={1}>
            <Text style={styles.headerUsername}>{latest.username}: </Text>
            {latest.message}
          </Text>
        ) : (
          <Text style={styles.headerPlaceholder}>Chat…</Text>
        )}
        <Text style={styles.chevron}>{expanded ? "▼" : "▲"}</Text>
      </Pressable>

      {/* Expanded message list */}
      {expanded && (
        <>
          <FlatList
            ref={listRef}
            data={messages.slice(-MAX_VISIBLE)}
            keyExtractor={(item) => item.id}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            testID="message-list"
            renderItem={({ item }) => {
              const isMe = item.userId === currentUserId;
              return (
                <View
                  style={[styles.messageRow, isMe && styles.messageRowMe]}
                  testID={`message-${item.id}`}
                >
                  {!isMe && (
                    <Text style={styles.msgUsername}>{item.username}: </Text>
                  )}
                  <Text style={[styles.msgText, isMe && styles.msgTextMe]}>
                    {item.message}
                  </Text>
                </View>
              );
            }}
          />

          {/* Emoji shortcuts */}
          <View style={styles.emojiRow}>
            {QUICK_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onSend(emoji)}
                testID={`emoji-${emoji}`}
                style={styles.emojiBtn}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message…"
              placeholderTextColor="#4a5568"
              returnKeyType="send"
              onSubmitEditing={handleSend}
              testID="chat-input"
              maxLength={200}
            />
            <Pressable
              style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!draft.trim()}
              testID="chat-send"
            >
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(13, 27, 46, 0.92)",
    borderTopWidth: 1,
    borderTopColor: "#2d3a56",
  },
  containerExpanded: {
    borderTopWidth: 1,
    borderTopColor: "#2d3a56",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerIcon: { fontSize: 14 },
  headerPreview: {
    flex: 1,
    fontSize: 12,
    color: "#94a3b8",
  },
  headerUsername: {
    color: "#60a5fa",
    fontWeight: "700",
  },
  headerPlaceholder: {
    flex: 1,
    fontSize: 12,
    color: "#4a5568",
    fontStyle: "italic",
  },
  chevron: {
    fontSize: 10,
    color: "#64748b",
  },
  messageList: {
    maxHeight: 160,
    backgroundColor: "#0a1220",
  },
  messageListContent: {
    padding: 8,
    gap: 4,
  },
  messageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  messageRowMe: {
    justifyContent: "flex-end",
  },
  msgUsername: {
    fontSize: 11,
    color: "#60a5fa",
    fontWeight: "700",
  },
  msgText: {
    fontSize: 12,
    color: "#cbd5e1",
  },
  msgTextMe: {
    color: "#ffd700",
  },
  emojiRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 8,
  },
  emojiBtn: { padding: 2 },
  emojiText: { fontSize: 18 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#0d1b2e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2d3a56",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: "#e2e8f0",
  },
  sendBtn: {
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  sendBtnDisabled: {
    backgroundColor: "#1e2a3e",
  },
  sendText: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "700",
  },
});
