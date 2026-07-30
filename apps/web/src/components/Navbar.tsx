import { NavLink } from 'react-router-dom';
import { LogOut, MessageSquare, Sparkles, UploadCloud } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">
        <Sparkles size={18} strokeWidth={2.5} />
        DocMind
      </NavLink>
      <div className="navbar-links">
        <NavLink to="/" end className={({ isActive }) => `navbar-link${isActive ? ' navbar-link--active' : ''}`}>
          <UploadCloud size={14} /> Library
        </NavLink>
        <NavLink to="/chat" className={({ isActive }) => `navbar-link${isActive ? ' navbar-link--active' : ''}`}>
          <MessageSquare size={14} /> Chat
        </NavLink>
        <button className="navbar-link" onClick={logout} title={user?.email}>
          <LogOut size={14} /> Log out
        </button>
      </div>
    </nav>
  );
}
