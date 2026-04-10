import { Navigate } from 'react-router-dom';

export default function AdminRoute({ children }) {
  if (sessionStorage.getItem('evflo_admin') === 'true') return children;
  return <Navigate to="/admin/login" replace />;
}
