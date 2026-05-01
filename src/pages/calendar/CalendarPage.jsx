import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const CATEGORY_COLORS = {
  'Client Meeting': 'bg-blue-100 text-blue-800 border-blue-200',
  'Follow Up':      'bg-amber-100 text-amber-800 border-amber-200',
  'Reminder':       'bg-purple-100 text-purple-800 border-purple-200',
  'Product Demo':   'bg-green-100 text-green-800 border-green-200',
  'Sample Drop':    'bg-pink-100 text-pink-800 border-pink-200',
  'Phone Call':     'bg-cyan-100 text-cyan-800 border-cyan-200',
  'Email':          'bg-indigo-100 text-indigo-800 border-indigo-200',
  'Other':          'bg-gray-100 text-gray-700 border-gray-200',
  'follow_up':      'bg-orange-100 text-orange-800 border-orange-200',
}

const CATEGORIES = ['Client Meeting','Follow Up','Reminder','Product Demo','Sample Drop','Phone Call','Email','Other']

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function formatDate(d) {
  return d.toISOString().slice(0, 10)
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export default function CalendarPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [view, setView]           = useState('month')
  const [current, setCurrent]     = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - d.getDay())
    return d
  })
  const [tasks, setTasks]         = useState([])
  const [followUps, setFollowUps] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [editTask, setEditTask]   = useState(null)
  const [customers, setCustomers] = useState([])
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({
    title: '', notes: '', category: 'Reminder',
    due_date: '', due_time: '', customer_id: '',
  })

  useEffect(() => { if (profile) { loadTasks(); loadFollowUps(); loadCustomers() } }, [profile])

  const loadTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*, customers(account_name)')
      .eq('user_id', profile.id)
      .eq('completed', false)
      .order('due_date')
    setTasks(data || [])
  }

  const loadFollowUps = async () => {
    const { data } = await supabase
      .from('activities')
      .select('id, subject, body, follow_up_date, customers(account_name)')
      .eq('user_id', profile.id)
      .eq('completed', false)
      .not('follow_up_date', 'is', null)
      .order('follow_up_date')
    setFollowUps(data || [])
  }

  const loadCustomers = async () => {
    const isSales = profile?.role === 'sales'
    let q = supabase.from('customers').select('id, account_name').eq('active', true).order('account_name')
    if (isSales) {
      const { data: repRow } = await supabase.from('rep_email_map').select('rep_name').eq('email', profile.email).single()
      if (repRow?.rep_name) q = q.eq('sales_rep', repRow.rep_name)
    }
    const { data } = await q.limit(200)
    setCustomers(data || [])
  }

  const openNew = (date = null) => {
    setEditTask(null)
    setForm({ title: '', notes: '', category: 'Reminder', due_date: date || formatDate(today), due_time: '', customer_id: '' })
    setSelectedDate(date)
    setShowModal(true)
  }

  const openEdit = (task) => {
    setEditTask(task)
    setForm({
      title: task.title, notes: task.notes || '',
      category: task.category, due_date: task.due_date || '',
      due_time: task.due_time || '', customer_id: task.customer_id || '',
    })
    setShowModal(true)
  }

  const saveTask = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = { ...form, user_id: profile.id, customer_id: form.customer_id || null, updated_at: new Date().toISOString() }
    if (editTask) {
      await supabase.from('tasks').update(payload).eq('id', editTask.id)
    } else {
      await supabase.from('tasks').insert(payload)
    }
    setSaving(false)
    setShowModal(false)
    loadTasks()
  }

  const completeTask = async (id) => {
    await supabase.from('tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', id)
    loadTasks()
  }

  const deleteTask = async (id) => {
    await supabase.from('tasks').delete().eq('id', id)
    loadTasks()
  }

  const addToGoogleCalendar = (item, isFollowUp = false) => {
    const title = isFollowUp ? `Follow Up: ${item.subject || item.customers?.account_name}` : item.title
    const date  = isFollowUp ? item.follow_up_date : item.due_date
    const notes = isFollowUp ? (item.body || '') : (item.notes || '')
    const customer = item.customers?.account_name || ''

    if (!date) return
    const d = date.replace(/-/g, '')
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(title)}` +
      `&dates=${d}/${d}` +
      `&details=${encodeURIComponent(customer ? `Customer: ${customer}\n\n${notes}` : notes)}`
    window.open(url, '_blank')
  }

  // ── Calendar helpers ────────────────────────────────────────

  const getItemsForDate = (dateStr) => {
    const t = tasks.filter(t => t.due_date === dateStr)
    const f = followUps.filter(f => f.follow_up_date === dateStr)
    return { tasks: t, followUps: f }
  }

  // Monthly view
  const monthDays = () => {
    const year = current.getFullYear()
    const month = current.getMonth()
    const first = new Date(year, month, 1)
    const last  = new Date(year, month + 1, 0)
    const startPad = first.getDay()
    const days = []
    for (let i = 0; i < startPad; i++) days.push(null)
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
    return days
  }

  // Weekly view
  const weekDays = () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const prevMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1))
  const nextMonth = () => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1))
  const prevWeek  = () => setWeekStart(addDays(weekStart, -7))
  const nextWeek  = () => setWeekStart(addDays(weekStart, 7))

  const isToday = (d) => d && formatDate(d) === formatDate(today)

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('month')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'month' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
              Month
            </button>
            <button onClick={() => setView('week')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'week' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
              Week
            </button>
          </div>
          <button onClick={() => openNew()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            + New Task
          </button>
        </div>
      </div>

      <div className="flex gap-5">
        {/* Main calendar */}
        <div className="flex-1">
          {/* Nav */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={view === 'month' ? prevMonth : prevWeek}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600">‹</button>
            <div className="font-semibold text-gray-900">
              {view === 'month'
                ? `${MONTHS[current.getMonth()]} ${current.getFullYear()}`
                : `${weekDays()[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${weekDays()[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`
              }
            </div>
            <button onClick={view === 'month' ? nextMonth : nextWeek}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600">›</button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
            ))}
          </div>

          {/* Month view */}
          {view === 'month' && (
            <div className="grid grid-cols-7 border-l border-t border-gray-200">
              {monthDays().map((d, i) => {
                if (!d) return <div key={`pad-${i}`} className="border-r border-b border-gray-200 bg-gray-50 min-h-[90px]" />
                const dateStr = formatDate(d)
                const { tasks: dt, followUps: df } = getItemsForDate(dateStr)
                const isPast = d < today
                return (
                  <div key={dateStr}
                    onClick={() => openNew(dateStr)}
                    className={`border-r border-b border-gray-200 min-h-[90px] p-1.5 cursor-pointer transition-colors
                      ${isToday(d) ? 'bg-blue-50' : isPast ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'}`}>
                    <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
                      ${isToday(d) ? 'bg-blue-600 text-white' : 'text-gray-700'}`}>
                      {d.getDate()}
                    </div>
                    {dt.slice(0,2).map(t => (
                      <div key={t.id} onClick={e => { e.stopPropagation(); openEdit(t) }}
                        className={`text-xs px-1 py-0.5 rounded mb-0.5 truncate border cursor-pointer ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.Other}`}>
                        {t.title}
                      </div>
                    ))}
                    {df.slice(0,2).map(f => (
                      <div key={f.id}
                        className="text-xs px-1 py-0.5 rounded mb-0.5 truncate border bg-orange-100 text-orange-800 border-orange-200">
                        📅 {f.customers?.account_name || f.subject}
                      </div>
                    ))}
                    {(dt.length + df.length) > 4 && (
                      <div className="text-xs text-gray-400">+{dt.length + df.length - 4} more</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Week view */}
          {view === 'week' && (
            <div className="grid grid-cols-7 border-l border-t border-gray-200">
              {weekDays().map(d => {
                const dateStr = formatDate(d)
                const { tasks: dt, followUps: df } = getItemsForDate(dateStr)
                const isPast = d < today
                return (
                  <div key={dateStr}
                    onClick={() => openNew(dateStr)}
                    className={`border-r border-b border-gray-200 min-h-[200px] p-2 cursor-pointer transition-colors
                      ${isToday(d) ? 'bg-blue-50' : isPast ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'}`}>
                    <div className={`text-xs font-medium mb-2 w-7 h-7 flex items-center justify-center rounded-full
                      ${isToday(d) ? 'bg-blue-600 text-white' : 'text-gray-700'}`}>
                      {d.getDate()}
                    </div>
                    {dt.map(t => (
                      <div key={t.id} onClick={e => { e.stopPropagation(); openEdit(t) }}
                        className={`text-xs px-1.5 py-1 rounded mb-1 border cursor-pointer ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.Other}`}>
                        <div className="font-medium truncate">{t.title}</div>
                        {t.customers?.account_name && <div className="text-xs opacity-70 truncate">{t.customers.account_name}</div>}
                      </div>
                    ))}
                    {df.map(f => (
                      <div key={f.id}
                        className="text-xs px-1.5 py-1 rounded mb-1 border bg-orange-100 text-orange-800 border-orange-200">
                        <div className="font-medium truncate">📅 Follow Up</div>
                        {f.customers?.account_name && <div className="opacity-70 truncate">{f.customers.account_name}</div>}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sidebar — upcoming */}
        <div className="w-64 flex-shrink-0 space-y-3">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">Upcoming Tasks</div>
            </div>
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {tasks.length === 0 && (
                <div className="p-4 text-xs text-gray-400 text-center">No pending tasks 🎉</div>
              )}
              {tasks.slice(0, 10).map(t => {
                const overdue = t.due_date && t.due_date < formatDate(today)
                return (
                  <div key={t.id} className="p-2.5 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">{t.title}</div>
                        {t.customers?.account_name && <div className="text-xs text-gray-400 truncate">{t.customers.account_name}</div>}
                        {t.due_date && (
                          <div className={`text-xs mt-0.5 ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            {overdue ? '⚠ ' : ''}{t.due_date}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => addToGoogleCalendar(t)}
                          title="Add to Google Calendar"
                          className="text-xs text-gray-400 hover:text-blue-600 p-0.5">📅</button>
                        <button onClick={() => completeTask(t.id)}
                          title="Mark complete"
                          className="text-xs text-gray-400 hover:text-green-600 p-0.5">✓</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">Follow-ups Due</div>
            </div>
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {followUps.length === 0 && (
                <div className="p-4 text-xs text-gray-400 text-center">No follow-ups due 🎉</div>
              )}
              {followUps.slice(0, 10).map(f => {
                const overdue = f.follow_up_date < formatDate(today)
                return (
                  <div key={f.id} className="p-2.5 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {f.customers?.account_name || f.subject || 'Follow up'}
                        </div>
                        <div className={`text-xs mt-0.5 ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                          {overdue ? '⚠ ' : ''}{f.follow_up_date}
                        </div>
                      </div>
                      <button onClick={() => addToGoogleCalendar(f, true)}
                        title="Add to Google Calendar"
                        className="text-xs text-gray-400 hover:text-blue-600 p-0.5 flex-shrink-0">📅</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editTask ? 'Edit Task' : 'New Task'}</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="Task title" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Customer (optional)</label>
                <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">None</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.account_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  placeholder="Additional notes…" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex gap-2">
                {editTask && (
                  <button onClick={() => { deleteTask(editTask.id); setShowModal(false) }}
                    className="text-xs text-red-400 hover:text-red-600">Delete</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={saveTask} disabled={saving || !form.title.trim()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                  {saving ? 'Saving…' : editTask ? 'Update' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
