import type { ChatThreadRecord, DocumentRecord, JobStatusPayload, MessageRecord, User } from '../types';

const TOKEN_KEY = 'docmind_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function json<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function register(
  email: string,
  password: string,
  name?: string,
  username?: string,
): Promise<{ token: string; user: User }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, username }),
  });
  return json(res);
}

export async function login(identifier: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  return json(res);
}

export async function fetchCurrentUser(): Promise<User> {
  const res = await fetch('/api/auth/me', { headers: authHeaders() });
  const data = await json<{ user: User }>(res);
  return data.user;
}

export async function uploadDocument(file: File): Promise<DocumentRecord> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/documents', { method: 'POST', headers: authHeaders(), body: formData });
  const data = await json<{ document: DocumentRecord }>(res);
  return data.document;
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const res = await fetch('/api/documents', { headers: authHeaders() });
  const data = await json<{ documents: DocumentRecord[] }>(res);
  return data.documents;
}

export async function getDocumentStatus(documentId: string): Promise<JobStatusPayload> {
  const res = await fetch(`/api/documents/${documentId}/status`, { headers: authHeaders() });
  const data = await json<{ status: JobStatusPayload }>(res);
  return data.status;
}

export async function deleteDocument(documentId: string): Promise<void> {
  const res = await fetch(`/api/documents/${documentId}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete document (status ${res.status})`);
  }
}

export async function createShareLink(documentId: string, threadId?: string): Promise<string> {
  const res = await fetch(`/api/documents/${documentId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(threadId ? { threadId } : {}),
  });
  const data = await json<{ token: string }>(res);
  return data.token;
}

export async function fetchPublicShare(
  token: string,
): Promise<{ document: Partial<DocumentRecord>; messages: MessageRecord[] }> {
  const res = await fetch(`/api/public/share/${token}`);
  return json(res);
}

export async function createChatThread(documentIds?: string[]): Promise<ChatThreadRecord> {
  const res = await fetch('/api/chat/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ documentIds }),
  });
  const data = await json<{ thread: ChatThreadRecord }>(res);
  return data.thread;
}

export async function listChatThreads(): Promise<ChatThreadRecord[]> {
  const res = await fetch('/api/chat/threads', { headers: authHeaders() });
  const data = await json<{ threads: ChatThreadRecord[] }>(res);
  return data.threads;
}

export async function getChatThread(threadId: string): Promise<{ thread: ChatThreadRecord; messages: MessageRecord[] }> {
  const res = await fetch(`/api/chat/threads/${threadId}`, { headers: authHeaders() });
  return json(res);
}

export async function deleteChatThread(threadId: string): Promise<void> {
  const res = await fetch(`/api/chat/threads/${threadId}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete thread (status ${res.status})`);
  }
}

export async function updateChatThreadScope(threadId: string, documentIds: string[]): Promise<ChatThreadRecord> {
  const res = await fetch(`/api/chat/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ documentIds }),
  });
  const data = await json<{ thread: ChatThreadRecord }>(res);
  return data.thread;
}

async function downloadBlobResponse(res: Response, filenameHint: string): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Failed to export PDF (status ${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenameHint}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadChatThreadPdf(threadId: string, filenameHint: string): Promise<void> {
  const res = await fetch(`/api/chat/threads/${threadId}/export.pdf`, { headers: authHeaders() });
  await downloadBlobResponse(res, filenameHint);
}

export async function downloadPublicSharePdf(token: string, filenameHint: string): Promise<void> {
  const res = await fetch(`/api/public/share/${token}/export.pdf`);
  await downloadBlobResponse(res, filenameHint);
}
