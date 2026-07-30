import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { LibraryPage } from './pages/LibraryPage';
import { ChatPage } from './pages/ChatPage';
import { SharePage } from './pages/SharePage';

function ProtectedLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app">
        <div className="bg-glow" />
        <p style={{ color: 'var(--text-faint)' }}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <div className="bg-glow" />
      <Navbar />
      {children}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route
            path="/"
            element={
              <ProtectedLayout>
                <LibraryPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedLayout>
                <ChatPage />
              </ProtectedLayout>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
