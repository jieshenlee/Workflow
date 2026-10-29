// Shared atoms and icons for Project Digital
const { useState, useEffect, useRef, useMemo } = React;

// -------- Icons (inline SVG, stroke-based) --------
const Icon = ({ d, size = 16, fill = "none", stroke = "currentColor", sw = 1.75, viewBox = "0 0 24 24", children }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);

const I = {
  dashboard: (p) => <Icon {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></Icon>,
  blog: (p) => <Icon {...p}><path d="M4 4h13a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z"/><path d="M8 8h7"/><path d="M8 12h7"/><path d="M8 16h4"/></Icon>,
  social: (p) => <Icon {...p}><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.6 10.5l6.8-3"/><path d="M8.6 13.5l6.8 3"/></Icon>,
  image: (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5L5 20"/></Icon>,
  settings: (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></Icon>,
  search: (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  plus: (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  arrowRight: (p) => <Icon {...p}><path d="M5 12h14M13 5l7 7-7 7"/></Icon>,
  arrowLeft: (p) => <Icon {...p}><path d="M19 12H5M11 19l-7-7 7-7"/></Icon>,
  check: (p) => <Icon {...p}><path d="m5 12 5 5L20 7"/></Icon>,
  x: (p) => <Icon {...p}><path d="M6 6l12 12M6 18 18 6"/></Icon>,
  refresh: (p) => <Icon {...p}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></Icon>,
  sparkle: (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></Icon>,
  copy: (p) => <Icon {...p}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></Icon>,
  upload: (p) => <Icon {...p}><path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></Icon>,
  bell: (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></Icon>,
  clock: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  calendar: (p) => <Icon {...p}><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></Icon>,
  link: (p) => <Icon {...p}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></Icon>,
  filter: (p) => <Icon {...p}><path d="M3 5h18l-7 8v7l-4-2v-5z"/></Icon>,
  drag: (p) => <Icon {...p}><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></Icon>,
  trash: (p) => <Icon {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></Icon>,
  eye: (p) => <Icon {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></Icon>,
  zap: (p) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></Icon>,
};

// -------- AI Badge --------
const AIBadge = ({ label = "AI Generated" }) => (
  <span className="ai-badge"><I.sparkle size={11} /> {label}</span>
);

// -------- Status pill --------
const StatusPill = ({ status }) => {
  const map = {
    'awaiting_outline': { c: 'amber', label: 'Awaiting Outline Approval' },
    'awaiting_draft':   { c: 'amber', label: 'Awaiting Blog Draft' },
    'image_prompt':     { c: 'purple', label: 'Image Prompt Review' },
    'image_review':     { c: 'amber', label: 'Image Review' },
    'ready_publish':    { c: 'blue', label: 'Ready to Publish' },
    'published':        { c: 'blue', label: 'Published' },
    'scheduled':        { c: 'teal', label: 'Scheduled' },
    'platform_select':  { c: 'amber', label: 'Choose Platforms' },
    'social_prompt':    { c: 'purple', label: 'Social Image Prompt' },
    'social_image':     { c: 'amber', label: 'Social Image Review' },
    'captions':         { c: 'amber', label: 'Captions & Hashtags' },
    'formatting':       { c: 'amber', label: 'Resize & Format' },
    'ready_post':       { c: 'blue', label: 'Ready to Post' },
    'rejected':         { c: 'red', label: 'Needs Edits' },
    'approved':         { c: 'green', label: 'Approved' },
  };
  const m = map[status] || { c: 'slate', label: status };
  return (
    <span className={`pill pill-${m.c}`}>
      <span className="pill-dot" />
      {m.label}
    </span>
  );
};

// -------- Platform icon --------
const PLATFORMS = {
  instagram: { cls: 'pi-ig', label: 'IG', name: 'Instagram', limit: 2200 },
  facebook:  { cls: 'pi-fb', label: 'FB', name: 'Facebook',  limit: 63206 },
  tiktok:    { cls: 'pi-tt', label: 'TT', name: 'TikTok',    limit: 2200 },
  youtube:   { cls: 'pi-yt', label: 'YT', name: 'YouTube',   limit: 5000 },
  x:         { cls: 'pi-x',  label: 'X',  name: 'X',         limit: 280 },
  threads:   { cls: 'pi-th', label: 'TH', name: 'Threads',   limit: 500 },
  linkedin:  { cls: 'pi-li', label: 'in', name: 'LinkedIn',  limit: 3000 },
  pinterest: { cls: 'pi-pn', label: 'P',  name: 'Pinterest', limit: 500 },
  reddit:    { cls: 'pi-rd', label: 'R',  name: 'Reddit',    limit: 40000 },
};
const PlatformIcon = ({ p, size = 22 }) => {
  const meta = PLATFORMS[p];
  if (!meta) return null;
  return (
    <span className={`pi ${meta.cls}`} style={{ width: size, height: size, fontSize: size * 0.45 }} title={meta.name}>
      {meta.label}
    </span>
  );
};

// -------- Stage Stepper --------
const StageProgress = ({ steps, current }) => (
  <div className="stepper">
    {steps.map((s, i) => {
      const state = i < current ? 'done' : i === current ? 'cur' : 'pending';
      return (
        <React.Fragment key={i}>
          <div className="step">
            <div className={`step-dot ${state}`}>
              {state === 'done' ? <I.check size={12} sw={3} /> : i + 1}
            </div>
            <div className={`step-label ${state}`}>{s}</div>
          </div>
          {i < steps.length - 1 && <div className={`step-line ${i < current ? 'done' : ''}`} />}
        </React.Fragment>
      );
    })}
  </div>
);

// -------- Action Bar --------
const ActionBar = ({ left, right, note }) => (
  <div className="actionbar">
    <div className="actionbar-left">
      {note && <span className="actionbar-note">{note}</span>}
      {left}
    </div>
    <div className="actionbar-right">{right}</div>
  </div>
);

// -------- Toast --------
const Toast = ({ msg, kind = 'success' }) => (
  <div className={`toast ${kind}`}>
    <span className="check"><I.check size={11} sw={3} stroke="white" /></span>
    <span>{msg}</span>
  </div>
);

// -------- Page header --------
const PageHeader = ({ title, breadcrumb, meta, actions }) => (
  <div className="ph">
    <div>
      {breadcrumb && (
        <div className="breadcrumb">
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="sep">/</span>}
              <span className={i === breadcrumb.length - 1 ? 'cur' : ''}>{b}</span>
            </React.Fragment>
          ))}
        </div>
      )}
      <h1 className="page-title">{title}</h1>
      {meta && <div className="ph-meta">{meta}</div>}
    </div>
    {actions && <div className="topbar-actions">{actions}</div>}
  </div>
);

// -------- Pipeline definitions --------
const BLOG_STAGES = ["Outline", "Draft", "Image Prompt", "Image Review", "Publish"];
const SOCIAL_STAGES = ["Platforms", "Image Prompt", "Image Review", "Captions", "Format", "Post"];

// Export to window
Object.assign(window, {
  I, AIBadge, StatusPill, PlatformIcon, PLATFORMS,
  StageProgress, ActionBar, Toast, PageHeader,
  BLOG_STAGES, SOCIAL_STAGES,
});
