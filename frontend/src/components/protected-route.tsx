import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { LoadingScreen } from './loading-screen';

export function ProtectedRoute() {
  const { user, isLoading } = useAuth(); const location = useLocation();
  if (isLoading) return <LoadingScreen />;
  return user ? <Outlet /> : <Navigate to="/sign-in" state={{ from: location }} replace />;
}
