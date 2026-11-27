import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox } from '../components/ui';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function RegisterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
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
      navigate('/login', { state: { registered: created.email, from } });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <h1 className="text-2xl font-semibold">Регистрация</h1>
          <div className="grid gap-1.5">
            <Label htmlFor="register-name">Имя</Label>
            <Input id="register-name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="register-email">Email</Label>
            <Input id="register-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="register-password">Пароль</Label>
            <Input id="register-password" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} aria-describedby="password-hint" required />
            <p id="password-hint" className="text-xs text-muted-foreground">Не меньше 8 символов</p>
          </div>
          <ErrorBox error={error} />
          <Button type="submit" disabled={busy}>{busy ? 'Создаём…' : 'Создать аккаунт'}</Button>
          <p className="text-sm text-muted-foreground">
            Уже есть аккаунт? <Link className="text-primary underline" to="/login" state={{ from }}>Войти</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
