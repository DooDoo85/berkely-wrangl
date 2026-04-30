import { Routes, Route } from 'react-router-dom'
import { useAuth } from './components/AuthProvider'
import Layout from './components/Layout'
import SignIn from './pages/SignIn'
import Home from './pages/Home'

// Customers
import CustomerList   from './pages/customers/CustomerList'
import CustomerDetail from './pages/customers/CustomerDetail'
import CustomerForm   from './pages/customers/CustomerForm'

// Activities
import ActivityLog  from './pages/activities/ActivityLog'
import ActivityForm from './pages/activities/ActivityForm'

// Orders
import OrderList   from './pages/orders/OrderList'
import OrderDetail from './pages/orders/OrderDetail'
import OrderForm   from './pages/orders/OrderForm'
import OrdersOnHold from './pages/orders/OrdersOnHold'

// Inventory
import InventoryList       from './pages/inventory/InventoryList'
import PartDetail          from './pages/inventory/PartDetail'
import CommittedStockImport from './pages/inventory/CommittedStockImport'
import MatchReview         from './pages/inventory/MatchReview'
import PriceGridImport     from './pages/inventory/PriceGridImport'

// Ops
import OpsHub from './pages/ops/OpsHub'
import ProductionHub from './pages/ops/ProductionHub'

// Reports
import ReportsHub           from './pages/reports/ReportsHub'
import ProductionDashboard  from './pages/reports/ProductionDashboard'
import InventoryHealth      from './pages/reports/InventoryHealth'
import OrderStatusDashboard from './pages/reports/OrderStatusDashboard'
import RepActivity          from './pages/reports/RepActivity'

// Purchasing
import PurchaseOrders     from './pages/purchasing/PurchaseOrders'
import ReorderQueue       from './pages/purchasing/ReorderQueue'
import PurchaseOrderDetail from './pages/purchasing/PurchaseOrderDetail'

// Quotes
import QuotesList   from './pages/quotes/QuotesList'
import QuoteBuilder from './pages/quotes/QuoteBuilder'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )

  if (!user) return (
    <Routes>
      <Route path="*" element={<SignIn />} />
    </Routes>
  )

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/"                              element={<Home />} />

        {/* Customers */}
        <Route path="/customers"                     element={<CustomerList />} />
        <Route path="/customers/new"                 element={<CustomerForm />} />
        <Route path="/customers/:id"                 element={<CustomerDetail />} />
        <Route path="/customers/:id/edit"            element={<CustomerForm />} />

        {/* Activities */}
        <Route path="/activities"                    element={<ActivityLog />} />
        <Route path="/activities/new"                element={<ActivityForm />} />

        {/* Orders */}
        <Route path="/orders"                        element={<OrderList />} />
        <Route path="/orders/new"                    element={<OrderForm />} />
        <Route path="/orders/on-hold"                element={<OrdersOnHold />} />
        <Route path="/orders/:id"                    element={<OrderDetail />} />

        {/* Ops */}
        <Route path="/ops"                           element={<OpsHub />} />
        <Route path="/ops/production"                element={<ProductionHub />} />

        {/* Inventory */}
        <Route path="/inventory"                     element={<InventoryList />} />
        <Route path="/inventory/committed-import"    element={<CommittedStockImport />} />
        <Route path="/inventory/match-review"        element={<MatchReview />} />
        <Route path="/inventory/price-grids"         element={<PriceGridImport />} />
        <Route path="/inventory/:id"                 element={<PartDetail />} />

        {/* Reports */}
        <Route path="/reports"                       element={<ReportsHub />} />
        <Route path="/reports/production"            element={<ProductionDashboard />} />
        <Route path="/reports/inventory"             element={<InventoryHealth />} />
        <Route path="/reports/order-status"          element={<OrderStatusDashboard />} />
        <Route path="/reports/rep-activity"          element={<RepActivity />} />

        {/* Purchasing */}
        <Route path="/purchasing"                    element={<PurchaseOrders />} />
        <Route path="/purchasing/queue"              element={<ReorderQueue />} />
        <Route path="/purchasing/po/:id"             element={<PurchaseOrderDetail />} />

        {/* Quotes */}
        <Route path="/quotes"                        element={<QuotesList />} />
        <Route path="/quotes/new"                    element={<QuoteBuilder />} />
      </Route>
    </Routes>
  )
}
