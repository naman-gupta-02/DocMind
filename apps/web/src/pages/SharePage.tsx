import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Eye, FileText, Sparkles } from 'lucide-react';
import { downloadPublicSharePdf, fetchPublicShare } from '../api/client';
import { ChatMessage } from '../components/ChatMessage';
import { useToast } from '../components/Toast';
import { formatBytes, formatRelativeTime } from '../lib/format';
import type { DocumentRecord, MessageRecord } from '../types';

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [document, setDocument] = useState<Partial<DocumentRecord> | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!token) return;
    fetchPublicShare(token)
      .then((data) => {
        setDocument(data.document);
        setMessages(data.messages);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'This share link is invalid or has expired'));
  }, [token]);

  async function handleDownloadPdf() {
    if (!token) return;
    try {
      await downloadPublicSharePdf(token, document?.filename ?? 'chat');
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : 'Failed to export PDF');
    }
  }

  if (error) {
    return (
      <div className="share-page">
        <div className="bg-glow" />
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="share-page">
        <div className="bg-glow" />
        <p style={{ color: 'var(--text-faint)' }}>Loading shared document…</p>
      </div>
    );
  }

  return (
    <div className="share-page">
      <div className="bg-glow" />
      <div className="hero-logo" style={{ fontSize: '1.6rem', justifyContent: 'flex-start' }}>
        <Sparkles size={22} strokeWidth={2.5} />
        DocMind
      </div>
      <div className="share-banner">
        <Eye size={14} /> Shared read-only view
      </div>

      <div className="doc-card" style={{ padding: '1rem 1.2rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <FileText size={20} style={{ color: 'var(--cyan)' }} />
          <div>
            <strong>{document.filename}</strong>
            <div className="doc-sub">
              {document.pageCount ?? '—'} pages · {document.chunkCount ?? '—'} chunks ·{' '}
              {document.sizeBytes ? formatBytes(document.sizeBytes) : ''}{' '}
              {document.createdAt ? `· uploaded ${formatRelativeTime(document.createdAt)}` : ''}
            </div>
          </div>
        </div>
      </div>

      {messages.length > 0 ? (
        <>
          <button className="new-thread-btn" onClick={handleDownloadPdf} style={{ marginBottom: '1rem' }}>
            <Download size={14} /> Download as PDF
          </button>
          <div className="messages" style={{ padding: 0 }}>
            {messages.map((m) => (
              <ChatMessage key={m.id} role={m.role} content={m.content} citations={m.citations} />
            ))}
          </div>
        </>
      ) : (
        <p style={{ color: 'var(--text-faint)' }}>No chat was attached to this share link.</p>
      )}
    </div>
  );
}
