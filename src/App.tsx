import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { AdminPage } from './pages/AdminPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route
              path="profile"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
            <Route
              path="admin"
              element={
                <RequireAuth roles={['SENIOR_MODERATOR']}>
                  <AdminPage />
                </RequireAuth>
              }
            />
            <Route
              path="search"
              element={
                <ComingSoonPage
                  title="Поиск скидок"
                  service="search"
                  endpoints={['GET /api/v1/search/places', 'GET /api/v1/catalog/places/{id}']}
                />
              }
            />
            <Route
              path="submissions"
              element={
                <RequireAuth>
                  <ComingSoonPage
                    title="Мои заявки"
                    service="submission"
                    endpoints={[
                      'GET /api/v1/submissions',
                      'POST /api/v1/submissions',
                      'POST /api/v1/submissions/{id}/submit',
                      'POST /api/v1/media-assets',
                    ]}
                  />
                </RequireAuth>
              }
            />
            <Route
              path="moderation"
              element={
                <RequireAuth roles={['MODERATOR', 'SENIOR_MODERATOR']}>
                  <ComingSoonPage
                    title="Модерация"
                    service="moderation"
                    endpoints={['GET /api/v1/moderation/queue', 'POST /api/v1/moderation/reviews/{id}/commands']}
                  />
                </RequireAuth>
              }
            />
            <Route
              path="*"
              element={
                <section className="card">
                  <h1>Страница не найдена</h1>
                </section>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
