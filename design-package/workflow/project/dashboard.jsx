// Screen 1 — Dashboard / Pipeline Overview
const { useState: useStateD } = React;

const STAGE_FOR_TYPE = (job) => {
  if (job.type === 'blog') {
    const map = {
      0: 'awaiting_outline',
      1: 'awaiting_draft',
      2: 'image_prompt',
      3: 'image_review',
      4: 'ready_publish',
      5: 'published',
    };
    return map[job.stage] || job.status;
  }
  if (job.type === 'social') {
    const map = {
      0: 'platform_select',
      1: 'social_prompt',
      2: 'social_image',
      3: 'captions',
      4: 'formatting',
      5: 'ready_post',
      6: 'scheduled',
    };
    return map[job.stage] || job.status;
  }
  return job.status;
};

const Dashboard = ({ jobs, onOpen }) => {
  const [filter, setFilter] = useStateD('all');

  const filtered = jobs.filter(j => {
    if (filter === 'all') return true;
    if (filter === 'blog') return j.type === 'blog';
    if (filter === 'social') return j.type === 'social';
    if (filter === 'pending') return !['published', 'scheduled'].includes(j.status);
    if (filter === 'published') return ['published', 'scheduled'].includes(j.status);
    return true;
  });

  const stats = [
    { label: 'Total Jobs', val: jobs.length, delta: '+3 this week', icon: I.dashboard },
    { label: 'Awaiting Approval', val: jobs.filter(j => !['published', 'scheduled'].includes(j.status)).length, delta: '4 need your review', icon: I.clock },
    { label: 'Published Today', val: 2, delta: '↑ 1 vs yesterday', icon: I.check },
    { label: 'Scheduled', val: jobs.filter(j => j.status === 'scheduled').length, delta: 'Next: in 2h', icon: I.calendar },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        breadcrumb={["Project Digital", "Dashboard"]}
        actions={
          <>
            <button className="btn btn-ghost btn-sm">
              <I.bell size={15} />
            </button>
            <button className="btn btn-primary btn-sm">
              <I.plus size={14} sw={2.2} /> New Content Idea
            </button>
          </>
        }
      />

      <div className="stats" style={{ marginTop: 18 }}>
        {stats.map((s, i) => (
          <div className="stat" key={i}>
            <div className="stat-label"><s.icon size={13} /> {s.label}</div>
            <div className="stat-val">{s.val}</div>
            <div className="stat-delta">{s.delta}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '28px 0 14px' }}>
        <div className="tabs">
          {[
            ['all', 'All', jobs.length],
            ['blog', 'Blog', jobs.filter(j => j.type === 'blog').length],
            ['social', 'Social', jobs.filter(j => j.type === 'social').length],
            ['pending', 'Pending', jobs.filter(j => !['published', 'scheduled'].includes(j.status)).length],
            ['published', 'Published', jobs.filter(j => ['published', 'scheduled'].includes(j.status)).length],
          ].map(([k, label, n]) => (
            <button key={k} className={`tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
              {label} <span style={{ color: 'var(--text-3)', marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}><I.search size={14} /></span>
            <input className="input" placeholder="Search jobs…" style={{ width: 240, paddingLeft: 32 }} />
          </div>
          <button className="btn btn-outline btn-sm"><I.filter size={14} /> Filters</button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="jt">
          <thead>
            <tr>
              <th>Job</th>
              <th>Type</th>
              <th>Current Stage</th>
              <th>Platforms</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(job => (
              <tr key={job.id}>
                <td>
                  <div className="job-title">{job.title}</div>
                  <div className="job-sub">{job.topic}</div>
                </td>
                <td>
                  <span className={`pill pill-${job.type === 'blog' ? 'slate' : 'purple'}`}>
                    {job.type === 'blog' ? 'Blog' : 'Social'}
                  </span>
                </td>
                <td><StatusPill status={STAGE_FOR_TYPE(job)} /></td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(job.platforms || []).slice(0, 5).map(p => <PlatformIcon key={p} p={p} size={20} />)}
                    {(job.platforms || []).length > 5 && <span className="chip">+{job.platforms.length - 5}</span>}
                    {(!job.platforms || job.platforms.length === 0) && <span className="muted" style={{ fontSize: 12 }}>—</span>}
                  </div>
                </td>
                <td><span className="muted" style={{ fontSize: 12.5 }}>{job.created}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => onOpen(job)}>
                    Review <I.arrowRight size={13} sw={2} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

window.Dashboard = Dashboard;
window.STAGE_FOR_TYPE = STAGE_FOR_TYPE;
