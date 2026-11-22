import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_NAMES } from '../api/messages';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout().catch(() => undefined);
    navigate('/login');
  };

  return (
    <div className="app">
      <header className="header">
        <NavLink to="/" className="brand">
          Студенческие скидки
        </NavLink>
        <nav className="nav">
          <NavLink to="/search">Поиск</NavLink>
          {user && <NavLink to="/submissions">Мои заявки</NavLink>}
          {hasRole('MODERATOR', 'SENIOR_MODERATOR') && <NavLink to="/moderation">Модерация</NavLink>}
          {hasRole('SENIOR_MODERATOR') && <NavLink to="/admin">Пользователи</NavLink>}
        </nav>
        <div className="account">
          {user ? (
            <>
              <NavLink to="/profile" className="account-name" title={user.roles.map((r) => ROLE_NAMES[r]).join(', ')}>
                {user.displayName}
              </NavLink>
              <button type="button" className="button-link" onClick={onLogout}>
                Выйти
              </button>
            </>
          ) : (
            user === null && (
              <>
                <NavLink to="/login">Войти</NavLink>
                <NavLink to="/register">Регистрация</NavLink>
              </>
            )
          )}
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
