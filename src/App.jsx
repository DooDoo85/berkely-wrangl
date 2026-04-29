import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './components/AuthProvider'
import Layout from './components/Layout'
import Placeholder from './components/Placeholder'
import SignIn from './pages/SignIn'
import Home from './pages/Home'

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Routes><Route path="*" element={<SignIn />} /></Routes>

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
