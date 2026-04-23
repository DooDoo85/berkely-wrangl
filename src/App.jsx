import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './components/AuthProvider'
import Layout from './components/Layout'
import Placeholder from './components/Placeholder'
import SignIn from './pages/SignIn'
import Home from './pages/Home'
import CustomerList from './pages/customers/CustomerList'
import CustomerDetail from './pages/customers/CustomerDetail'
import CustomerForm from './pages/customers/CustomerForm'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 rounded-xl bg-brand-gold/20 border border-brand-gold/30 flex items-center justify-center mx-auto mb-3">
          <span className="text-brand-gold font-display font-bold">W</span>
        </div>
        <div className="text-stone-500 text-sm">Loading...</div>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/signin" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Home />} />

        {/* Customers - Phase 1 */}
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/new" element={<CustomerForm />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="customers/:id/edit" element={<CustomerForm />} />

        {/* Phase 2 */}
        <Route path="orders" element={<Placeholder title="Orders" description="Full order management with line items and status tracking." icon="≡" />} />
        <Route path="tracker" element={<Placeholder title="Order Tracker" description="Track active orders, flag holds, and monitor production." icon="◉" />} />

        {/* Phase 3 */}
        <Route path="activities" element={<Placeholder title="Activities" description="Log calls, emails, meetings and notes." icon="◈" />} />
        <Route path="pipeline" element={<Placeholder title="Pipeline" description="Sales pipeline with rep KPIs and deal tracking." icon="▤" />} />

        {/* Phase 4 */}
        <Route path="inventory" element={<Placeholder title="Inventory" description="Parts, fabric rolls, faux wood blinds, and stock tracking." icon="▦" />} />
        <Route path="freight" element={<Placeholder title="Freight" description="Freight management and container tracking." icon="▷" />} />

        {/* Phase 6 */}
        <Route path="reports" element={<Placeholder title="Reports" description="Executive dashboards, production reports, and sales analytics." icon="▣" />} />
        <Route path="settings" element={<Placeholder title="Settings" description="User management, roles, and system configuration." icon="◌" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
