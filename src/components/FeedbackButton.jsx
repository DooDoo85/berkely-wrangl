import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

const CATEGORIES = [
  { value: 'bug',             label: '🐛 Bug',              desc: 'Something is broken or not working right' },
  { value: 'data_issue',      label: '📊 Data Issue',       desc: 'Numbers look wrong or data is missing' },
  { value: 'feature_request', label: '✨ Feature Request',  desc: 'A suggestion for a new feature' },
  { value: 'question',        label: '❓ Question',          desc: 'How does something work?' },
  { value: 'other',           label: '💬 Other',             desc: 'Anything else' },
]

export default function FeedbackButton() {
  const { profile } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('bug')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('normal')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function close() {
    setOpen(false)
    // reset after animation
    setTimeout(() => {
      setCategory('bug')
      setSubject('')
      setMessage('')
      setPriority('normal')
      setSubmitted(false)
    }, 200)
  }

  async function handleSubmit() {
    if (!message.trim() || !subject.trim()) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('feedback_tickets').insert({
        user_id:    profile?.id || null,
        user_email: profile?.email || null,
        user_name:  profile?.full_name || profile?.email || null,
        category,
        subject:    subject.trim(),
        message:    message.trim(),
        page_url:   location.pathname,
        priority,
      })
      if (error) throw error
      setSubmitted(true)
      setTimeout(close, 1800)
    } catch (e) {
      alert('Failed to send: ' + e.message)
    }
    setSubmitting(false)
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-[#5a3a24] hover:bg-[#6e4a30] text-[#f5e6d0] rounded-full shadow-lg px-4 py-3 flex items-center gap-2 transition-all hover:scale-105"
        title="Send feedback"
      >
        <span className="text-base">💬</span>
        <span className="text-sm font-semibold">Feedback</span>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={close}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6"
            onClick={e => e.stopPropagation()}
          >
            {submitted ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">✅</div>
                <p className="text-lg font-bold text-stone-800 mb-1">Got it — thanks!</p>
                <p className="text-sm text-stone-500">Your feedback was sent. I'll take a look.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-display font-bold text-stone-800">Send Feedback</h3>
                    <p className="text-xs text-stone-400 mt-0.5">Bug, idea, or question — let me know</p>
                  </div>
                  <button onClick={close} className="text-stone-400 hover:text-stone-600 text-xl leading-none">✕</button>
                </div>

                {/* Category */}
                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setCategory(c.value)}
                        className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                          category === c.value
                            ? 'bg-[#5a3a24] text-[#f5e6d0] border-[#5a3a24]'
                            : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        <div className="font-semibold">{c.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject */}
                <div className="mb-3">
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Short title (e.g. 'Team orders count seems off')"
                    className="input w-full text-sm"
                    autoFocus
                  />
                </div>

                {/* Message */}
                <div className="mb-3">
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Details</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="What happened? What did you expect to see? Screenshots help if you have them."
                    rows={5}
                    className="input w-full text-sm resize-none"
                  />
                </div>

                {/* Priority */}
                <div className="mb-5">
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Priority</label>
                  <div className="flex gap-2">
                    {[
                      { v: 'low',    label: 'Low'    },
                      { v: 'normal', label: 'Normal' },
                      { v: 'high',   label: 'High'   },
                      { v: 'urgent', label: 'Urgent' },
                    ].map(p => (
                      <button
                        key={p.v}
                        onClick={() => setPriority(p.v)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                          priority === p.v
                            ? 'bg-[#5a3a24] text-[#f5e6d0] border-[#5a3a24]'
                            : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Page URL hint */}
                <p className="text-[10px] text-stone-400 mb-4">
                  📍 We'll include the page you're on: <span className="font-mono">{location.pathname}</span>
                </p>

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={close}
                    className="flex-1 py-2 px-4 rounded-xl border border-stone-200 text-sm text-stone-500 hover:bg-stone-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !subject.trim() || !message.trim()}
                    className="flex-1 py-2 px-4 rounded-xl bg-[#5a3a24] text-[#f5e6d0] text-sm font-semibold hover:bg-[#6e4a30] disabled:opacity-40 transition-colors"
                  >
                    {submitting ? 'Sending...' : 'Send Feedback'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
