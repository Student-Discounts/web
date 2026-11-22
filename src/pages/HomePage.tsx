import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../api/http';
import { useAuth } from '../auth/AuthContext';

interface Probe {
  name: string;
  path: string;
}

// Любой ответ сервиса (даже 401 или 404) значит, что он запущен; 502–504 — что шлюз до него не достучался.
const PROBES: Probe[] = [
  { name: 'auth', path: '/.well-known/jwks.json' },
  { name: 'submission', path: '/api/v1/submissions' },
  { name: 'moderation', path: '/api/v1/moderation/queue' },
  { name: 'media', path: '/api/v1/media-assets/00000000-0000-0000-0000-000000000000' },
  { name: 'catalog', path: '/api/v1/catalog/places/00000000-0000-0000-0000-000000000000' },
  { name: 'search', path: '/api/v1/search/places' },
];

type Status = 'checking' | 'up' | 'down' | 'no-gateway';

export function HomePage() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  useEffect(() => {
    PROBES.forEach(async ({ name, path }) => {
      setStatuses((current) => ({ ...current, [name]: 'checking' }));
      let status: Status;
      try {
        const response = await fetch(API_BASE_URL + path);
        status = response.status >= 502 && response.status <= 504 ? 'down' : 'up';
      } catch {
        status = 'no-gateway';
      }
      setStatuses((current) => ({ ...current, [name]: status }));
    });
  }, []);

  const gatewayDown = Object.values(statuses).some((status) => status === 'no-gateway');

  return (
    <>
      <section className="card">
        <h1>Карта студенческих скидок</h1>
        <p>
          Демонстрационный интерфейс платформы. Все запросы идут через шлюз <code>{API_BASE_URL}</code>.
        </p>
        {!user && (
          <p>
            <Link to="/login">Войдите</Link> или <Link to="/register">зарегистрируйтесь</Link>, чтобы увидеть профиль и
            сессии.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Сервисы</h2>
        {gatewayDown && (
          <div className="alert alert-error">
            Шлюз не отвечает. Запустите его: <code>docker compose up -d</code> в репозитории gateway.
          </div>
        )}
        <ul className="services">
          {PROBES.map(({ name }) => (
            <li key={name}>
              <span className={`dot dot-${statuses[name] ?? 'checking'}`} />
              {name}
              <span className="muted small">
                {statuses[name] === 'up' && 'работает'}
                {statuses[name] === 'down' && 'не запущен'}
                {statuses[name] === 'checking' && 'проверяем…'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
