import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { API_URL, pgGet } from '../../lib/api'
import type { ContentJob } from '../../lib/types'
import { I } from './Icon'
import { useJobNav } from './JobNav'

export type NavKey = 'dashboard' | 'blog' | 'social' | 'images' | 'image-gen' | 'image-maker' | 'image-checker' | 'inspiration' | 'guidelines' | 'video-templates' | 'settings'

interface Props {
  current: NavKey
  onNav: (key: NavKey) => void
}

const PENDING_STATUSES = new Set(['brainstorm', 'research', 'outline', 'drafting', 'image', 'cms'])

export function Sidebar({ current, onNav }: Props) {
  const { openJob } = useJobNav()
  const [recentOpen, setRecentOpen] = useState(() => localStorage.getItem('sb-recent-open') !== '0')
  const toggleRecent = () => {
    setRecentOpen(v => {
      localStorage.setItem('sb-recent-open', v ? '0' : '1')
      return !v
    })
  }
  const { data: jobs = [] } = useQuery<ContentJob[]>({
    queryKey: ['jobs'],
    queryFn: () => pgGet<ContentJob[]>('/content_jobs?order=updated_at.desc&limit=50'),
  })

  const pending = jobs.filter(j => PENDING_STATUSES.has(j.status)).length
  const blogPending = jobs.filter(j => j.branch === 'blog' && PENDING_STATUSES.has(j.status)).length
  const socialPending = jobs.filter(j => j.branch === 'social' && PENDING_STATUSES.has(j.status)).length

  const links: Array<{ id: NavKey; label: string; icon: (typeof I)[keyof typeof I]; count?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: I.dashboard, count: pending },
    { id: 'blog', label: 'Blog Jobs', icon: I.blog, count: blogPending },
    { id: 'social', label: 'Social Jobs', icon: I.social, count: socialPending },
    { id: 'images', label: 'Image Library', icon: I.image },
    { id: 'image-gen', label: 'Image Gen', icon: I.sparkle },
    { id: 'image-maker', label: 'Image Maker', icon: I.wand },
    { id: 'image-checker', label: 'Image Checker', icon: I.search },
    { id: 'inspiration', label: 'Inspiration', icon: I.lightbulb },
    { id: 'guidelines', label: 'Guidelines', icon: I.fileText },
    { id: 'video-templates', label: 'Video Templates', icon: I.workflow },
    { id: 'settings', label: 'Settings', icon: I.settings },
  ]

  const recent = jobs.slice(0, 8)

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-brand-mark">PD</div>
        <div>
          <div className="sb-brand-text">Project Digital</div>
          <div className="sb-brand-sub">Content workspace</div>
        </div>
      </div>

      <nav className="sb-nav">
        <div className="sb-section">Workspace</div>
        {links.map(l => {
          const Icon = l.icon
          return (
            <button
              key={l.id}
              className={`sb-link ${current === l.id ? 'active' : ''}`}
              onClick={() => onNav(l.id)}
            >
              <Icon className="ic" size={16} />
              {l.label}
              {l.count != null && l.count > 0 && <span className="count">{l.count}</span>}
            </button>
          )
        })}

        {recent.length > 0 && (
          <>
            <button className="sb-section sb-section-toggle" onClick={toggleRecent}>
              Recent
              <span className="count" style={{ marginLeft: 6 }}>{recent.length}</span>
              <I.chevronDown
                size={13}
                className="sb-section-chevron"
                style={{ transform: recentOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
              />
            </button>
            {recentOpen &&
              recent.map(j => (
                <button
                  key={j.id}
                  className="sb-link"
                  onClick={() => openJob(j.id)}
                  style={{ fontSize: 12.5, color: 'var(--sidebar-text-muted)' }}
                  title={j.topic}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 99,
                      background: j.branch === 'blog' ? '#818CF8' : '#C084FC',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {j.topic}
                  </span>
                </button>
              ))}
          </>
        )}
      </nav>

      <div className="sb-user">
        <div className="sb-avatar">JS</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sb-user-name">Jieshen</div>
          <div className="sb-user-role">Solo creator</div>
        </div>
        <a
          href={`${API_URL}/docs`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost btn-sm"
          style={{ padding: 5, color: 'var(--sidebar-text-muted)' }}
          title="Open API docs"
        >
          <I.external size={14} />
        </a>
      </div>
    </aside>
  )
}
