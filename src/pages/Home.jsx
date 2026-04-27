import { useAuth } from '../components/AuthProvider'
import ExecutiveHome from './dashboard/ExecutiveHome'
import RepHome from './dashboard/RepHome'

export default function Home() {
  const { profile } = useAuth()
  const role = profile?.role

  if (role === 'executive' || role === 'admin') return <ExecutiveHome />
  if (role === 'sales') return <RepHome />

  // fallback while role loads or for ops/warehouse users
  return <ExecutiveHome />
}
