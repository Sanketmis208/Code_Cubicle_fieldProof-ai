import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/protected-route";
import { AppLayout } from "@/layouts/app-layout";
import { AuthLayout } from "@/layouts/auth-layout";
import { LandingPage } from "@/pages/landing";
import { SignInPage, SignUpPage } from "@/pages/auth";
import { DashboardPage } from "@/pages/dashboard";
import { ProjectsPage } from "@/pages/projects";
import { ProjectEditorPage } from "@/pages/project-editor";
import { ProjectDetailPage } from "@/pages/project-detail";
import { SettingsPage } from "@/pages/foundation";
import { MediaLibraryPage } from "@/pages/media-library";
import { ComparisonsPage } from "@/pages/comparisons";
import { ReportsPage } from "@/pages/reports";
import { OrganizationPage } from "@/pages/organization";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<AuthLayout />}>
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="sign-up" element={<SignUpPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="app" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/new" element={<ProjectEditorPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="projects/:id/edit" element={<ProjectEditorPage />} />
          <Route path="library" element={<MediaLibraryPage />} />
          <Route path="comparisons" element={<ComparisonsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="organization" element={<OrganizationPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
