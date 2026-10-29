// Main App — sidebar, routing between dashboard and pipeline screens
const { useState: useStateA, useEffect: useEffectA } = React;

const MOCK_JOBS = [
  { id: 'PD-0247', type: 'blog', title: 'AI Workflows for Solo Creators in 2026', topic: 'How AI-assisted pipelines change content economics', stage: 1, status: 'awaiting_draft', created: 'May 24', platforms: [] },
  { id: 'PD-0246', type: 'social', title: 'The 3-Checkpoint Approval Pattern', topic: 'Mini-explainer carousel for IG / LinkedIn', stage: 3, status: 'captions', created: 'May 24', platforms: ['instagram', 'linkedin', 'pinterest', 'threads'] },
  { id: 'PD-0245', type: 'blog', title: 'Why Webhooks Beat Polling for Approval Flows', topic: 'Tech post on n8n architecture', stage: 0, status: 'awaiting_outline', created: 'May 23', platforms: [] },
  { id: 'PD-0244', type: 'social', title: 'My CapCut Reel Workflow', topic: 'Behind-the-scenes Reel', stage: 4, status: 'formatting', created: 'May 23', platforms: ['instagram', 'tiktok', 'youtube'] },
  { id: 'PD-0243', type: 'blog', title: 'Sanity vs Contentful for One-Person Teams', topic: 'CMS comparison post', stage: 3, status: 'image_review', created: 'May 22', platforms: [] },
  { id: 'PD-0242', type: 'social', title: 'Meme: When the n8n graph finally works', topic: 'Workflow humor meme', stage: 5, status: 'ready_post', created: 'May 22', platforms: ['instagram', 'x', 'threads'] },
  { id: 'PD-0241', type: 'blog', title: 'Cost Breakdown: 30 Posts a Month with AI', topic: 'Transparent cost teardown', stage: 5, status: 'published', created: 'May 20', platforms: [] },
  { id: 'PD-0240', type: 'social', title: 'Carousel: Build vs Buy your approval stack', topic: 'Multi-slide explainer', stage: 6, status: 'scheduled', created: 'May 20', platforms: ['instagram', 'linkedin', 'facebook'] },
  { id: 'PD-0239', type: 'blog', title: 'Observability for Solo Content Pipelines', topic: 'Logging + alerting walkthrough', stage: 2, status: 'image_prompt', created: 'May 18', platforms: [] },
];

// Sidebar
const Sidebar = ({ current, onNav, jobs }) => {
  const pending = jobs.filter(j => !['published', 'scheduled'].includes(j.status)).length;
  const blogPending = jobs.filter(j => j.type === 'blog' && !['published', 'scheduled'].includes(j.status)).length;
  const socialPending = jobs.filter(j => j.type === 'social' && !['published', 'scheduled'].includes(j.status)).length;

  const links = [
    { id: 'dashboard', label: 'Dashboard', icon: I.dashboard, count: pending },
    { id: 'blog', label: 'Blog Jobs', icon: I.blog, count: blogPending },
    { id: 'social', label: 'Social Jobs', icon: I.social, count: socialPending },
    { id: 'images', label: 'Image Library', icon: I.image },
    { id: 'settings', label: 'Settings', icon: I.settings },
  ];

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
        {links.map(l => (
          <button
            key={l.id}
            className={`sb-link ${current === l.id ? 'active' : ''}`}
            onClick={() => onNav(l.id)}>
            <l.icon className="ic" size={16} />
            {l.label}
            {l.count != null && l.count > 0 && <span className="count">{l.count}</span>}
          </button>
        ))}

        <div className="sb-section">Recent</div>
        {jobs.slice(0, 3).map(j => (
          <button key={j.id} className="sb-link" onClick={() => onNav('open', j)} style={{ fontSize: 12.5, color: 'var(--sidebar-text-muted)' }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: j.type === 'blog' ? '#818CF8' : '#C084FC', flexShrink: 0 }}></span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</span>
          </button>
        ))}
      </nav>
      <div className="sb-user">
        <div className="sb-avatar">SK</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sb-user-name">Sam Kerrigan</div>
          <div className="sb-user-role">Solo creator</div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ padding: 5, color: 'var(--sidebar-text-muted)' }}>
          <I.settings size={14} />
        </button>
      </div>
    </aside>
  );
};

// Placeholder pages for the other nav items
const SimplePage = ({ title, breadcrumb, children }) => (
  <>
    <PageHeader title={title} breadcrumb={breadcrumb} />
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-body" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
        {children || <div>
          <I.image size={28} stroke="var(--text-3)" />
          <div style={{ fontSize: 14, marginTop: 12, color: 'var(--text-2)' }}>{title} screen</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Not in scope for this design pass — pipeline screens are above.</div>
        </div>}
      </div>
    </div>
  </>
);

// Image library mini page
const ImageLibrary = () => (
  <>
    <PageHeader title="Image Library" breadcrumb={["Project Digital", "Image Library"]}
      actions={<button className="btn btn-primary btn-sm"><I.upload size={14} /> Upload</button>} />
    <div className="stats" style={{ marginTop: 18, gridTemplateColumns: 'repeat(4, 1fr)' }}>
      <div className="stat"><div className="stat-label">Total images</div><div className="stat-val">412</div></div>
      <div className="stat"><div className="stat-label">AI-generated</div><div className="stat-val">301</div></div>
      <div className="stat"><div className="stat-label">Custom uploads</div><div className="stat-val">111</div></div>
      <div className="stat"><div className="stat-label">Storage used</div><div className="stat-val">3.4 GB</div></div>
    </div>
    <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="imgframe ar-4x5" style={{ borderRadius: 8 }}>
          <div className="imgplaceholder" style={{ fontSize: 10 }}>img_{String(i + 1).padStart(3, '0')}</div>
        </div>
      ))}
    </div>
  </>
);

const App = () => {
  const [view, setView] = useStateA({ kind: 'dashboard' });
  const [toast, setToast] = useStateA(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const openJob = (job) => {
    // Route into the flow at the job's current stage
    if (job.type === 'blog') {
      setView({ kind: 'blog', job, stage: job.stage || 0 });
    } else {
      setView({ kind: 'social', job, stage: job.stage || 0, selection: null });
    }
  };

  const handleNav = (id, payload) => {
    if (id === 'open' && payload) return openJob(payload);
    setView({ kind: id });
  };

  // Stage advance helpers
  const advanceBlog = (msg) => {
    setView(v => ({ ...v, stage: v.stage + 1 }));
    showToast(msg);
  };
  const advanceSocial = (msg, extra = {}) => {
    setView(v => ({ ...v, stage: v.stage + 1, ...extra }));
    showToast(msg);
  };

  // Determine sidebar active link
  const sidebarActive = ['blog', 'social'].includes(view.kind?.split('-')[0]) ? view.kind :
    view.kind === 'blog' || view.kind === 'social' ? view.kind :
    ['dashboard', 'images', 'settings'].includes(view.kind) ? view.kind : 'dashboard';

  const sbActive = view.kind === 'blog' ? 'blog' : view.kind === 'social' ? 'social' : view.kind;

  return (
    <div className="app">
      <Sidebar current={sbActive} onNav={handleNav} jobs={MOCK_JOBS} />
      <main className="main">
        <div className="content">
          {view.kind === 'dashboard' && <Dashboard jobs={MOCK_JOBS} onOpen={openJob} />}

          {view.kind === 'blog' && view.stage === 0 && (
            <OutlineReview
              job={view.job}
              onApprove={() => advanceBlog('Outline approved · Claude drafting blog now')}
              onRequestEdits={(note) => showToast(`Sent to Claude for revision · "${note.slice(0, 40)}${note.length > 40 ? '…' : ''}"`)}
            />
          )}
          {view.kind === 'blog' && view.stage === 1 && (
            <DraftReview
              job={view.job}
              onApprove={() => advanceBlog('Blog approved · generating image prompt')}
              onRequestEdits={(note) => showToast(`Claude is reworking the draft…`)}
            />
          )}
          {view.kind === 'blog' && view.stage === 2 && (
            <BlogImagePrompt
              job={view.job}
              onGenerate={() => advanceBlog('Sent to Gemini · image incoming')}
              onRegenerate={() => showToast('Claude regenerated the prompt')}
            />
          )}
          {view.kind === 'blog' && view.stage === 3 && (
            <BlogImageApprove
              job={view.job}
              onApprove={() => advanceBlog('Image approved · moving to publish')}
              onRequestChanges={(note) => { setView(v => ({ ...v, stage: 2 })); showToast('Back to prompt editor'); }}
            />
          )}
          {view.kind === 'blog' && view.stage === 4 && (
            <PublishCMS
              job={view.job}
              onPublish={() => { setView({ kind: 'dashboard' }); showToast('Published to Sanity · Bitly URL created'); }}
              onBack={() => setView(v => ({ ...v, stage: 3 }))}
            />
          )}

          {view.kind === 'social' && view.stage === 0 && (
            <PlatformSelect
              job={view.job}
              onContinue={(sel) => { setView(v => ({ ...v, stage: 1, selection: sel })); showToast('Claude is writing the image prompt…'); }}
            />
          )}
          {view.kind === 'social' && view.stage === 1 && (
            <SocialImagePrompt
              job={view.job}
              selection={view.selection}
              onGenerate={() => advanceSocial('Sent to Gemini · image incoming')}
            />
          )}
          {view.kind === 'social' && view.stage === 2 && (
            <SocialImageApprove
              job={view.job}
              selection={view.selection}
              onApprove={() => advanceSocial('Image approved · Claude writing captions')}
              onRequestChanges={() => { setView(v => ({ ...v, stage: 1 })); showToast('Back to prompt editor'); }}
            />
          )}
          {view.kind === 'social' && view.stage === 3 && (
            <CaptionsEditor
              job={view.job}
              selection={view.selection}
              onApprove={() => advanceSocial('Captions approved · format step next')}
            />
          )}
          {view.kind === 'social' && view.stage === 4 && (
            <ResizeFormat
              job={view.job}
              selection={view.selection}
              onContinue={() => advanceSocial('Final asset ready')}
            />
          )}
          {view.kind === 'social' && view.stage === 5 && (
            <FinalPostReview
              job={view.job}
              selection={view.selection}
              onPost={() => { setView({ kind: 'dashboard' }); showToast('Buffer webhook fired · posting to platforms'); }}
            />
          )}

          {view.kind === 'images' && <ImageLibrary />}
          {view.kind === 'settings' && <SimplePage title="Settings" breadcrumb={["Project Digital", "Settings"]} />}
        </div>
      </main>

      {toast && (
        <div className="toast-wrap">
          <Toast msg={toast} />
        </div>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
