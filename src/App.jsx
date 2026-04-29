import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './components/AuthProvider'
import Layout from './components/Layout'
import Placeholder from './components/Placeholder'
import SignIn from './pages/SignIn'
import Home from './pages/Home'

// Activities
import ActivityLog from './pages/activities/ActivityLog'
import ActivityForm from './pages/activities/ActivityForm'

// Customers
import CustomerList from './pages/customers/CustomerList'
import CustomerDetail from './pages/customers/CustomerDetail'
import CustomerForm from './pages/customers/CustomerForm'

// Inventory
import InventoryList from './pages/inventory/InventoryList'
import PartDetail from './pages/inventory/PartDetail'


// Ops
import OpsHub from './pages/ops/OpsHub'
import AdjustInventory from './pages/ops/AdjustInventory'
import CommitMaterial from './pages/ops/CommitMaterial'
import ReceiveStock from './pages/ops/ReceiveStock'
import TransactionLog from './pages/ops/TransactionLog'

// Orders
import OrderList from './pages/orders/OrderList'
import OrderDetail from './pages/orders/OrderDetail'
import OrderForm from './pages/orders/OrderForm'

// Reports
import ReportsHub from './pages/reports/ReportsHub'
import ProductionDashboard from './pages/reports/ProductionDashboard'
import RepActivity from './pages/reports/RepActivity'
import InventoryHealth from './pages/reports/InventoryHealth'
import OrderStatusDashboard from './pages/reports/OrderStatusDashboard'

// Purchasing
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
        <Route path="/customers" element={<CustomerList />} />
        <Route path="/customers/new" element={<CustomerForm />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />

        {/* Activities */}
        <Route path="/activities" element={<ActivityLog />} />
        <Route path="/activities/new" element={<ActivityForm />} />

        {/* Pipeline */}
        <Route path="/pipeline" element={<Placeholder title="Pipeline" />} />

        {/* Orders */}
        <Route path="/orders" element={<OrderList />} />
        <Route path="/orders/new" element={<OrderForm />} />
        <Route path="/orders/:id" element={<OrderDetail />} />

        {/* Order Tracker */}
        <Route path="/tracker" element={<Placeholder title="Order Tracker" />} />

        {/* Inventory */}
        <Route path="/inventory" element={<InventoryList />} />
       
        <Route path="/inventory/:id" element={<PartDetail />} />

        {/* Ops */}
        <Route path="/ops" element={<OpsHub />} />
        <Route path="/ops/adjust" element={<AdjustInventory />} />
        <Route path="/ops/commit" element={<CommitMaterial />} />
        <Route path="/ops/receive" element={<ReceiveStock />} />
        <Route path="/ops/transactions" element={<TransactionLog />} />

        {/* Purchasing */}
        <Route path="/purchasing" element={<PurchaseOrders />} />
        <Route path="/purchasing/queue" element={<ReorderQueue />} />
        <Route path="/purchasing/po/:id" element={<PurchaseOrderDetail />} />

        {/* Reports */}
        <Route path="/reports" element={<ReportsHub />} />
        <Route path="/reports/production" element={<ProductionDashboard />} />
        <Route path="/reports/rep-activity" element={<RepActivity />} />
        <Route path="/reports/inventory-health" element={<InventoryHealth />} />
        <Route path="/reports/order-status" element={<OrderStatusDashboard />} />

        {/* Freight / Settings */}
        <Route path="/freight" element={<Placeholder title="Freight" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />

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
