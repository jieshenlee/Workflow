import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import Jobs from './pages/Jobs'
import StartTopicForm from './components/StartTopicForm'
import UploadDocxForm from './components/UploadDocxForm'
import PendingBrainstorms from './components/PendingBrainstorms'
import PendingOutlines from './components/PendingOutlines'
import PendingDrafts from './components/PendingDrafts'
import PendingImages from './components/PendingImages'
import PendingCaptions from './components/PendingCaptions'
import ProcessingJobs from './components/ProcessingJobs'
import ImageLibrary from './pages/ImageLibrary'
import ImageMaker from './pages/ImageMaker'
import ImageGen from './pages/ImageGen'
import ImageChecker from './pages/ImageChecker'
import Inspiration from './pages/Inspiration'
import Guidelines from './pages/Guidelines'
import GuidelineDetail from './pages/GuidelineDetail'
import VideoTemplates from './pages/VideoTemplates'
import { Sidebar } from './components/ui/Sidebar'
import type { NavKey } from './components/ui/Sidebar'
import { PageHeader } from './components/ui/PageHeader'
import { I } from './components/ui/Icon'
import { API_URL } from './lib/api'
import { JobNavProvider } from './components/ui/JobNav'
import JobDetail from './components/JobDetail'
import Login from './components/Login'
import { useSession } from './lib/auth'

function StubPage({ title, breadcrumb, hint }: { title: string; breadcrumb: string[]; hint?: string }) {
  return (
    <>
      <PageHeader title={title} breadcrumb={breadcrumb} />
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-body" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
          <I.image size={28} stroke="var(--text-3)" />
          <div style={{ fontSize: 14, marginTop: 12, color: 'var(--text-2)' }}>{title}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {hint ?? 'Not wired up yet — pipeline screens for this section will appear here once their backend exists.'}
          </div>
        </div>
      </div>
    </>
  )
}

function BlogJobsPage() {
  return (
    <>
      <PageHeader title="Blog Jobs" breadcrumb={['Project Digital', 'Blog Jobs']} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 18 }}>
        <Jobs branchOnly="blog" />
      </div>
    </>
  )
}

function SocialJobsPage() {
  return (
    <>
      <PageHeader title="Social Jobs" breadcrumb={['Project Digital', 'Social Jobs']} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 18 }}>
        <PendingCaptions />
        <Jobs branchOnly="social" />
      </div>
    </>
  )
}

function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        breadcrumb={['Project Digital', 'Dashboard']}
        actions={
          <a
            href={`${API_URL}/docs`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline btn-sm"
          >
            <I.external size={13} /> API
          </a>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 18 }}>
        <StartTopicForm />
        <UploadDocxForm />
        <ProcessingJobs />
        <PendingBrainstorms />
        <PendingOutlines />
        <PendingDrafts />
        <PendingImages />
        <PendingCaptions />
        <Jobs />
      </div>
    </>
  )
}

const PATH_TO_NAV: Record<string, NavKey> = {
  '/': 'dashboard',
  '/blog': 'blog',
  '/social': 'social',
  '/images': 'images',
  '/image-gen': 'image-gen',
  '/image-maker': 'image-maker',
  '/image-checker': 'image-checker',
  '/inspiration': 'inspiration',
  '/guidelines': 'guidelines',
  '/video-templates': 'video-templates',
  '/settings': 'settings',
}
const NAV_TO_PATH: Record<NavKey, string> = {
  dashboard: '/',
  blog: '/blog',
  social: '/social',
  images: '/images',
  'image-gen': '/image-gen',
  'image-maker': '/image-maker',
  'image-checker': '/image-checker',
  inspiration: '/inspiration',
  guidelines: '/guidelines',
  'video-templates': '/video-templates',
  settings: '/settings',
}

function navFromPath(pathname: string): NavKey {
  if (pathname.startsWith('/jobs/')) return 'dashboard'
  if (pathname.startsWith('/guidelines/')) return 'guidelines'
  return PATH_TO_NAV[pathname] ?? 'dashboard'
}

function JobDetailRoute() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  if (!id) return <Navigate to="/" replace />
  const onBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))
  return <JobDetail jobId={id} onBack={onBack} />
}

function GuidelineDetailRoute() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  if (!id) return <Navigate to="/guidelines" replace />
  const onBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/guidelines'))
  return <GuidelineDetail id={id} onBack={onBack} />
}

function SettingsPage() {
  return (
    <StubPage
      title="Settings"
      breadcrumb={['Project Digital', 'Settings']}
      hint="Workspace preferences. Coming later."
    />
  )
}

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const view = navFromPath(location.pathname)

  return (
    <div className="app">
      <Sidebar current={view} onNav={key => navigate(NAV_TO_PATH[key])} />
      <main className="main">
        <div className="content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/blog" element={<BlogJobsPage />} />
            <Route path="/social" element={<SocialJobsPage />} />
            <Route path="/images" element={<ImageLibrary />} />
            <Route path="/image-gen" element={<ImageGen />} />
            <Route path="/image-maker" element={<ImageMaker />} />
            <Route path="/image-checker" element={<ImageChecker />} />
            <Route path="/inspiration" element={<Inspiration />} />
            <Route path="/guidelines" element={<Guidelines />} />
            <Route path="/guidelines/:id" element={<GuidelineDetailRoute />} />
            <Route path="/video-templates" element={<VideoTemplates />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/jobs/:id" element={<JobDetailRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const session = useSession()
  if (!session) return <Login />
  return (
    <JobNavProvider>
      <AppShell />
    </JobNavProvider>
  )
}
