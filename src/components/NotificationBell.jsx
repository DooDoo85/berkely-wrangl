// src/components/NotificationBell.jsx
// Bell icon for the header. Shows unread count badge, opens dropdown with
// recent notifications. Subscribes to realtime so new notifications appear
// without refresh.
//
// Usage: drop <NotificationBell /> into your Layout header next to the user menu.

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

const C = {
  brown: '#261810',
  saddle: '#a0573a',
  sunrise: '#ee5e3a',
  cactus: '#5b8c5a',
  cream: '#faf6ed',
  textDark: '#3a2818',
  textMuted: '#6b5847',
  border: '#e6dcc8',
  hover: '#f5ede0',
}

const RECENT_LIMIT = 15

export default function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)

  const unreadCount = items.filter(n => !n.read_at).length

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT)

      if (cancelled) return
      if (error) {
        console.error('NotificationBell load error:', error)
      } else {
        setItems(data || [])
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [user])

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setItems(prev => [payload.new, ...prev].slice(0, RECENT_LIMIT))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setItems(prev => prev.map(n => n.id === payload.new.id ? payload.new : n))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // ── Mark single notification as read + navigate ───────────────────────────
  async function handleClick(notification) {
    if (!notification.read_at) {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notification.id)
      // Optimistic update — realtime will sync but this avoids the flash
      setItems(prev => prev.map(n =>
        n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n
      ))
    }
    setOpen(false)
    if (notification.link_to) {
      navigate(notification.link_to)
    }
  }

  // ── Mark all as read ──────────────────────────────────────────────────────
  async function markAllRead() {
    const unreadIds = items.filter(n => !n.read_at).map(n => n.id)
    if (unreadIds.length === 0) return

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .in('id', unreadIds)

    if (!error) {
      setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
    }
  }

  if (!user) return null

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 8,
          borderRadius: 8,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <div style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 18,
            height: 18,
            background: C.sunrise,
            color: '#fff',
            borderRadius: 9,
            fontSize: 10,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
            border: '2px solid #fff',
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 380,
            maxHeight: 480,
            background: '#fff',
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(38,24,16,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textDark }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#fff',
                  background: C.sunrise,
                  padding: '2px 8px',
                  borderRadius: 10,
                }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: C.saddle,
                  fontWeight: 500,
                  padding: 4,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>🔔</div>
                <div style={{ fontSize: 13, color: C.textMuted }}>
                  No notifications yet
                </div>
              </div>
            ) : (
              items.map(n => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onClick={() => handleClick(n)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Notification row ───────────────────────────────────────────────────────
function NotificationRow({ notification, onClick }) {
  const isUnread = !notification.read_at
  const accentColor = colorForType(notification.type)
  const icon = iconForType(notification.type)

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '12px 16px',
        border: 'none',
        background: isUnread ? '#fdfaf3' : '#fff',
        borderBottom: `1px solid ${C.border}`,
        cursor: 'pointer',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = C.hover}
      onMouseLeave={(e) => e.currentTarget.style.background = isUnread ? '#fdfaf3' : '#fff'}
    >
      {/* Unread dot + icon */}
      <div style={{ position: 'relative', flexShrink: 0, marginTop: 2 }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: accentColor + '22',
          color: accentColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}>
          {icon}
        </div>
        {isUnread && (
          <div style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: C.sunrise,
            border: '2px solid #fff',
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: isUnread ? 600 : 500,
          color: C.textDark,
          marginBottom: 2,
          lineHeight: 1.4,
        }}>
          {notification.title}
        </div>
        {notification.body && (
          <div style={{
            fontSize: 12,
            color: C.textMuted,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            marginBottom: 4,
          }}>
            {notification.body}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.textMuted }}>
          {timeAgo(notification.created_at)}
        </div>
      </div>
    </button>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function colorForType(type) {
  switch (type) {
    case 'reorder_queue_add': return C.saddle
    case 'cycle_count_variance': return C.sunrise
    case 'container_arrived': return C.cactus
    case 'order_stuck': return C.sunrise
    default: return C.saddle
  }
}

function iconForType(type) {
  switch (type) {
    case 'reorder_queue_add': return '🛒'
    case 'cycle_count_variance': return '⚖'
    case 'container_arrived': return '📦'
    case 'order_stuck': return '⚠'
    default: return '🔔'
  }
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fff' }}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}
