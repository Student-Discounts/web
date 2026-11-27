import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { AdminPage } from './pages/AdminPage';
import { Card, CardContent } from './components/ui/card';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';
import { SearchPage } from './pages/SearchPage';
import { PlacePage } from './pages/PlacePage';
import { SubmissionsPage } from './pages/SubmissionsPage';
import { SubmissionPage } from './pages/SubmissionPage';
import { ModerationPage } from './pages/ModerationPage';
import { ReviewPage } from './pages/ReviewPage';
import { ReportsPage } from './pages/ReportsPage';
import { ReportQueuePage } from './pages/ReportQueuePage';
import type { Role } from './api/auth';

const reviewers: Role[] = ['MODERATOR', 'SENIOR_MODERATOR'];

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
            <Route path="search" element={<SearchPage />} />
            <Route path="places/:placeId" element={<PlacePage />} />
            <Route path="submissions" element={<RequireAuth><SubmissionsPage /></RequireAuth>} />
            <Route path="submissions/new" element={<RequireAuth><SubmissionPage key="new" /></RequireAuth>} />
            <Route path="submissions/:submissionId" element={<RequireAuth><SubmissionPage key="existing" /></RequireAuth>} />
            <Route path="moderation" element={<RequireAuth roles={reviewers}><ModerationPage /></RequireAuth>} />
            <Route path="moderation/reviews/:submissionId" element={<RequireAuth roles={reviewers}><ReviewPage /></RequireAuth>} />
            <Route path="moderation/reports" element={<RequireAuth roles={reviewers}><ReportQueuePage /></RequireAuth>} />
            <Route path="reports" element={<RequireAuth roles={['STUDENT']}><ReportsPage /></RequireAuth>} />
            <Route path="*" element={<Card><CardContent><h1 className="text-2xl font-semibold">Страница не найдена</h1></CardContent></Card>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
