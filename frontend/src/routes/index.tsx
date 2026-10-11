import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { PatientPortalLayout } from '../layouts/PatientPortalLayout';
import { BookAppointmentPage } from '../pages/BookAppointmentPage';
import { DoctorDashboardPage } from '../pages/DoctorDashboardPage';
import { DoctorSchedulePage } from '../pages/DoctorSchedulePage';
import { HomePage } from '../pages/HomePage';
import { ManagerAccountsPage } from '../pages/ManagerAccountsPage';
import { ManagerDoctorsPage } from '../pages/ManagerDoctorsPage';
import { ManagerPatientsPage } from '../pages/ManagerPatientsPage';
import { ManagerSchedulesPage } from '../pages/ManagerSchedulesPage';
import { ManagerSpecialtiesPage } from '../pages/ManagerSpecialtiesPage';
import { MyAppointmentsPage } from '../pages/MyAppointmentsPage';
import { PatientProfilePage } from '../pages/PatientProfilePage';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleProtectedRoute } from './RoleProtectedRoute';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<Navigate to="/?auth=login" replace />} />
      <Route path="/register" element={<Navigate to="/?auth=register" replace />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<PatientPortalLayout />}>
          <Route element={<RoleProtectedRoute role="PATIENT" />}>
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
            <Route path="/manager/dashboard" element={<Navigate to="/manager/patients" replace />} />
            <Route path="/manager/patients" element={<ManagerPatientsPage />} />
            <Route path="/manager/doctors" element={<ManagerDoctorsPage />} />
            <Route path="/manager/specialties" element={<ManagerSpecialtiesPage />} />
            <Route path="/manager/accounts" element={<ManagerAccountsPage />} />
            <Route path="/manager/doctor-schedules" element={<ManagerSchedulesPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
