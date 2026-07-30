import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Check, Download, MessageSquare, Pencil, Plus, Send, X } from 'lucide-react';
import {
  createChatThread,
  downloadChatThreadPdf,
  getChatThread,
  getToken,
  listChatThreads,
  listDocuments,
  updateChatThreadScope,
} from '../api/client';
import { ChatMessage } from '../components/ChatMessage';
import { useToast } from '../components/Toast';
import type { ChatThreadRecord, DocumentRecord, MessageRecord } from '../types';

interface ChatDonePayload {
  threadId: string;
  userMessage: MessageRecord;
  assistantMessage: MessageRecord;
}

function scopeLabel(documentIds: string[], documents: DocumentRecord[]): string {
  if (documentIds.length === 0) return 'All documents';
  const byId = new Map(documents.map((d) => [d.id, d.filename]));
  return documentIds.map((id) => byId.get(id) ?? 'document').join(', ');
}

export function ChatPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [threads, setThreads] = useState<ChatThreadRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [editingScope, setEditingScope] = useState(false);
  const [editScopeDocIds, setEditScopeDocIds] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Tracked in a ref (not read via the setState-updater trick) so the socket handlers always see
  // the latest value without needing to recreate the socket on every thread switch — reading
  // current state inside a setState updater purely to run a side effect isn't safe: React can
  // (and does, under StrictMode) invoke updater functions more than once.
  const activeThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeThreadId) ?? null, [threads, activeThreadId]);

  useEffect(() => {
    listDocuments()
      .then((docs) => setDocuments(docs.filter((d) => d.status === 'completed')))
      .catch(() => undefined);
    listChatThreads()
      .then(setThreads)
      .catch(() => undefined);

    const socket = io({ path: '/socket.io', auth: { token: getToken() } });
    socketRef.current = socket;

    socket.on('chat:token', ({ threadId, token }: { threadId: string; token: string }) => {
      if (activeThreadIdRef.current === threadId) setStreamText((prev) => prev + token);
    });

    socket.on('chat:done', (payload: ChatDonePayload) => {
      if (activeThreadIdRef.current === payload.threadId) {
        setMessages((prev) => [
          ...prev.filter((m) => !m.id.startsWith('temp-')),
          payload.userMessage,
          payload.assistantMessage,
        ]);
        setStreaming(false);
        setStreamText('');
      }
      listChatThreads().then(setThreads).catch(() => undefined);
    });

    socket.on('chat:error', ({ error }: { threadId: string; error: string }) => {
      toast.push('error', error);
      setStreaming(false);
      setStreamText('');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    setEditingScope(false);
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    getChatThread(activeThreadId)
      .then((data) => setMessages(data.messages))
      .catch((err) => toast.push('error', err instanceof Error ? err.message : 'Failed to load chat'));
  }, [activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  function toggleScopeDoc(id: string) {
    setSelectedDocIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  function toggleEditScopeDoc(id: string) {
    setEditScopeDocIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function handleNewThread() {
    try {
      const thread = await createChatThread(selectedDocIds.length > 0 ? selectedDocIds : undefined);
      setThreads((prev) => [thread, ...prev]);
      setActiveThreadId(thread.id);
      setSelectedDocIds([]);
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : 'Failed to start chat');
    }
  }

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !activeThreadId || streaming) return;

    const optimisticUserMessage: MessageRecord = {
      id: `temp-${Date.now()}`,
      threadId: activeThreadId,
      role: 'user',
      content: draft,
      citations: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMessage]);
    setStreaming(true);
    setStreamText('');
    socketRef.current?.emit('chat:send', { threadId: activeThreadId, message: draft });
    setDraft('');
  }

  function startEditingScope() {
    if (!activeThread) return;
    setEditScopeDocIds(activeThread.documentIds);
    setEditingScope(true);
  }

  async function handleSaveScope() {
    if (!activeThreadId) return;
    try {
      const updated = await updateChatThreadScope(activeThreadId, editScopeDocIds);
      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingScope(false);
      toast.push('success', 'Chat scope updated — new questions will use it');
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : 'Failed to update scope');
    }
  }

  async function handleDownloadPdf() {
    if (!activeThreadId || !activeThread) return;
    try {
      await downloadChatThreadPdf(activeThreadId, activeThread.title);
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : 'Failed to export PDF');
    }
  }

  return (
    <div className="chat-layout">
      <aside className="thread-sidebar">
        <button className="new-thread-btn" onClick={() => setActiveThreadId(null)}>
          <Plus size={14} /> New chat
        </button>
        {threads.map((t) => (
          <button
            key={t.id}
            className={`thread-item${t.id === activeThreadId ? ' thread-item--active' : ''}`}
            onClick={() => setActiveThreadId(t.id)}
            title={t.title}
          >
            {t.title}
          </button>
        ))}
      </aside>

      <div className="chat-panel">
        {activeThreadId ? (
          <>
            {editingScope ? (
              <div className="chat-scope-picker">
                <button
                  className={`scope-chip${editScopeDocIds.length === 0 ? ' scope-chip--selected' : ''}`}
                  onClick={() => setEditScopeDocIds([])}
                >
                  All documents
                </button>
                {documents.map((d) => (
                  <button
                    key={d.id}
                    className={`scope-chip${editScopeDocIds.includes(d.id) ? ' scope-chip--selected' : ''}`}
                    onClick={() => toggleEditScopeDoc(d.id)}
                  >
                    {d.filename}
                  </button>
                ))}
                <button className="icon-btn" aria-label="Save scope" onClick={handleSaveScope}>
                  <Check size={14} />
                </button>
                <button className="icon-btn" aria-label="Cancel" onClick={() => setEditingScope(false)}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="chat-scope-picker">
                <strong style={{ fontSize: '0.85rem' }}>{activeThread?.title ?? 'Chat'}</strong>
                <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>
                  {activeThread ? scopeLabel(activeThread.documentIds, documents) : ''}
                </span>
                <button className="icon-btn" aria-label="Edit document scope" onClick={startEditingScope}>
                  <Pencil size={13} />
                </button>
                <span style={{ flex: 1 }} />
                <button className="icon-btn" aria-label="Download chat as PDF" onClick={handleDownloadPdf}>
                  <Download size={14} />
                </button>
              </div>
            )}
            <div className="messages">
              {messages.map((m) => (
                <ChatMessage key={m.id} role={m.role} content={m.content} citations={m.citations} />
              ))}
              {streaming && <ChatMessage role="assistant" content={streamText} typing />}
              <div ref={messagesEndRef} />
            </div>
            <form className="composer" onSubmit={handleSend}>
              <textarea
                className="composer-input"
                rows={1}
                placeholder="Ask a question about your documents..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
              <button className="composer-send" type="submit" disabled={streaming || !draft.trim()}>
                <Send size={16} />
              </button>
            </form>
          </>
        ) : (
          <div className="chat-empty">
            <MessageSquare size={32} />
            <p>Pick which documents to chat with, then start a new conversation.</p>
            <div className="chat-scope-picker">
              <button
                className={`scope-chip${selectedDocIds.length === 0 ? ' scope-chip--selected' : ''}`}
                onClick={() => setSelectedDocIds([])}
              >
                All documents
              </button>
              {documents.map((d) => (
                <button
                  key={d.id}
                  className={`scope-chip${selectedDocIds.includes(d.id) ? ' scope-chip--selected' : ''}`}
                  onClick={() => toggleScopeDoc(d.id)}
                >
                  {d.filename}
                </button>
              ))}
            </div>
            <button className="new-thread-btn" onClick={handleNewThread} style={{ marginTop: '0.75rem' }}>
              <Plus size={14} /> Start chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
