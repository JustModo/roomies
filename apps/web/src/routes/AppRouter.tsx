import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import Party from '../pages/Party';

const ProtectedRoute = () => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><span className="loader"></span></div>;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/party/:partyId" element={<Party />} />
      </Route>
      
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
