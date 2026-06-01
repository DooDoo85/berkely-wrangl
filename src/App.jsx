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
import CommittedStockImport from './pages/inventory/CommittedStockImport'
import MatchReview from './pages/inventory/MatchReview'
import CommittedOrders from './pages/inventory/CommittedOrders'
import AdjustOnHand from './pages/inventory/AdjustOnHand'
import { ContainerList, ContainerDetail } from './pages/inventory/Containers'

// Ops
import OpsHub from './pages/ops/OpsHub'
import AdjustInventory from './pages/ops/AdjustInventory'
import CommitMaterial from './pages/ops/CommitMaterial'
import ReceiveStock from './pages/ops/ReceiveStock'
import ReceiveAgainstPO from './pages/ops/ReceiveAgainstPO'
import TransactionLog from './pages/ops/TransactionLog'
import ProductionHub from './pages/ops/ProductionHub'
import CycleCounts from './pages/ops/CycleCounts'
import OrdersOnHold from './pages/orders/OrdersOnHold'

// Orders
import OrderList from './pages/orders/OrderList'
import OrderDetail from './pages/orders/OrderDetail'
import OrderForm from './pages/orders/OrderForm'

// Reports
import ProductionDashboard from './pages/reports/ProductionDashboard'
import InventoryHealth from './pages/reports/InventoryHealth'
import OrderStatusDashboard from './pages/reports/OrderStatusDashboard'
import SalesActivityReport from './pages/reports/SalesActivityReport'
import RemakesReport from './pages/reports/RemakesReport'
import PartsCostQuote from './pages/reports/PartsCostQuote'
import VendorPricing from './pages/reports/VendorPricing'
import VendorPurchasing from './pages/reports/VendorPurchasing'

// Quotes (feature hidden — Quote Builder not yet active; routes removed from production nav)
// import QuotesList from './pages/quotes/QuotesList'
// import QuoteBuilder from './pages/quotes/QuoteBuilder'
// import QuoteDetail from './pages/quotes/QuoteDetail'

// Calendar
import CalendarPage from './pages/calendar/CalendarPage'

// Price Grids
import PriceGridImport from './pages/inventory/PriceGridImport'

// System
import FeedbackTickets from './pages/system/FeedbackTickets'
import UserManagement from './pages/system/UserManagement'
import UsageAnalytics from './pages/system/UsageAnalytics'

// Purchasing
import PurchaseOrders from './pages/purchasing/PurchaseOrders'
import ReorderQueue from './pages/purchasing/ReorderQueue'
import PurchaseOrderDetail from './pages/purchasing/PurchaseOrderDetail'

// Settings
import EmailPreferences from './pages/settings/EmailPreferences'

// Rep personal worklist
import MyOpenQuotes from './pages/MyOpenQuotes'

// Activity logging — global launcher route that fires the modal anywhere
import LogActivityLauncher from './pages/LogActivityLauncher'

import SetPasswordRequired from './components/SetPasswordRequired'

function AppRoutes() {
  const { user, loading, needsPassword } = useAuth()
  if (loading) return null
  if (!user) return <Routes><Route path="*" element={<SignIn />} /></Routes>

  return (
    <>
      {needsPassword && <SetPasswordRequired />}
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

        {/* /log — fires the GlobalActivityModal event and redirects home.
            Any "Log Activity" button points here so the modal opens over
            whatever page the user was on, without depending on /activities
            rendering. See src/components/GlobalActivityModal.jsx. */}
        <Route path="/log" element={<LogActivityLauncher />} />

        {/* Pipeline */}
        <Route path="/pipeline" element={<Placeholder title="Pipeline" />} />

        {/* My Open Quotes — rep's personal aging-quote worklist */}
        <Route path="/my-quotes" element={<MyOpenQuotes />} />

        {/* Orders */}
        <Route path="/orders" element={<OrderList />} />
        <Route path="/orders/new" element={<OrderForm />} />
        <Route path="/orders/:id" element={<OrderDetail />} />

        {/* Order Tracker */}
        <Route path="/tracker" element={<Placeholder title="Order Tracker" />} />

        {/* Inventory */}
        <Route path="/inventory" element={<InventoryList />} />
        <Route path="/inventory/fabrics" element={<InventoryList partType="fabric" />} />
        <Route path="/inventory/components" element={<InventoryList partType="component" />} />
        <Route path="/inventory/extrusions" element={<InventoryList partType="extrusion" />} />
        <Route path="/inventory/faux-blinds" element={<InventoryList partType="blind" />} />
        <Route path="/inventory/committed-import" element={<CommittedStockImport />} />
        <Route path="/inventory/match-review" element={<MatchReview />} />
        <Route path="/inventory/committed" element={<CommittedOrders />} />
        <Route path="/inventory/adjust" element={<AdjustOnHand />} />
        <Route path="/inventory/price-grids" element={<PriceGridImport />} />
        <Route path="/inventory/containers" element={<ContainerList />} />
        <Route path="/inventory/containers/:id" element={<ContainerDetail />} />
        <Route path="/inventory/:id" element={<PartDetail />} />

        {/* Ops */}
        <Route path="/ops" element={<OpsHub />} />
        <Route path="/ops/production" element={<ProductionHub />} />
        <Route path="/ops/adjust" element={<AdjustInventory />} />
        <Route path="/ops/commit" element={<CommitMaterial />} />
        <Route path="/ops/receive" element={<ReceiveStock />} />
        <Route path="/ops/receive-po/:id" element={<ReceiveAgainstPO />} />
        <Route path="/ops/transactions" element={<TransactionLog />} />
        <Route path="/ops/cycle-counts" element={<CycleCounts />} />

        {/* Orders on Hold */}
        <Route path="/orders/on-hold" element={<OrdersOnHold />} />

        {/* Purchasing */}
        <Route path="/purchasing" element={<PurchaseOrders />} />
        <Route path="/purchasing/queue" element={<ReorderQueue />} />
        <Route path="/purchasing/po/:id" element={<PurchaseOrderDetail />} />

        {/* Reports */}
        <Route path="/reports" element={<Navigate to="/reports/sales-activity" replace />} />
        <Route path="/reports/production"       element={<ProductionDashboard />} />
        <Route path="/reports/sales-activity"   element={<SalesActivityReport />} />
        <Route path="/reports/remakes"          element={<RemakesReport />} />
        <Route path="/reports/parts-cost"       element={<PartsCostQuote />} />
        <Route path="/reports/vendor-pricing"   element={<VendorPricing />} />
        <Route path="/reports/vendor-purchasing" element={<VendorPurchasing />} />
        <Route path="/reports/inventory-health" element={<InventoryHealth />} />
        <Route path="/reports/order-status"     element={<OrderStatusDashboard />} />

        {/* Legacy redirects — preserve bookmarks */}
        <Route path="/reports/sales-intelligence" element={<Navigate to="/reports/sales-activity" replace />} />
        <Route path="/reports/rep-activity"       element={<Navigate to="/reports/sales-activity" replace />} />
        <Route path="/reports/faux-usage"          element={<Navigate to="/inventory/faux-blinds" replace />} />
        <Route path="/reports/inventory-velocity" element={<Navigate to="/inventory/faux-blinds" replace />} />

        {/* Quotes — feature hidden, see commented imports at top */}
        {/* <Route path="/quotes" element={<QuotesList />} /> */}
        {/* <Route path="/quotes/new" element={<QuoteBuilder />} /> */}
        {/* <Route path="/quotes/:id" element={<QuoteDetail />} /> */}

        {/* Calendar */}
        <Route path="/calendar" element={<CalendarPage />} />

        {/* System */}
        <Route path="/system/tickets" element={<FeedbackTickets />} />
        <Route path="/system/users" element={<UserManagement />} />
        <Route path="/system/usage" element={<UsageAnalytics />} />

        {/* Freight / Settings */}
        <Route path="/freight" element={<Placeholder title="Freight" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
        <Route path="/settings/email-preferences" element={<EmailPreferences />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
