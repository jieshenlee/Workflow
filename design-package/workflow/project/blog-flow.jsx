// Blog flow screens 2-6
const { useState: useStateB } = React;

// ---------- Screen 2: Outline Review ----------
const OutlineReview = ({ job, onApprove, onRequestEdits }) => {
  const [outline, setOutline] = useStateB([
    { level: 'h1', text: 'How AI Workflows Are Reshaping Solo Content Creation in 2026' },
    { level: 'h2', text: 'The shift: From content factories to one-person publishers' },
    { level: 'h3', text: 'Why the old "team-of-five" model is no longer required' },
    { level: 'h3', text: 'Real numbers — output per creator before vs after AI tooling' },
    { level: 'h2', text: 'Building your approval pipeline' },
    { level: 'h3', text: 'The three checkpoints every workflow needs' },
    { level: 'h3', text: 'When to trust the model, when to step in' },
    { level: 'h2', text: 'A reference stack: Claude + n8n + Sanity + Buffer' },
    { level: 'h3', text: 'Why webhooks beat polling for approval steps' },
    { level: 'h3', text: 'Cost breakdown for a 30-post month' },
    { level: 'h2', text: 'What to watch out for' },
    { level: 'h2', text: 'The next 12 months' },
  ]);

  const [showRequest, setShowRequest] = useStateB(false);
  const [editNote, setEditNote] = useStateB('');

  const removeItem = (idx) => setOutline(outline.filter((_, i) => i !== idx));

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Blog Jobs", "Outline Review"]}
        meta={<>
          <span className="pill pill-slate"><span className="pill-dot" /> Blog</span>
          <StatusPill status="awaiting_outline" />
          <AIBadge label="Claude-generated" />
          <span className="muted" style={{ fontSize: 12 }}>· Job #{job.id}</span>
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={BLOG_STAGES} current={0} />
      </div>

      <div className="split">
        <div className="card">
          <div className="card-h">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="card-h-title">Outline</span>
              <AIBadge />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-ghost btn-sm"><I.refresh size={13} /> Regenerate</button>
              <button className="btn btn-ghost btn-sm"><I.plus size={13} /> Add section</button>
            </div>
          </div>
          <div className="card-body ai-block">
            {outline.map((it, i) => (
              <div key={i} className={`outline-item ${it.level}`}>
                <span className="grip"><I.drag size={14} /></span>
                <span className="num">{it.level.toUpperCase()}</span>
                <span className="text" contentEditable suppressContentEditableWarning>{it.text}</span>
                <button className="btn btn-ghost btn-sm" style={{ padding: 4, opacity: 0.5 }} onClick={() => removeItem(i)}>
                  <I.trash size={13} />
                </button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, marginLeft: 38 }}>
              <I.plus size={13} /> Add bullet
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-h"><span className="card-h-title">Context</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div className="label">Topic</div>
                <div style={{ fontSize: 13.5 }}>{job.topic}</div>
              </div>
              <div>
                <div className="label">Keywords</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {['AI workflows', 'solo creator', 'content pipeline', 'n8n', 'Claude API', 'approval automation'].map(k => (
                    <span key={k} className="chip">{k}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="label">Target Audience</div>
                <div style={{ fontSize: 13 }}>Solo content creators / indie marketers building AI-assisted publishing pipelines. Mid-funnel; familiar with no-code tools.</div>
              </div>
              <div>
                <div className="label">Target length</div>
                <div style={{ fontSize: 13 }}>1,400 – 1,800 words</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="card-h-title">Pipeline</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['Outline → Draft', 'Draft → Image prompt', 'Image → Sanity CMS', 'CMS → Bitly URL'].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
                  <span className="step-dot pending" style={{ width: 18, height: 18, fontSize: 10 }}>{i + 1}</span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showRequest && (
        <div className="card" style={{ marginTop: 16, borderColor: 'var(--amber-100)', background: 'var(--amber-50)' }}>
          <div className="card-body">
            <div className="label" style={{ color: 'var(--amber)' }}>Tell Claude what to change</div>
            <textarea
              className="textarea"
              rows={3}
              value={editNote}
              onChange={e => setEditNote(e.target.value)}
              placeholder="e.g. Cut the cost section; add a section on observability/logging."
            />
          </div>
        </div>
      )}

      <ActionBar
        note="Approve or send back for AI revision"
        left={
          showRequest
            ? <>
                <button className="btn btn-outline btn-sm" onClick={() => setShowRequest(false)}>Cancel</button>
                <button className="btn btn-amber btn-sm" onClick={() => { setShowRequest(false); onRequestEdits(editNote); setEditNote(''); }}>
                  <I.sparkle size={13} /> Send to Claude
                </button>
              </>
            : <button className="btn btn-amber" onClick={() => setShowRequest(true)}>Request Edits</button>
        }
        right={
          <button className="btn btn-green" onClick={onApprove}>
            Approve Outline <I.arrowRight size={14} sw={2} />
          </button>
        }
      />
    </>
  );
};

// ---------- Screen 3: Draft Review ----------
const DraftReview = ({ job, onApprove, onRequestEdits }) => {
  const [showRequest, setShowRequest] = useStateB(false);
  const [editNote, setEditNote] = useStateB('');
  const [seoOpen, setSeoOpen] = useStateB(true);

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Blog Jobs", "Draft Review"]}
        meta={<>
          <StatusPill status="awaiting_draft" />
          <AIBadge label="Claude-generated draft" />
          <span className="muted" style={{ fontSize: 12 }}>· 1,632 words · 7 min read</span>
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={BLOG_STAGES} current={1} />
      </div>

      <div className="split" style={{ gridTemplateColumns: seoOpen ? '1fr 340px' : '1fr' }}>
        <div className="editor-wrap ai-block">
          <div className="editor">
            <h1 contentEditable suppressContentEditableWarning>How AI Workflows Are Reshaping Solo Content Creation in 2026</h1>
            <p contentEditable suppressContentEditableWarning>
              Three years ago, running a content channel meant assembling a team — a writer, an editor, a designer, a community manager. In 2026, that math has changed. A single creator with the right pipeline can ship the work of a five-person team, and the bottleneck has shifted from <em>production</em> to <em>judgement</em>.
            </p>
            <p contentEditable suppressContentEditableWarning>
              This piece walks through the workflow I've been running for the last eighteen months: every post — blog or social — flows through Claude for drafting, Gemini for imagery, and an n8n approval queue that surfaces the work to me at three specific checkpoints. Below is what those checkpoints are, why I picked them, and the n8n graph that ties it together.
            </p>
            <h2 contentEditable suppressContentEditableWarning>The shift: From content factories to one-person publishers</h2>
            <p contentEditable suppressContentEditableWarning>
              The "team-of-five" model existed because the four hardest steps — research, drafting, design, distribution — each required different specialized skill. Models compress three of those four into one prompt and a review.
            </p>
            <h3 contentEditable suppressContentEditableWarning>Why the old model is no longer required</h3>
            <p contentEditable suppressContentEditableWarning>
              The work that <em>remains</em> human is taste, narrative judgement, and brand voice — and those benefit from concentration in one person, not distribution across five.
            </p>
            <h2 contentEditable suppressContentEditableWarning>Building your approval pipeline</h2>
            <p contentEditable suppressContentEditableWarning>
              Three checkpoints, no more: outline, draft, image. Any more and you're rubber-stamping; any fewer and you're shipping things you don't actually endorse.
            </p>
            <p style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>… 6 more sections, 1,200 more words …</p>
          </div>
          <div className="editor-foot">
            <span><strong>1,632</strong> words</span>
            <span>·</span>
            <span><strong>7 min</strong> read</span>
            <span>·</span>
            <span>Flesch reading ease: <strong>62</strong></span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="step-dot done" style={{ width: 14, height: 14 }}><I.check size={9} sw={3} /></span>
              Autosaved 12s ago
            </span>
          </div>
        </div>

        {seoOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card">
              <div className="card-h">
                <span className="card-h-title">SEO Preview</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setSeoOpen(false)}><I.x size={13} /></button>
              </div>
              <div className="card-body">
                <div className="seo-preview">
                  <div className="seo-url">projectdigital.com › blog › ai-solo-workflows</div>
                  <div className="seo-title">AI Workflows for Solo Creators in 2026 — Project Digital</div>
                  <div className="seo-desc">A walkthrough of the three-checkpoint approval pipeline I use to ship blog + social as a one-person team. Claude for drafting, n8n for routing.</div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <div className="label">Meta title <span style={{ color: 'var(--text-3)', textTransform: 'none' }}>· 58 / 60</span></div>
                  <input className="input" defaultValue="AI Workflows for Solo Creators in 2026 — Project Digital" />
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="label">Meta description <span style={{ color: 'var(--text-3)', textTransform: 'none' }}>· 152 / 160</span></div>
                  <textarea className="textarea" rows={3} defaultValue="A walkthrough of the three-checkpoint approval pipeline I use to ship blog + social as a one-person team. Claude for drafting, n8n for routing." />
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="label">Slug</div>
                  <div className="slug-row">
                    <span className="prefix">/blog/</span>
                    <input className="input" defaultValue="ai-solo-workflows-2026" />
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-h"><span className="card-h-title">Quick stats</span></div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><div className="muted" style={{ fontSize: 11 }}>Words</div><div style={{ fontWeight: 600, fontSize: 18 }}>1,632</div></div>
                <div><div className="muted" style={{ fontSize: 11 }}>Read time</div><div style={{ fontWeight: 600, fontSize: 18 }}>7m</div></div>
                <div><div className="muted" style={{ fontSize: 11 }}>Headings</div><div style={{ fontWeight: 600, fontSize: 18 }}>11</div></div>
                <div><div className="muted" style={{ fontSize: 11 }}>Links</div><div style={{ fontWeight: 600, fontSize: 18 }}>6</div></div>
              </div>
            </div>
          </div>
        )}
        {!seoOpen && (
          <button className="btn btn-outline btn-sm" style={{ position: 'fixed', right: 32, top: 100 }} onClick={() => setSeoOpen(true)}>
            <I.eye size={13} /> Show SEO
          </button>
        )}
      </div>

      {showRequest && (
        <div className="card" style={{ marginTop: 16, borderColor: 'var(--amber-100)', background: 'var(--amber-50)' }}>
          <div className="card-body">
            <div className="label" style={{ color: 'var(--amber)' }}><I.sparkle size={11} /> Describe the changes you want Claude to make</div>
            <textarea
              className="textarea"
              rows={3}
              value={editNote}
              onChange={e => setEditNote(e.target.value)}
              placeholder="e.g. Make the intro punchier, cut the cost paragraph, and add a personal anecdote about a workflow failure."
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowRequest(false)}>Cancel</button>
              <button className="btn btn-amber btn-sm" onClick={() => { setShowRequest(false); onRequestEdits(editNote); setEditNote(''); }}>
                <I.sparkle size={13} /> Send to Claude
              </button>
            </div>
          </div>
        </div>
      )}

      <ActionBar
        left={<button className="btn btn-amber" onClick={() => setShowRequest(true)}><I.sparkle size={14} /> Request AI Edits</button>}
        right={<button className="btn btn-green" onClick={onApprove}>Approve Blog <I.arrowRight size={14} sw={2} /></button>}
      />
    </>
  );
};

// ---------- Screen 4: Image Prompt Review (Blog) ----------
const BlogImagePrompt = ({ job, onGenerate, onRegenerate }) => {
  const [prompt, setPrompt] = useStateB(
    "An overhead flat-lay of a wooden desk in soft morning light. On the desk: an open laptop showing a minimalist dashboard interface in indigo and white, a small ceramic coffee cup, a leather-bound notebook open to a hand-drawn flow diagram, and a few neatly arranged office plants in muted terracotta pots. Editorial photography style, shallow depth of field, slight grain. 16:9 aspect."
  );
  const [model, setModel] = useStateB('gemini');

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Blog Jobs", "Image Prompt"]}
        meta={<>
          <StatusPill status="image_prompt" />
          <AIBadge label="Claude wrote this prompt" />
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={BLOG_STAGES} current={2} />
      </div>

      <div className="split">
        <div className="card">
          <div className="card-h">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="card-h-title">Image Prompt</span>
              <AIBadge />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onRegenerate}>
              <I.refresh size={13} /> Regenerate Prompt
            </button>
          </div>
          <div className="card-body ai-block">
            <textarea
              className="textarea"
              rows={9}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              style={{ fontSize: 14, lineHeight: 1.6 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
              <span>{prompt.length} characters</span>
              <span>·</span>
              <span>~{prompt.split(/\s+/).length} tokens</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-h"><span className="card-h-title">Generation</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div className="label">Model</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    ['gemini', 'Gemini Imagen 3', '~$0.04 / image'],
                    ['dalle', 'DALL·E 3', '~$0.08 / image'],
                    ['chatgpt', 'ChatGPT (GPT-Image-1)', '~$0.04 / image'],
                  ].map(([k, name, cost]) => (
                    <label key={k} className="platform-card" style={{ padding: 10, cursor: 'pointer', borderColor: model === k ? 'var(--primary)' : 'var(--border)', background: model === k ? 'var(--primary-50)' : 'white' }} onClick={() => setModel(k)}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{cost}</div>
                        </div>
                        <div className="platform-check" style={{ position: 'static', borderRadius: 99, width: 16, height: 16, background: model === k ? 'var(--primary)' : 'white', borderColor: model === k ? 'var(--primary)' : 'var(--border-strong)' }}>
                          {model === k && <span style={{ width: 6, height: 6, borderRadius: 99, background: 'white' }} />}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="label">Aspect</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['16:9', '4:5', '1:1'].map(a => (
                    <button key={a} className={`btn btn-${a === '16:9' ? 'primary' : 'outline'} btn-sm`} style={{ fontFamily: 'JetBrains Mono, monospace', flex: 1, justifyContent: 'center' }}>{a}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ActionBar
        left={<button className="btn btn-outline"><I.arrowLeft size={14} /> Back to Draft</button>}
        right={<button className="btn btn-primary" onClick={onGenerate}><I.sparkle size={14} /> Generate Image</button>}
      />
    </>
  );
};

// ---------- Screen 5: Image Approval (Blog) ----------
const BlogImageApprove = ({ job, onApprove, onRequestChanges }) => {
  const [showRequest, setShowRequest] = useStateB(false);
  const [editNote, setEditNote] = useStateB('');

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Blog Jobs", "Image Review"]}
        meta={<>
          <StatusPill status="image_review" />
          <AIBadge label="Generated with Gemini Imagen 3" />
          <span className="muted" style={{ fontSize: 12 }}>· Attempt 2 of 5</span>
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={BLOG_STAGES} current={3} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div className="card">
          <div className="card-h">
            <span className="card-h-title">Hero Image</span>
            <span className="chip" style={{ fontFamily: 'JetBrains Mono, monospace' }}>16:9 · 1920×1080</span>
          </div>
          <div className="card-body" style={{ padding: 20 }}>
            <div className="imgframe ar-16x9">
              <div className="imgplaceholder">
                <div style={{ textAlign: 'center', lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-2)' }}>[ generated_hero.png ]</div>
                  <div>1920 × 1080 · gemini-imagen-3</div>
                  <div style={{ marginTop: 8, fontSize: 11 }}>flat-lay desk · indigo dashboard · soft morning light</div>
                </div>
              </div>
              <div className="ratio-tag">16:9</div>
            </div>
            <div style={{ marginTop: 14, padding: 12, background: '#FAFBFC', borderRadius: 8, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
              <div style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)', marginBottom: 4 }}>Prompt used</div>
              An overhead flat-lay of a wooden desk in soft morning light. On the desk: an open laptop showing a minimalist dashboard interface in indigo and white, a small ceramic coffee cup, a leather-bound notebook open to a hand-drawn flow diagram…
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-h"><span className="card-h-title">Variations</span></div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="imgframe ar-16x9" style={{ border: n === 2 ? '2px solid var(--primary)' : '1px solid var(--border)' }}>
                  <div className="imgplaceholder" style={{ fontSize: 10 }}>v{n}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-h"><span className="card-h-title">Quick actions</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-outline btn-sm" style={{ justifyContent: 'flex-start' }}><I.refresh size={13} /> Regenerate with same prompt</button>
              <button className="btn btn-outline btn-sm" style={{ justifyContent: 'flex-start' }}><I.upload size={13} /> Upload custom image</button>
              <button className="btn btn-outline btn-sm" style={{ justifyContent: 'flex-start' }}><I.arrowLeft size={13} /> Edit prompt</button>
            </div>
          </div>
        </div>
      </div>

      {showRequest && (
        <div className="card" style={{ marginTop: 16, borderColor: 'var(--amber-100)', background: 'var(--amber-50)' }}>
          <div className="card-body">
            <div className="label" style={{ color: 'var(--amber)' }}>What should change about the image?</div>
            <textarea className="textarea" rows={2} value={editNote} onChange={e => setEditNote(e.target.value)}
              placeholder="e.g. Less cluttered desk, swap coffee for tea, more muted greens." />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowRequest(false)}>Cancel</button>
              <button className="btn btn-amber btn-sm" onClick={() => { setShowRequest(false); onRequestChanges(editNote); setEditNote(''); }}>Send back to prompt editor</button>
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

// ---------- Screen 6: Publish to CMS ----------
const PublishCMS = ({ job, onPublish, onBack }) => {
  const [published, setPublished] = useStateB(false);

  return (
    <>
      <PageHeader
        title={job.title}
        breadcrumb={["Project Digital", "Blog Jobs", "Publish"]}
        meta={<>
          <StatusPill status={published ? 'published' : 'ready_publish'} />
          <span className="muted" style={{ fontSize: 12 }}>· Sanity workspace: <span className="kbd">project-digital</span></span>
        </>}
      />

      <div style={{ marginBottom: 20 }}>
        <StageProgress steps={BLOG_STAGES} current={4} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div className="card">
          <div className="card-h"><span className="card-h-title">Preview</span><span className="chip"><I.eye size={11} /> as published</span></div>
          <div style={{ padding: 0 }}>
            <div className="imgframe ar-16x9" style={{ borderRadius: 0, borderBottom: '1px solid var(--border)' }}>
              <div className="imgplaceholder">[ hero image ]</div>
            </div>
            <div style={{ padding: '32px 48px 48px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12, color: 'var(--text-3)' }}>
                <span>Workflows</span><span>·</span><span>May 26, 2026</span><span>·</span><span>7 min read</span>
              </div>
              <h1 style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>How AI Workflows Are Reshaping Solo Content Creation in 2026</h1>
              <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.7, color: '#1F2937' }}>
                Three years ago, running a content channel meant assembling a team — a writer, an editor, a designer, a community manager. In 2026, that math has changed.
              </p>
              <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.7, color: '#1F2937' }}>
                This piece walks through the workflow I've been running for the last eighteen months: every post — blog or social — flows through Claude for drafting, Gemini for imagery…
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-h"><span className="card-h-title">Metadata</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div className="label">Slug</div>
                <div className="slug-row">
                  <span className="prefix">/blog/</span>
                  <input className="input" defaultValue="ai-solo-workflows-2026" />
                </div>
              </div>
              <div>
                <div className="label">Category</div>
                <select className="select"><option>Workflows</option><option>Tooling</option><option>Strategy</option></select>
              </div>
              <div>
                <div className="label">Tags</div>
                <div className="hashtags">
                  {['ai', 'workflows', 'creators', 'n8n', 'claude'].map(t => (
                    <span key={t} className="hashtag">#{t}<span className="x"><I.x size={9} /></span></span>
                  ))}
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }}>+ tag</button>
                </div>
              </div>
              <div>
                <div className="label">Publish date</div>
                <input className="input" type="text" defaultValue="May 26, 2026 — 10:30 AM" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <span className="card-h-title">Bitly Short URL</span>
              {published && <span className="pill pill-green"><I.check size={11} sw={3} /> Live</span>}
            </div>
            <div className="card-body">
              {published ? (
                <div className="bitly">
                  <I.link size={14} />
                  <span className="bitly-url">bit.ly/3xPDigital26</span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: 5 }}><I.copy size={13} /></button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', padding: '12px 0' }}>
                  Bitly URL will appear here after publishing
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-h"><span className="card-h-title">Webhook</span></div>
            <div className="card-body" style={{ fontSize: 12, color: 'var(--text-2)' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all' }}>
                POST https://n8n.projectdigital.com/webhook/sanity-publish
              </div>
              <div style={{ marginTop: 6 }}>Will trigger: Sanity publish → Bitly URL → notify Slack</div>
            </div>
          </div>
        </div>
      </div>

      <ActionBar
        left={<>
          <button className="btn btn-outline" onClick={onBack}><I.arrowLeft size={14} /> Back</button>
          <button className="btn btn-outline">Save as Draft</button>
        </>}
        right={
          <button className="btn btn-green" onClick={() => { setPublished(true); setTimeout(onPublish, 900); }} disabled={published}>
            {published ? <><I.check size={14} sw={2.4} /> Published</> : <>Publish to Sanity <I.arrowRight size={14} sw={2} /></>}
          </button>
        }
      />
    </>
  );
};

Object.assign(window, {
  OutlineReview, DraftReview, BlogImagePrompt, BlogImageApprove, PublishCMS,
});
