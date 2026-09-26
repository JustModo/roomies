import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthContext';
import AppRouter from './AppRouter';
import { ErrorBoundary } from './ErrorBoundary';
import { ServicesProvider } from './ServicesProvider';

export default function App() {
  return (
    <ServicesProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </ServicesProvider>
  );
}
