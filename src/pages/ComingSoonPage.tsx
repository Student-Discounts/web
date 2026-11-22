/** Заглушка раздела, экран которого добавит владелец сервиса. */
export function ComingSoonPage({ title, service, endpoints }: { title: string; service: string; endpoints: string[] }) {
  return (
    <section className="card">
      <h1>{title}</h1>
      <p className="muted">
        Экран в разработке. Данные даёт сервис <code>{service}</code>:
      </p>
      <ul>
        {endpoints.map((endpoint) => (
          <li key={endpoint}>
            <code>{endpoint}</code>
          </li>
        ))}
      </ul>
      <p className="muted small">
        Как добавить экран: функции запросов — в <code>src/api/</code> по образцу <code>auth.ts</code> (токен и его
        обновление клиент подставит сам), страница — в <code>src/pages/</code>, маршрут — в <code>src/App.tsx</code>.
      </p>
    </section>
  );
}
