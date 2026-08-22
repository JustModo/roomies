import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login = lazy(() => import('../pages/Login'));
const Register = lazy(() => import('../pages/Register'));
const Lobby = lazy(() => import('../pages/Lobby'));
const Room = lazy(() => import('../pages/Room'));

const ProtectedRoute = () => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-dvh bg-void" />;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default function AppRouter() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Lobby />} />
          <Route path="/room" element={<Room />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
