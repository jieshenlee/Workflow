import type { ReactNode } from 'react'

interface Props {
  title: string
  breadcrumb?: string[]
  actions?: ReactNode
  meta?: ReactNode
}

export function PageHeader({ title, breadcrumb, actions, meta }: Props) {
  return (
    <div className="ph">
      <div>
        {breadcrumb && (
          <div className="breadcrumb">
            {breadcrumb.map((b, i) => (
              <span key={i}>
                {i > 0 && <span className="sep">/&nbsp;</span>}
                <span className={i === breadcrumb.length - 1 ? 'cur' : undefined}>{b}</span>
              </span>
            ))}
          </div>
        )}
        <h1 className="page-title">{title}</h1>
        {meta && <div className="ph-meta">{meta}</div>}
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </div>
  )
}
