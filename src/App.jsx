import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './components/AuthProvider'
import Layout from './components/Layout'
import Placeholder from './components/Placeholder'
import SignIn from './pages/SignIn'
import Home from './pages/Home'
import PurchaseOrders from './pages/purchasing/PurchaseOrders'
import ReorderQueue from './pages/purchasing/ReorderQueue'
import PurchaseOrderDetail from './pages/purchasing/PurchaseOrderDetail'

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Routes><Route path="*" element={<SignIn />} /></Routes>

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Home />} />

        {/* Customers */}
        <Route path="/customers" element={<Placeholder title="Customers" />} />
        <Route path="/customers/new" element={<Placeholder title="New Customer" />} />
        <Route path="/customers/:id" element={<Placeholder title="Customer Detail" />} />

        {/* Orders */}
        <Route path="/orders" element={<Placeholder title="Orders" />} />
        <Route path="/orders/new" element={<Placeholder title="New Order" />} />
        <Route path="/orders/:id" element={<Placeholder title="Order Detail" />} />

        {/* Activities */}
        <Route path="/activities" element={<Placeholder title="Activities" />} />

        {/* Inventory */}
        <Route path="/inventory" element={<Placeholder title="Inventory" />} />
        <Route path="/inventory/:id" element={<Placeholder title="Part Detail" />} />

        {/* Ops */}
        <Route path="/ops" element={<Placeholder title="Ops / Warehouse" />} />

        {/* Purchasing */}
        <Route path="/purchasing" element={<PurchaseOrders />} />
        <Route path="/purchasing/queue" element={<ReorderQueue />} />
        <Route path="/purchasing/po/:id" element={<PurchaseOrderDetail />} />

        {/* Reports */}
        <Route path="/reports" element={<Placeholder title="Reports" />} />
        <Route path="/reports/production" element={<Placeholder title="Production Dashboard" />} />
        <Route path="/reports/rep-activity" element={<Placeholder title="Rep Activity" />} />

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
