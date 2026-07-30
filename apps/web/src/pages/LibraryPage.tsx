import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { io, type Socket } from 'socket.io-client';
import { FolderOpen } from 'lucide-react';
import { Hero } from '../components/Hero';
import { StatsBar } from '../components/StatsBar';
import { UploadDropzone } from '../components/UploadDropzone';
import { DocumentCard } from '../components/DocumentCard';
import { useToast } from '../components/Toast';
import { createShareLink, deleteDocument, getDocumentStatus, getToken, listDocuments, uploadDocument } from '../api/client';
import type { DocumentRecord, JobStatusPayload } from '../types';

const TERMINAL_STAGES = new Set(['completed', 'failed']);

export function LibraryPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [progressByDoc, setProgressByDoc] = useState<Record<string, JobStatusPayload>>({});
  const [uploading, setUploading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const toast = useToast();

  const refreshDocuments = useCallback(async () => {
    const docs = await listDocuments();
    setDocuments(docs);
  }, []);

  useEffect(() => {
    refreshDocuments().catch((err) => toast.push('error', err.message ?? 'Failed to load documents'));

    const socket = io({ path: '/socket.io', auth: { token: getToken() } });
    socketRef.current = socket;
    socket.on('job:progress', (payload: JobStatusPayload) => {
      setProgressByDoc((prev) => ({ ...prev, [payload.documentId]: payload }));
      if (TERMINAL_STAGES.has(payload.stage)) {
        refreshDocuments().catch(() => undefined);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    for (const doc of documents) {
      if (!TERMINAL_STAGES.has(doc.status)) {
        socketRef.current?.emit('subscribe', doc.id);
      }
    }
  }, [documents]);

  // Polling fallback in case a socket event was missed (e.g. tab was backgrounded).
  useEffect(() => {
    const interval = setInterval(() => {
      const inFlight = documents.filter((d) => !TERMINAL_STAGES.has(d.status));
      inFlight.forEach((doc) => {
        getDocumentStatus(doc.id)
          .then((status) => setProgressByDoc((prev) => ({ ...prev, [doc.id]: status })))
          .catch(() => undefined);
      });
      if (inFlight.length > 0) refreshDocuments().catch(() => undefined);
    }, 4000);
    return () => clearInterval(interval);
  }, [documents, refreshDocuments]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await uploadDocument(file);
      await refreshDocuments();
      toast.push('success', `${file.name} queued for ingestion`);
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    const doc = documents.find((d) => d.id === id);
    try {
      await deleteDocument(id);
      await refreshDocuments();
      toast.push('info', `${doc?.filename ?? 'Document'} deleted`);
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleShare(id: string) {
    try {
      const token = await createShareLink(id);
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      toast.push('success', 'Share link copied to clipboard');
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : 'Failed to create share link');
    }
  }

  return (
    <div className="app">
      <Hero />

      {documents.length > 0 && <StatsBar documents={documents} />}

      <UploadDropzone onFileSelected={handleUpload} disabled={uploading} />

      <section className="library">
        <div className="library-header">
          <h2>Document Library</h2>
        </div>

        {documents.length === 0 ? (
          <motion.div
            className="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <FolderOpen size={28} style={{ marginBottom: 8, opacity: 0.6 }} />
            <div>No documents yet — upload one above to see the pipeline in action.</div>
          </motion.div>
        ) : (
          <ul className="doc-list">
            <AnimatePresence initial={false}>
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  progress={progressByDoc[doc.id]}
                  onDelete={handleDelete}
                  onShare={handleShare}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <p className="footer-note">
        DocMind — upload documents, then head to Chat to ask questions with hybrid search,
        citations, and streamed answers.
      </p>
    </div>
  );
}
