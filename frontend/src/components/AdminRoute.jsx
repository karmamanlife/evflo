import { Navigate } from 'react-router-dom';

export default function AdminRoute({ children }) {
  const authed = sessionStorage.getItem('evflo_admin') === 'true';
  return authed ? children : <Navigate to="/admin/login" replace />;
}
