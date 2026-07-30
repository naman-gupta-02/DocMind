import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { LogIn, Sparkles, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await auth.login(identifier, password);
      } else {
        await auth.register(identifier, password, name || undefined, username || undefined);
      }
      toast.push('success', mode === 'login' ? 'Welcome back!' : 'Account created');
      navigate('/');
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="bg-glow" />
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="hero-logo auth-logo">
          <Sparkles size={26} strokeWidth={2.5} />
          DocMind
        </div>
        <p className="auth-subtitle">
          {mode === 'login' ? 'Sign in to your document library' : 'Create an account to get started'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <>
              <input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="auth-input"
              />
              <input
                type="text"
                placeholder="Username (optional)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="auth-input"
              />
            </>
          )}
          <input
            type={mode === 'login' ? 'text' : 'email'}
            placeholder={mode === 'login' ? 'Email or username' : 'Email'}
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="auth-input"
          />
          <input
            type="password"
            placeholder="Password"
            required
            minLength={mode === 'register' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
          />
          <motion.button
            type="submit"
            className="auth-submit"
            disabled={submitting}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            {mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </motion.button>
        </form>

        <button
          className="auth-toggle"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setIdentifier('');
            setPassword('');
          }}
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </motion.div>
    </div>
  );
}
