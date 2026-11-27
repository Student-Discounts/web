import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Notice } from '../components/ui';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const registered = (location.state as { registered?: string } | null)?.registered;
  const from = (location.state as { from?: string } | null)?.from ?? '/profile';

  const [email, setEmail] = useState(registered ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
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
          <h1 className="text-2xl font-semibold">Вход</h1>
          {registered && <Notice>Аккаунт создан, теперь можно войти.</Notice>}
          <div className="grid gap-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="login-password">Пароль</Label>
            <Input id="login-password" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <ErrorBox error={error} />
          <Button type="submit" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</Button>
          <p className="text-sm text-muted-foreground">
            Нет аккаунта? <Link className="text-primary underline" to="/register" state={{ from }}>Зарегистрироваться</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
