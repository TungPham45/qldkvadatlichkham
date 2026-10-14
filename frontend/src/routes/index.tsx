import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { PatientPortalLayout } from '../layouts/PatientPortalLayout';
import { BookAppointmentPage } from '../pages/patient/BookAppointmentPage';
import { DoctorDashboardPage } from '../pages/doctor/DoctorDashboardPage';
import { DoctorSchedulePage } from '../pages/doctor/DoctorSchedulePage';
import { DoctorAppointmentConfirmationPage } from '../pages/doctor/DoctorAppointmentConfirmationPage';
import { DoctorExaminationPage } from '../pages/doctor/DoctorExaminationPage';
import { DoctorVisitDetailPage } from '../pages/doctor/DoctorVisitDetailPage';
import { HomePage } from '../pages/public/HomePage';
import { ManagerAccountsPage } from '../pages/manager/ManagerAccountsPage';
import { ManagerDoctorsPage } from '../pages/manager/ManagerDoctorsPage';
import { ManagerPatientsPage } from '../pages/manager/ManagerPatientsPage';
import { ManagerSchedulesPage } from '../pages/manager/ManagerSchedulesPage';
import { ManagerMedicinesPage } from '../pages/manager/ManagerMedicinesPage';
import { ManagerSpecialtiesPage } from '../pages/manager/ManagerSpecialtiesPage';
import { MyAppointmentsPage } from '../pages/patient/MyAppointmentsPage';
import { PatientProfilePage } from '../pages/patient/PatientProfilePage';
import { DiseasesPage } from '../pages/manager/DiseasesPage';
import { ManagerClinicalServicesPage } from '../pages/manager/ManagerClinicalServicesPage';
import { ManagerSuggestionsPage } from '../pages/manager/ManagerSuggestionsPage';
import { MyInvoicesPage } from '../pages/patient/MyInvoicesPage';
import { MedicalHistoryPage } from '../pages/shared/MedicalHistoryPage';
import { ReceptionPage } from '../pages/shared/ReceptionPage';
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
            <Route path="/patient/invoices" element={<MyInvoicesPage />} />
            <Route path="/patient/profile" element={<PatientProfilePage />} />
            <Route path="/my-records" element={<MedicalHistoryPage />} />
          </Route>
        </Route>
        <Route element={<AppLayout />}>
          <Route element={<RoleProtectedRoute role="DOCTOR" />}>
            <Route path="/doctor/dashboard" element={<DoctorDashboardPage />} />
            <Route path="/doctor/schedule" element={<DoctorSchedulePage />} />
            <Route path="/doctor/appointments/confirmation" element={<DoctorAppointmentConfirmationPage />} />
            <Route path="/doctor/examinations" element={<DoctorExaminationPage />} />
            <Route path="/doctor/examinations/:appointmentId" element={<DoctorVisitDetailPage />} />
          </Route>
          <Route element={<RoleProtectedRoute role="MANAGER" />}>
            <Route path="/manager/dashboard" element={<Navigate to="/manager/patients" replace />} />
            <Route path="/manager/patients" element={<ManagerPatientsPage />} />
            <Route path="/manager/doctors" element={<ManagerDoctorsPage />} />
            <Route path="/manager/specialties" element={<ManagerSpecialtiesPage />} />
            <Route path="/manager/medicines" element={<ManagerMedicinesPage />} />
            <Route path="/manager/clinical-services" element={<ManagerClinicalServicesPage />} />
            <Route path="/manager/accounts" element={<ManagerAccountsPage />} />
            <Route path="/manager/doctor-schedules" element={<ManagerSchedulesPage />} />
            <Route path="/manager/diseases" element={<DiseasesPage />} />
            <Route path="/manager/medicine-suggestions" element={<ManagerSuggestionsPage />} />
            <Route path="/reception" element={<ReceptionPage />} />
          </Route>
          <Route element={<RoleProtectedRoute role={['DOCTOR', 'MANAGER']} />}>
            <Route path="/medical-history" element={<MedicalHistoryPage />} />
          </Route>
        </Route>
        <Route path="/notifications" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
