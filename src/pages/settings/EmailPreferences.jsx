// src/pages/settings/EmailPreferences.jsx
// Lets users opt out of weekly rollup / recap emails

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../components/AuthProvider'

const C = {
  cream: '#faf6ed',
  saddle: '#a0573a',
  textDark: '#3a2818',
  textMuted: '#6b5847',
  border: '#e6dcc8',
  cactus: '#5b8c5a',
}

export default function EmailPreferences() {
  const { user, profile } = useAuth()
  const [prefs, setPrefs] = useState({ weekly_rollup: true, weekly_recap: true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select('email_preferences')
        .eq('id', user.id)
        .single()
      if (cancelled) return
      if (error) {
        console.error(error)
      } else if (data?.email_preferences) {
        setPrefs({
          weekly_rollup: data.email_preferences.weekly_rollup !== false,
          weekly_recap: data.email_preferences.weekly_recap !== false,
        })
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [user])

  async function save(next) {
    setSaving(true)
    setPrefs(next)
    const { error } = await supabase
      .from('profiles')
      .update({ email_preferences: next })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      alert('Failed to save: ' + error.message)
    } else {
      setSavedAt(new Date())
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: C.textMuted }}>Loading…</div>
  }

  const isSalesRep = profile?.role === 'sales'
  const isOwner = profile?.role === 'owner'

  return (
    <div style={{ minHeight: '100vh', background: C.cream, padding: '24px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: C.textDark, margin: '0 0 4px' }}>
          Email Preferences
        </h1>
        <p style={{ fontSize: 14, color: C.textMuted, margin: '0 0 24px' }}>
          Choose which Wrangl emails you'd like to receive.
        </p>

        <div style={{
          background: '#fff',
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {isSalesRep && (
            <PreferenceRow
              label="Weekly Rollup"
              description="A summary of your week — invoiced amounts, activity goals, pipeline, and your top customers. Sent every Monday at 8am CDT."
              checked={prefs.weekly_rollup}
              onChange={(v) => save({ ...prefs, weekly_rollup: v })}
              disabled={saving}
            />
          )}

          {isOwner && (
            <PreferenceRow
              label="Weekly Recap"
              description="An executive overview of the week — sales by product line, team activity, top customers, operations summary. Sent every Friday at 3pm CDT."
              checked={prefs.weekly_recap}
              onChange={(v) => save({ ...prefs, weekly_recap: v })}
              disabled={saving}
              isLast
            />
          )}

          {!isSalesRep && !isOwner && (
            <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 14 }}>
              No email preferences available for your role.
            </div>
          )}
        </div>

        {savedAt && (
          <div style={{ marginTop: 14, fontSize: 13, color: C.cactus }}>
            ✓ Saved at {savedAt.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  )
}

function PreferenceRow({ label, description, checked, onChange, disabled, isLast }) {
  return (
    <div style={{
      padding: 20,
      borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: C.textDark, marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
      <label style={{
        display: 'inline-flex',
        alignItems: 'center',
        cursor: disabled ? 'wait' : 'pointer',
        userSelect: 'none',
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          style={{ display: 'none' }}
        />
        <div style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          background: checked ? C.saddle : '#d6c9b3',
          position: 'relative',
          transition: 'background 0.2s',
        }}>
          <div style={{
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>
      </label>
    </div>
  )
}
