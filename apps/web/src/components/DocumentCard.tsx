import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Clock, Fingerprint, Layers, Share2, Trash2 } from 'lucide-react';
import { PipelineStepper } from './PipelineStepper';
import { formatBytes, formatRelativeTime, truncateHash } from '../lib/format';
import type { DocumentRecord, JobStatusPayload } from '../types';

const FILE_TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  pdf: { bg: 'rgba(244, 63, 94, 0.16)', color: '#fb7185' },
  docx: { bg: 'rgba(59, 130, 246, 0.16)', color: '#60a5fa' },
  txt: { bg: 'rgba(148, 163, 184, 0.16)', color: '#cbd5e1' },
  md: { bg: 'rgba(139, 92, 246, 0.16)', color: '#a78bfa' },
};

interface DocumentCardProps {
  doc: DocumentRecord;
  progress?: JobStatusPayload;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
}

export function DocumentCard({ doc, progress, onDelete, onShare }: DocumentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badgeStyle = FILE_TYPE_STYLE[doc.ext] ?? FILE_TYPE_STYLE.txt;
  const stage = progress?.stage ?? doc.status;
  const message = progress?.message ?? doc.status;

  return (
    <motion.li
      layout
      className="doc-card"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="doc-card-main" onClick={() => setExpanded((e) => !e)}>
        <div className="file-badge" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>
          {doc.ext.toUpperCase()}
        </div>

        <div className="doc-meta">
          <strong title={doc.filename}>{doc.filename}</strong>
          <span className="doc-sub">
            {formatBytes(doc.sizeBytes)} · {formatRelativeTime(doc.createdAt)}
          </span>
        </div>

        <div style={{ minWidth: 160 }}>
          <PipelineStepper stage={stage} message={message} />
        </div>

        <div className="doc-actions" onClick={(e) => e.stopPropagation()}>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            className="icon-btn"
            aria-label={`Share ${doc.filename}`}
            onClick={() => onShare(doc.id)}
          >
            <Share2 size={15} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            className="icon-btn"
            aria-label={`Delete ${doc.filename}`}
            onClick={() => onDelete(doc.id)}
          >
            <Trash2 size={15} />
          </motion.button>
          <div className={`chevron${expanded ? ' chevron--open' : ''}`}>
            <ChevronDown size={16} />
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="doc-details">
              <div className="detail-item">
                <span className="detail-label">Pages</span>
                <span className="detail-value">{doc.pageCount ?? '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">
                  <Layers size={11} style={{ verticalAlign: -1.5, marginRight: 3 }} />
                  Chunks
                </span>
                <span className="detail-value">{doc.chunkCount ?? '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">
                  <Fingerprint size={11} style={{ verticalAlign: -1.5, marginRight: 3 }} />
                  SHA-256
                </span>
                <span className="detail-value">{truncateHash(doc.fileHash)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">
                  <Clock size={11} style={{ verticalAlign: -1.5, marginRight: 3 }} />
                  Uploaded
                </span>
                <span className="detail-value" title={doc.createdAt}>
                  {new Date(doc.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
