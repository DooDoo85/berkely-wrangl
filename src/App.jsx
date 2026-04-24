import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './components/AuthProvider'
import Layout from './components/Layout'
import Placeholder from './components/Placeholder'
import SignIn from './pages/SignIn'
import Home from './pages/Home'
import CustomerList from './pages/customers/CustomerList'
import CustomerDetail from './pages/customers/CustomerDetail'
import CustomerForm from './pages/customers/CustomerForm'
import OrderList from './pages/orders/OrderList'
import OrderDetail from './pages/orders/OrderDetail'
import OrderForm from './pages/orders/OrderForm'
import ActivityLog from './pages/activities/ActivityLog'
import InventoryList from './pages/inventory/InventoryList'
import PartDetail from './pages/inventory/PartDetail'
import { ContainerList, ContainerDetail } from './pages/inventory/Containers'
import OpsHub from './pages/ops/OpsHub'
import ReceiveStock from './pages/ops/ReceiveStock'
import CommitMaterial from './pages/ops/CommitMaterial'
import AdjustInventory from './pages/ops/AdjustInventory'
import TransactionLog from './pages/ops/TransactionLog'

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
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/new" element={<CustomerForm />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="customers/:id/edit" element={<CustomerForm />} />
        <Route path="orders" element={<OrderList />} />
        <Route path="orders/new" element={<OrderForm />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="orders/:id/edit" element={<OrderForm />} />
        <Route path="activities" element={<ActivityLog />} />
        <Route path="inventory" element={<InventoryList />} />
        <Route path="inventory/containers" element={<ContainerList />} />
        <Route path="inventory/containers/:id" element={<ContainerDetail />} />
        <Route path="inventory/:id" element={<PartDetail />} />
        <Route path="ops" element={<OpsHub />} />
        <Route path="ops/receive" element={<ReceiveStock />} />
        <Route path="ops/commit" element={<CommitMaterial />} />
        <Route path="ops/adjust" element={<AdjustInventory />} />
        <Route path="ops/log" element={<TransactionLog />} />
        <Route path="pipeline" element={<Placeholder title="Pipeline" description="Sales pipeline with rep KPIs and deal tracking." icon="▤" />} />
        <Route path="tracker" element={<Placeholder title="Order Tracker" description="Track active orders, flag holds, and monitor production." icon="◉" />} />
        <Route path="freight" element={<Placeholder title="Freight" description="Freight management and container tracking." icon="▷" />} />
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
