import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Start from './pages/Start';
import Session from './pages/Session';
import Stop from './pages/Stop';
import Receipt from './pages/Receipt';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminRoute from './components/AdminRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/charger/:chargePointId" element={<Landing />} />
        <Route path="/start/:chargePointId" element={<Start />} />
        <Route path="/session/:chargePointId" element={<Session />} />
        <Route path="/stop/:chargePointId" element={<Stop />} />
        <Route path="/receipt/:chargePointId" element={<Receipt />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/charger/EVFLO-01" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
