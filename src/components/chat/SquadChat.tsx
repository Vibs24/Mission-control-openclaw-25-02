import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Panel } from "../shared/Modal";
import { formatRelativeTime } from "../../lib/utils";
import type { ChatMessage } from "../../types";

interface SquadChatProps {
  onClose: () => void;
}

export function SquadChat({ onClose }: SquadChatProps) {
  const [message, setMessage] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messages = (useQuery(api.chat.list, { channel: "general", limit: 100 }) ?? []) as ChatMessage[];
  const sendMessage = useMutation(api.chat.send);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    setSendError(null);
    setIsSending(true);
    try {
      await sendMessage({
        fromName: "Sypha",
        fromEmoji: "👤",
        content: message,
        channel: "general",
      });
      setMessage("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send chat message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Panel title="Squad Chat" onClose={onClose}>
      <div className="flex flex-col h-full">
        {/* Channel indicator */}
        <div className="px-4 py-2 border-b border-gray-100">
          <span className="text-[10px] text-gray-500"># general</span>
        </div>

        {/* Messages */}
        <div ref={messageListRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg: ChatMessage) => (
            <div key={msg._id} className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                {msg.fromEmoji}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-semibold text-gray-800">
                    {msg.fromName}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {formatRelativeTime(msg._creationTime)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          {sendError && (
            <p className="mb-2 text-[10px] text-red-500">{sendError}</p>
          )}
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              className="flex-1 text-xs border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-300"
              placeholder="Message the squad..."
            />
            <button
              onClick={handleSend}
              disabled={!message.trim() || isSending}
              className="text-xs bg-orange-500 text-white px-3 py-2 rounded hover:bg-orange-600 disabled:opacity-40 transition-colors"
            >
              {isSending ? "..." : "→"}
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
