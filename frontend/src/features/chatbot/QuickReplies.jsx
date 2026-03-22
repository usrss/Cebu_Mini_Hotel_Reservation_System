/**
 * src/features/chatbot/QuickReplies.jsx
 *
 * Renders quick reply buttons beneath the message list.
 * Disappears while loading; reappears after bot responds.
 */

export default function QuickReplies({ replies, onSelect, disabled }) {
  if (!replies || replies.length === 0) return null;

  return (
    <div className="cmh-quick-replies">
      {replies.map((reply) => (
        <button
          key={reply}
          className="cmh-quick-reply-btn"
          onClick={() => onSelect(reply)}
          disabled={disabled}
        >
          {reply}
        </button>
      ))}
    </div>
  );
}