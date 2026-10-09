import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { PatientPortalLayout } from '../layouts/PatientPortalLayout';
import { BookAppointmentPage } from '../pages/BookAppointmentPage';
import { DoctorDashboardPage } from '../pages/DoctorDashboardPage';
import { DoctorSchedulePage } from '../pages/DoctorSchedulePage';
import { LoginPage } from '../pages/LoginPage';
import { ManagerDashboardPage } from '../pages/ManagerDashboardPage';
import { ManagerAccountsPage } from '../pages/ManagerAccountsPage';
import { ManagerSchedulesPage } from '../pages/ManagerSchedulesPage';
import { MyAppointmentsPage } from '../pages/MyAppointmentsPage';
import { PatientDashboardPage } from '../pages/PatientDashboardPage';
import { PatientProfilePage } from '../pages/PatientProfilePage';
import { RegisterPage } from '../pages/RegisterPage';
import { useAuth } from '../stores/auth-store';
import { roleHome } from '../utils/format';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleProtectedRoute } from './RoleProtectedRoute';

function HomeRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return <Navigate to={user ? roleHome(user.role) : '/login'} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<PatientPortalLayout />}>
          <Route element={<RoleProtectedRoute role="PATIENT" />}>
            <Route path="/patient/dashboard" element={<PatientDashboardPage />} />
            <Route path="/patient/appointments/book" element={<BookAppointmentPage />} />
            <Route path="/patient/appointments" element={<MyAppointmentsPage />} />
            <Route path="/patient/profile" element={<PatientProfilePage />} />
          </Route>
        </Route>
        <Route element={<AppLayout />}>
          <Route element={<RoleProtectedRoute role="DOCTOR" />}>
            <Route path="/doctor/dashboard" element={<DoctorDashboardPage />} />
            <Route path="/doctor/schedule" element={<DoctorSchedulePage />} />
          </Route>
          <Route element={<RoleProtectedRoute role="MANAGER" />}>
            <Route path="/manager/dashboard" element={<ManagerDashboardPage />} />
            <Route path="/manager/accounts" element={<ManagerAccountsPage />} />
            <Route path="/manager/doctor-schedules" element={<ManagerSchedulesPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
