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
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <Routes><Route path="*" element={<SignIn />} /></Routes>

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Home />} />

        {/* Customers */}
        <Route path="/customers" element={<Placeholder label="Customers" />} />
        <Route path="/customers/new" element={<Placeholder label="New Customer" />} />
        <Route path="/customers/:id" element={<Placeholder label="Customer Detail" />} />

        {/* Orders */}
        <Route path="/orders" element={<Placeholder label="Orders" />} />
        <Route path="/orders/new" element={<Placeholder label="New Order" />} />
        <Route path="/orders/:id" element={<Placeholder label="Order Detail" />} />

        {/* Activities */}
        <Route path="/activities" element={<Placeholder label="Activities" />} />

        {/* Inventory */}
        <Route path="/inventory" element={<Placeholder label="Inventory" />} />
        <Route path="/inventory/:id" element={<Placeholder label="Part Detail" />} />

        {/* Ops */}
        <Route path="/ops" element={<Placeholder label="Ops / Warehouse" />} />

        {/* Purchasing */}
        <Route path="/purchasing" element={<PurchaseOrders />} />
        <Route path="/purchasing/queue" element={<ReorderQueue />} />
        <Route path="/purchasing/po/:id" element={<PurchaseOrderDetail />} />

        {/* Reports */}
        <Route path="/reports" element={<Placeholder label="Reports" />} />
        <Route path="/reports/production" element={<Placeholder label="Production Dashboard" />} />
        <Route path="/reports/rep-activity" element={<Placeholder label="Rep Activity" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
