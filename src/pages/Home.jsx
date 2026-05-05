import { useAuth } from '../components/AuthProvider'
import ExecutiveHome from './dashboard/ExecutiveHome'
import RepHome from './dashboard/RepHome'
import ProductionHome from './dashboard/ProductionHome'

export default function Home() {
  const { profile } = useAuth()
  const role = profile?.role

  if (role === 'executive' || role === 'admin') return <ExecutiveHome />
  if (role === 'sales') return <RepHome />
  if (role === 'production') return <ProductionHome />

  // fallback while role loads
  return <ExecutiveHome />
}
