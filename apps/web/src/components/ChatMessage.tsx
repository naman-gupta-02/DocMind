import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import type { MessageRecord } from '../types';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  citations?: MessageRecord['citations'];
  typing?: boolean;
}

export function ChatMessage({ role, content, citations = [], typing }: ChatMessageProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <motion.div
      className={`message-row message-row--${role}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={`message-bubble message-bubble--${role}`}>
        {content}
        {typing && (
          <>
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </>
        )}
      </div>

      {citations.length > 0 && (
        <div className="citations-row">
          {citations.map((c, i) => (
            <button
              key={`${c.chunkId}-${i}`}
              className="citation-chip"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              title={`${c.filename}, page ${c.page}`}
            >
              <FileText size={11} />
              [{i + 1}] {c.filename} p.{c.page}
            </button>
          ))}
        </div>
      )}

      {openIndex !== null && citations[openIndex] && (
        <motion.div
          className="citation-detail"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
        >
          &ldquo;{citations[openIndex]?.snippet}&rdquo;
        </motion.div>
      )}
    </motion.div>
  );
}
