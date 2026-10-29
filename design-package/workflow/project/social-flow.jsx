// Social flow screens 7-12
const { useState: useStateS } = React;

// ---------- Screen 7: Platform & Content Type Selection ----------
const PlatformSelect = ({ job, onContinue }) => {
  const [selected, setSelected] = useStateS(new Set(['instagram', 'pinterest', 'linkedin']));
  const [type, setType] = useStateS('static');
  const [linkedinKind, setLinkedinKind] = useStateS('post');

  const toggle = (p) => {
    const next = new Set(selected);
    next.has(p) ? next.delete(p) : next.add(p);
    setSelected(next);
  };

  const platforms = [
    { id: 'pinterest', sub: 'all generated images' },
    { id: 'instagram', sub: 'will require caption' },
    { id: 'facebook',  sub: 'will require caption' },
    { id: 'tiktok',    sub: 'will require caption' },
    { id: 'youtube',   sub: 'description + tags' },
    { id: 'x',         sub: '280-char caption' },
    { id: 'threads',   sub: 'will require caption' },
    { id: 'linkedin',  sub: 'post or article' },
    { id: 'reddit',    sub: 'if concept is worthy' },
  ];

  const types = [
    { id: 'meme',    label: 'Meme',        ratio: '4:5',  desc: 'Single image, punchline-led' },
    { id: 'static',  label: 'Static Post', ratio: '4:5',  desc: 'Single editorial image' },
    { id: 'carousel',label: 'Carousel',    ratio: '4:5',  desc: 'Up to 10 slides' },
    { id: 'reel',    label: 'Reel',        ratio: '9:16', desc: 'Short video' },
  ];

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Social Jobs", "Platforms & Type"]}
        meta={<>
          <span className="pill pill-purple"><span className="pill-dot" /> Social</span>
          <StatusPill status="platform_select" />
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={SOCIAL_STAGES} current={0} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card">
          <div className="card-h">
            <span className="card-h-title">Platforms <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· {selected.size} selected</span></span>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
          <div className="card-body">
            <div className="platform-grid">
              {platforms.map(p => {
                const meta = PLATFORMS[p.id];
                const sel = selected.has(p.id);
                return (
                  <div key={p.id} className={`platform-card ${sel ? 'sel' : ''}`} onClick={() => toggle(p.id)}>
                    <div className="platform-check">{sel && <I.check size={12} sw={3} stroke="white" />}</div>
                    <PlatformIcon p={p.id} size={28} />
                    <div className="platform-name">{meta.name}</div>
                    <div className="platform-meta">{p.sub}</div>
                    {p.id === 'linkedin' && sel && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                        {[['post', 'Standard Post'], ['article', 'Article']].map(([k, label]) => (
                          <button key={k}
                            className={`btn btn-${linkedinKind === k ? 'primary' : 'outline'} btn-sm`}
                            style={{ flex: 1, justifyContent: 'center', padding: '5px 8px', fontSize: 11.5 }}
                            onClick={() => setLinkedinKind(k)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="card-h-title">Content Type</span></div>
          <div className="card-body">
            <div className="type-grid">
              {types.map(t => (
                <button key={t.id} className={`type-card ${type === t.id ? 'sel' : ''}`} onClick={() => setType(t.id)}>
                  <span className="ratio-badge">{t.ratio}</span>
                  <div className="imgframe" style={{ marginTop: 4, marginBottom: 12, height: 80, aspectRatio: t.ratio.replace(':', '/'), maxWidth: t.ratio === '9:16' ? 50 : 64 }}>
                    <div className="imgplaceholder" style={{ fontSize: 10 }}>{t.ratio}</div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ActionBar
        note={`${selected.size} platforms · ${types.find(t => t.id === type)?.label}`}
        right={<button className="btn btn-primary" disabled={selected.size === 0} onClick={() => onContinue({ platforms: [...selected], type, linkedinKind })}>
          Continue to Image Prompt <I.arrowRight size={14} sw={2} />
        </button>}
      />
    </>
  );
};

// ---------- Screen 8: Social Image Prompt ----------
const SocialImagePrompt = ({ job, selection, onGenerate }) => {
  const [prompt, setPrompt] = useStateS(
    "A bold, scroll-stopping flat illustration: three stacked browser windows shown isometrically, each representing a workflow stage (DRAFT → REVIEW → PUBLISH). Color palette: deep indigo, cream, soft terracotta accent. Clean editorial style, no faces, no text inside the image. Composition centered for a 4:5 frame with breathing room at the top for caption overlay."
  );
  const [model, setModel] = useStateS('gemini');

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Social Jobs", "Image Prompt"]}
        meta={<>
          <StatusPill status="social_prompt" />
          <AIBadge label="Claude wrote this prompt" />
          <span className="chip">
            {selection?.type === 'reel' ? 'Reel · 9:16' : `${selection?.type || 'Static'} · 4:5`}
          </span>
          <span style={{ display: 'flex', gap: 3 }}>
            {(selection?.platforms || []).map(p => <PlatformIcon key={p} p={p} size={18} />)}
          </span>
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={SOCIAL_STAGES} current={1} />
      </div>

      <div className="split">
        <div className="card">
          <div className="card-h">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="card-h-title">Image Prompt</span>
              <AIBadge />
            </div>
            <button className="btn btn-ghost btn-sm"><I.refresh size={13} /> Regenerate Prompt</button>
          </div>
          <div className="card-body ai-block">
            <textarea
              className="textarea"
              rows={8}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              style={{ fontSize: 14, lineHeight: 1.6 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
              <span>{prompt.length} characters</span>
              <span>·</span>
              <span>Optimized for: {(selection?.platforms || []).slice(0, 3).join(', ')}{selection?.platforms?.length > 3 ? `, +${selection.platforms.length - 3}` : ''}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="card-h-title">Generation</span></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="label">Model</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[['gemini', 'Gemini Imagen 3'], ['dalle', 'DALL·E 3']].map(([k, name]) => (
                  <label key={k} className="platform-card" style={{ padding: 10, cursor: 'pointer', borderColor: model === k ? 'var(--primary)' : 'var(--border)', background: model === k ? 'var(--primary-50)' : 'white' }} onClick={() => setModel(k)}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                      <div className="platform-check" style={{ position: 'static', borderRadius: 99, width: 16, height: 16, background: model === k ? 'var(--primary)' : 'white', borderColor: model === k ? 'var(--primary)' : 'var(--border-strong)' }}>
                        {model === k && <span style={{ width: 6, height: 6, borderRadius: 99, background: 'white' }} />}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="label">Output</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>Aspect: <span className="kbd">{selection?.type === 'reel' ? '9:16' : '4:5'}</span></div>
                <div>Variations: <span className="kbd">4</span></div>
                <div>Resolution: <span className="kbd">2048px long edge</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ActionBar
        left={<button className="btn btn-outline"><I.arrowLeft size={14} /> Back</button>}
        right={<button className="btn btn-primary" onClick={onGenerate}><I.sparkle size={14} /> Generate Image</button>}
      />
    </>
  );
};

// ---------- Screen 9: Social Image Approval ----------
const SocialImageApprove = ({ job, selection, onApprove, onRequestChanges }) => {
  const [showRequest, setShowRequest] = useStateS(false);
  const [editNote, setEditNote] = useStateS('');
  const isReel = selection?.type === 'reel';
  const aspect = isReel ? 'ar-9x16' : 'ar-4x5';

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Social Jobs", "Image Review"]}
        meta={<>
          <StatusPill status="social_image" />
          <AIBadge label="Generated · Gemini Imagen 3" />
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={SOCIAL_STAGES} current={2} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div className="card">
          <div className="card-h">
            <span className="card-h-title">Image · {isReel ? 'Reel' : (selection?.type || 'Static')}</span>
            <span className="chip" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{isReel ? '9:16 · 1080×1920' : '4:5 · 1080×1350'}</span>
          </div>
          <div className="card-body" style={{ padding: 20, display: 'flex', justifyContent: 'center', background: '#FAFBFC' }}>
            <div className={`imgframe ${aspect}`} style={{ maxHeight: 540, width: isReel ? 304 : 432 }}>
              <div className="imgplaceholder">
                <div style={{ textAlign: 'center', lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-2)' }}>[ social_v2.png ]</div>
                  <div style={{ fontSize: 11 }}>{isReel ? '1080 × 1920' : '1080 × 1350'}</div>
                  <div style={{ marginTop: 6, fontSize: 10 }}>isometric · indigo + terracotta</div>
                </div>
              </div>
              <div className="ratio-tag">{isReel ? '9:16' : '4:5'}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-h"><span className="card-h-title">Will be sent to</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(selection?.platforms || ['instagram', 'pinterest', 'linkedin']).map(p => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <PlatformIcon p={p} size={20} />
                  <span style={{ fontSize: 13 }}>{PLATFORMS[p].name}</span>
                  <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{isReel ? '9:16' : '4:5'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ background: 'var(--amber-50)', borderColor: 'var(--amber-100)' }}>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <I.zap size={16} stroke="var(--amber)" />
                <div style={{ fontSize: 12.5, color: 'var(--amber)', lineHeight: 1.5 }}>
                  After approval, this image will go to <strong>Canva</strong> (static resize + 9:16 reformat) or <strong>CapCut</strong> (video edits) for final formatting.
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><span className="card-h-title">Variations</span></div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[1, 2, 3, 4].map(n => (
                <div key={n} className={`imgframe ${aspect}`} style={{ border: n === 2 ? '2px solid var(--primary)' : '1px solid var(--border)' }}>
                  <div className="imgplaceholder" style={{ fontSize: 10 }}>v{n}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showRequest && (
        <div className="card" style={{ marginTop: 16, borderColor: 'var(--amber-100)', background: 'var(--amber-50)' }}>
          <div className="card-body">
            <div className="label" style={{ color: 'var(--amber)' }}>What should change?</div>
            <textarea className="textarea" rows={2} value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="e.g. Tighter crop, brighter background, drop the third browser window." />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowRequest(false)}>Cancel</button>
              <button className="btn btn-amber btn-sm" onClick={() => { setShowRequest(false); onRequestChanges(editNote); setEditNote(''); }}>Send back to prompt</button>
            </div>
          </div>
        </div>
      )}

      <ActionBar
        left={<>
          <button className="btn btn-amber" onClick={() => setShowRequest(true)}>Request Changes</button>
          <button className="btn btn-outline"><I.refresh size={14} /> Regenerate</button>
          <button className="btn btn-outline"><I.upload size={14} /> Upload Custom</button>
        </>}
        right={<button className="btn btn-green" onClick={onApprove}>Approve Image <I.arrowRight size={14} sw={2} /></button>}
      />
    </>
  );
};

// ---------- Screen 10: Caption & Hashtag Editor ----------
const CAPTIONS_BY_PLATFORM = {
  instagram: { text: "Three years ago, content meant a team of five. Today, a solo creator with the right pipeline can ship the same work — sometimes more.\n\nThe trick isn't the AI. It's the approval flow underneath: three checkpoints where you actually slow down and look. Outline, draft, image. That's it.\n\nLink in bio for the full piece →", tags: ['solocreator', 'aiworkflow', 'contentcreation', 'indiemaker', 'productivity'] },
  facebook:  { text: "I've been running a one-person content channel for 18 months with Claude + n8n doing most of the production work. Here's what stays human (and why): outline, draft, image. Three checkpoints, no more.", tags: ['contentmarketing', 'aitools', 'workflow', 'solopreneur'] },
  tiktok:    { text: "POV: you replaced your 5-person content team with 3 approval checkpoints and an n8n graph 🎯", tags: ['aitools', 'creatortips', 'workflow', 'tech', 'solocreator'] },
  linkedin:  { text: "Eighteen months ago I rebuilt our content operation around a single principle: production is cheap, judgement isn't.\n\nThe team-of-five model existed because four hard steps — research, drafting, design, distribution — each needed different specialised skill. Models now compress three of those four into one prompt and a review.\n\nWhat remains human is taste, narrative judgement, and brand voice. Those benefit from concentration in one person, not distribution across five.\n\nFull breakdown of the stack (Claude + n8n + Sanity + Buffer) on the blog:", tags: ['contentstrategy', 'aitools', 'automation', 'futureofwork'] },
  pinterest: { text: "AI Content Workflow for Solo Creators — the 3-checkpoint approval pipeline", tags: ['aiworkflow', 'contentcreator', 'productivity', 'aitools'] },
  x:         { text: "Three years ago: 5-person content team.\n\nToday: 3 approval checkpoints and an n8n graph.\n\nThe AI isn't the trick. The flow underneath is.", tags: ['ai', 'workflow'] },
  threads:   { text: "Three checkpoints. Outline, draft, image. Anything more and you're rubber-stamping. Anything less and you're shipping things you don't actually endorse.", tags: ['ai', 'workflow', 'solocreator'] },
  reddit:    { text: "I rebuilt my content workflow around 3 human approval checkpoints and an n8n graph — 18-month retrospective + the full stack (Claude + n8n + Sanity + Buffer)", tags: [] },
};

const CaptionsEditor = ({ job, selection, onApprove }) => {
  const plats = selection?.platforms || ['instagram', 'pinterest', 'linkedin'];
  const [active, setActive] = useStateS(plats[0]);
  const [captions, setCaptions] = useStateS(() => {
    const obj = {};
    plats.forEach(p => { obj[p] = CAPTIONS_BY_PLATFORM[p] || { text: '', tags: [] }; });
    return obj;
  });
  const [newTag, setNewTag] = useStateS('');

  const current = captions[active];
  const meta = PLATFORMS[active];
  const pct = (current?.text?.length || 0) / meta.limit;
  const fillCls = pct > 1 ? 'over' : pct > 0.85 ? 'warn' : '';

  const updateText = (txt) => setCaptions({ ...captions, [active]: { ...current, text: txt } });
  const removeTag = (t) => setCaptions({ ...captions, [active]: { ...current, tags: current.tags.filter(x => x !== t) } });
  const addTag = () => {
    if (!newTag.trim()) return;
    setCaptions({ ...captions, [active]: { ...current, tags: [...current.tags, newTag.replace(/^#/, '')] } });
    setNewTag('');
  };

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Social Jobs", "Captions & Hashtags"]}
        meta={<>
          <StatusPill status="captions" />
          <AIBadge label="Claude wrote captions" />
          <span className="muted" style={{ fontSize: 12 }}>· {plats.length} platforms</span>
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={SOCIAL_STAGES} current={3} />
      </div>

      <div className="card">
        <div className="ptabs">
          {plats.map(p => {
            const m = PLATFORMS[p];
            const c = captions[p];
            const over = c.text.length > m.limit;
            return (
              <button key={p} className={`ptab ${active === p ? 'active' : ''}`} onClick={() => setActive(p)}>
                <PlatformIcon p={p} size={18} />
                {m.name}
                {over && <span className="pill pill-red" style={{ fontSize: 10, padding: '1px 6px' }}>!</span>}
              </button>
            );
          })}
        </div>

        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, padding: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="label" style={{ margin: 0 }}>Caption</div>
              <button className="btn btn-ghost btn-sm"><I.refresh size={12} /> Regenerate for {meta.name}</button>
            </div>
            <div className="ai-block">
              <textarea
                className="textarea"
                rows={10}
                value={current.text}
                onChange={e => updateText(e.target.value)}
                style={{ fontSize: 14, lineHeight: 1.6 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <div className="pbar" style={{ flex: 1 }}>
                <div className={`pbar-fill ${fillCls}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
              </div>
              <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: pct > 1 ? 'var(--red)' : 'var(--text-2)', minWidth: 90, textAlign: 'right' }}>
                {current.text.length.toLocaleString()} / {meta.limit.toLocaleString()}
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <div className="label">Hashtags</div>
              <div className="hashtags">
                {current.tags.map(t => (
                  <span key={t} className="hashtag">
                    #{t}
                    <span className="x" onClick={() => removeTag(t)}><I.x size={9} sw={2.5} /></span>
                  </span>
                ))}
                <input
                  className="input"
                  style={{ width: 140, padding: '4px 10px', fontSize: 12 }}
                  placeholder="Add hashtag…"
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="label">Preview</div>
            <div style={{ background: '#FAFBFC', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <PlatformIcon p={active} size={28} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>@projectdigital</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>on {meta.name}</div>
                </div>
              </div>
              <div className={`imgframe ${selection?.type === 'reel' ? 'ar-9x16' : 'ar-4x5'}`} style={{ maxWidth: selection?.type === 'reel' ? 130 : 200, margin: '0 auto 12px' }}>
                <div className="imgplaceholder" style={{ fontSize: 10 }}>{selection?.type === 'reel' ? '9:16' : '4:5'}</div>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                {current.text.slice(0, 180)}{current.text.length > 180 && '…'}
              </div>
              {current.tags.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--primary)', marginTop: 8 }}>
                  {current.tags.map(t => `#${t}`).join(' ')}
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, padding: 12, background: 'var(--ai-50)', border: '1px solid var(--ai-100)', borderRadius: 8, fontSize: 11.5, color: 'var(--ai)' }}>
              <strong>{meta.name} limit:</strong> {meta.limit.toLocaleString()} chars
              {meta.name === 'X' && <div style={{ marginTop: 4 }}>Long-form unlocks at Premium.</div>}
            </div>
          </div>
        </div>
      </div>

      <ActionBar
        left={<button className="btn btn-outline">Save & Come Back</button>}
        right={<button className="btn btn-green" onClick={onApprove}>Approve All Captions <I.arrowRight size={14} sw={2} /></button>}
      />
    </>
  );
};

// ---------- Screen 11: Resize & Format ----------
const ResizeFormat = ({ job, selection, onContinue }) => {
  const [checks, setChecks] = useStateS({ resize: false, music: false, capcut: false });
  const [uploaded, setUploaded] = useStateS(false);
  const isReel = selection?.type === 'reel';

  const items = [
    { id: 'resize', label: 'Resize image in Canva to correct aspect ratio', tool: 'Canva', required: true },
    { id: 'music', label: 'Add music to track', tool: 'Canva / CapCut', required: isReel },
    { id: 'capcut', label: 'Edit video in CapCut', tool: 'CapCut', required: isReel },
  ].filter(i => i.required);

  const allDone = items.every(i => checks[i.id]) && uploaded;

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Social Jobs", "Resize & Format"]}
        meta={<>
          <StatusPill status="formatting" />
          <span className="chip"><I.zap size={11} /> Manual step</span>
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={SOCIAL_STAGES} current={4} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-h"><span className="card-h-title">Format checklist</span></div>
          <div className="card-body">
            {items.map(it => (
              <div key={it.id} className={`check-row ${checks[it.id] ? 'done' : ''}`}
                onClick={() => setChecks({ ...checks, [it.id]: !checks[it.id] })}>
                <div className={`checkbox ${checks[it.id] ? 'done' : ''}`}>
                  {checks[it.id] && <I.check size={12} sw={3} stroke="white" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="check-label">{it.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>In {it.tool}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={(e) => e.stopPropagation()}>
                  Open {it.tool.split(' ')[0]} <I.arrowRight size={12} sw={2} />
                </button>
              </div>
            ))}

            <div style={{ marginTop: 20, padding: 18, border: `2px dashed var(--border-strong)`, borderRadius: 10, textAlign: 'center', background: uploaded ? 'var(--green-50)' : 'transparent', borderColor: uploaded ? 'var(--green-100)' : 'var(--border-strong)' }}>
              {uploaded ? (
                <>
                  <I.check size={24} stroke="var(--green)" sw={2.4} />
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 8, color: 'var(--green)' }}>final_reel_9x16.mp4</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>12.4 MB · 1080×1920 · 0:18</div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setUploaded(false)}>Replace</button>
                </>
              ) : (
                <>
                  <I.upload size={22} stroke="var(--text-3)" />
                  <div style={{ fontWeight: 500, fontSize: 13.5, marginTop: 8 }}>Upload final formatted asset</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>MP4 / MOV / PNG · max 500 MB</div>
                  <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={() => setUploaded(true)}>Choose file</button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="card-h-title">Preview</span></div>
          <div className="card-body" style={{ display: 'flex', justifyContent: 'center', background: '#FAFBFC', padding: 24 }}>
            <div className={`imgframe ${isReel ? 'ar-9x16' : 'ar-4x5'}`} style={{ maxHeight: 460, width: isReel ? 256 : 360 }}>
              {uploaded ? (
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #4338CA 0%, #7C3AED 100%)', display: 'grid', placeItems: 'center', color: 'white', textAlign: 'center', padding: 20 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>AI Workflows for Solo Creators</div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>Project Digital</div>
                  </div>
                </div>
              ) : (
                <div className="imgplaceholder">
                  <div style={{ textAlign: 'center', fontSize: 11 }}>
                    awaiting upload<br /><span style={{ color: 'var(--text-3)' }}>{isReel ? '1080×1920' : '1080×1350'}</span>
                  </div>
                </div>
              )}
              <div className="ratio-tag">{isReel ? '9:16' : '4:5'}</div>
            </div>
          </div>
        </div>
      </div>

      <ActionBar
        note={allDone ? 'All formatting complete' : `${Object.values(checks).filter(Boolean).length}/${items.length} steps · upload ${uploaded ? '✓' : 'pending'}`}
        right={<button className="btn btn-primary" disabled={!allDone} onClick={onContinue}>Ready to Post <I.arrowRight size={14} sw={2} /></button>}
      />
    </>
  );
};

// ---------- Screen 12: Final Post Review ----------
const FinalPostReview = ({ job, selection, onPost }) => {
  const [schedule, setSchedule] = useStateS('now');
  const [expanded, setExpanded] = useStateS(null);
  const [posted, setPosted] = useStateS(false);
  const plats = selection?.platforms || ['instagram', 'pinterest', 'linkedin'];

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Social Jobs", "Final Review"]}
        meta={<>
          <StatusPill status={posted ? 'scheduled' : 'ready_post'} />
          <span className="muted" style={{ fontSize: 12 }}>· Buffer via n8n</span>
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={SOCIAL_STAGES} current={5} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div className="card">
          <div className="card-h"><span className="card-h-title">Summary</span></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <div className={`imgframe ${selection?.type === 'reel' ? 'ar-9x16' : 'ar-4x5'}`} style={{ width: selection?.type === 'reel' ? 90 : 130, flexShrink: 0 }}>
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #4338CA 0%, #7C3AED 100%)', display: 'grid', placeItems: 'center', color: 'white', fontSize: 10, textAlign: 'center', padding: 8 }}>
                  AI Workflows for Solo Creators
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="label">Topic</div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{job.title}</div>
                <div className="label">Bitly URL</div>
                <div className="bitly" style={{ padding: 8 }}>
                  <I.link size={12} />
                  <span className="bitly-url" style={{ fontSize: 12 }}>bit.ly/3xPDigital26</span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: 3 }}><I.copy size={11} /></button>
                </div>
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 8 }}>Captions per platform</div>
              {plats.map(p => {
                const cap = CAPTIONS_BY_PLATFORM[p];
                const open = expanded === p;
                return (
                  <div key={p} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
                    <button onClick={() => setExpanded(open ? null : p)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'white' }}>
                      <PlatformIcon p={p} size={20} />
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{PLATFORMS[p].name}</span>
                      <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{cap.text.length} chars · {cap.tags.length} tags</span>
                      <span style={{ color: 'var(--text-3)', transform: open ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.18s' }}>
                        <I.arrowRight size={13} />
                      </span>
                    </button>
                    {open && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: '#FAFBFC', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>
                        {cap.text}
                        {cap.tags.length > 0 && (
                          <div style={{ color: 'var(--primary)', marginTop: 6 }}>{cap.tags.map(t => `#${t}`).join(' ')}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-h"><span className="card-h-title">Schedule</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['now', 'Post Now'], ['later', 'Schedule']].map(([k, label]) => (
                  <button key={k}
                    className={`btn btn-${schedule === k ? 'primary' : 'outline'} btn-sm`}
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => setSchedule(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {schedule === 'later' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <div className="label">Date & time</div>
                    <input className="input" type="text" defaultValue="May 28, 2026 — 9:00 AM" />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Buffer will queue across {plats.length} platforms at this time.</div>
                </div>
              )}
              {schedule === 'now' && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', padding: '8px 0' }}>
                  Will post immediately to {plats.length} platforms via Buffer.
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="card-h-title">Destinations</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {plats.map(p => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <PlatformIcon p={p} size={20} />
                  <span style={{ fontSize: 13 }}>{PLATFORMS[p].name}</span>
                  <span className="pill pill-green" style={{ marginLeft: 'auto', fontSize: 10 }}><I.check size={10} sw={3} /> Ready</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ background: '#FAFBFC' }}>
            <div className="card-body" style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: 'var(--text-3)', wordBreak: 'break-all', marginBottom: 4 }}>
                POST n8n.projectdigital.com/webhook/buffer-post
              </div>
              Will trigger Buffer publish across all selected platforms, then update job status to Posted.
            </div>
          </div>
        </div>
      </div>

      <ActionBar
        left={<button className="btn btn-outline"><I.arrowLeft size={14} /> Back</button>}
        right={
          <button className="btn btn-green" disabled={posted} onClick={() => { setPosted(true); setTimeout(onPost, 900); }}>
            {posted
              ? <><I.check size={14} sw={2.4} /> {schedule === 'now' ? 'Posted' : 'Scheduled'}</>
              : <>{schedule === 'now' ? 'Post to All Platforms' : 'Schedule Post'} <I.arrowRight size={14} sw={2} /></>}
          </button>
        }
      />
    </>
  );
};

Object.assign(window, {
  PlatformSelect, SocialImagePrompt, SocialImageApprove,
  CaptionsEditor, ResizeFormat, FinalPostReview,
});
