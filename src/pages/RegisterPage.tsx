import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox } from '../components/ui';

export function RegisterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/profile" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await authApi.register(email, password, displayName);
      navigate('/login', { state: { registered: created.email } });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card narrow" onSubmit={onSubmit}>
      <h1>Регистрация</h1>
      <label>
        Имя
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} required />
      </label>
      <label>
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Пароль
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          maxLength={128}
          required
        />
        <span className="hint">Не меньше 8 символов</span>
      </label>
      <ErrorBox error={error} />
      <button type="submit" disabled={busy}>
        {busy ? 'Создаём…' : 'Создать аккаунт'}
      </button>
      <p className="muted">
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </p>
    </form>
  );
}
