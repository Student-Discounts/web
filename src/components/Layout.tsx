import { useState } from 'react';
import { GraduationCap, Menu } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_NAMES } from '../api/messages';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring ${isActive ? 'bg-accent text-primary' : 'text-muted-foreground'}`;

export function Layout() {
  const location = useLocation();
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [menuLocation, setMenuLocation] = useState<string | null>(null);
  const open = menuLocation === location.key;
  const setOpen = (next: boolean) => setMenuLocation(next ? location.key : null);
  const [leaving, setLeaving] = useState(false);

  async function onLogout() {
    setLeaving(true);
    await logout().catch(() => undefined);
    setOpen(false);
    setLeaving(false);
    navigate('/login');
  }

  const links = (
    <>
      <NavLink to="/search" onClick={() => setOpen(false)} className={navClass}>Поиск</NavLink>
      {user && <NavLink to="/submissions" onClick={() => setOpen(false)} className={navClass}>Мои заявки</NavLink>}
      {hasRole('STUDENT') && <NavLink to="/reports" onClick={() => setOpen(false)} className={navClass}>Жалобы</NavLink>}
      {hasRole('MODERATOR', 'SENIOR_MODERATOR') && (
        <NavLink to="/moderation" onClick={() => setOpen(false)} className={navClass}>Модерация</NavLink>
      )}
      {hasRole('SENIOR_MODERATOR') && (
        <NavLink to="/admin" onClick={() => setOpen(false)} className={navClass}>Пользователи</NavLink>
      )}
    </>
  );
  const account = user ? (
    <>
      <NavLink to="/profile" className={navClass} onClick={() => setOpen(false)} title={user.roles.map((r) => ROLE_NAMES[r]).join(', ')}>
        {user.displayName}
      </NavLink>
      <Button type="button" variant="outline" onClick={onLogout} disabled={leaving}>Выйти</Button>
    </>
  ) : user === null && (
    <>
      <NavLink to="/login" onClick={() => setOpen(false)} className={navClass}>Войти</NavLink>
      <NavLink to="/register" onClick={() => setOpen(false)} className={navClass}>Регистрация</NavLink>
    </>
  );

  return (
    <>
      <a href="#main" className="sr-only z-50 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-card focus:p-3">К содержимому</a>
      <header className="border-b bg-card">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to="/" className="inline-flex items-center gap-2 rounded font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="size-5" aria-hidden="true" />
            </span>
            Студенческие скидки
          </NavLink>
          <nav aria-label="Основная навигация" className="hidden flex-1 items-center gap-1 lg:flex">{links}</nav>
          <nav aria-label="Аккаунт" className="hidden items-center gap-1 lg:flex">{account}</nav>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-lg" className="lg:hidden" aria-label="Открыть меню"><Menu aria-hidden="true" /></Button>
            </SheetTrigger>
            <SheetContent className="w-72 max-w-full overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Меню</SheetTitle>
                <SheetDescription className="sr-only">Разделы и действия аккаунта</SheetDescription>
              </SheetHeader>
              <nav aria-label="Основная навигация" className="grid gap-1 px-3">{links}</nav>
              <nav aria-label="Аккаунт" className="mx-3 grid gap-1 border-t pt-3">{account}</nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto grid max-w-7xl min-w-0 gap-5 px-4 pt-7 pb-14 outline-none sm:px-6 sm:pt-10 [&>*]:min-w-0">
        <Outlet />
      </main>
    </>
  );
}
