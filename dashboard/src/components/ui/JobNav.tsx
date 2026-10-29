import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface JobNavValue {
  openJobId: string | null
  openJob: (id: string) => void
  closeJob: () => void
}

const JobNavContext = createContext<JobNavValue | null>(null)

export function useJobNav(): JobNavValue {
  const ctx = useContext(JobNavContext)
  if (!ctx) throw new Error('useJobNav must be used within a JobNavProvider')
  return ctx
}

const JOB_PATH = /^\/jobs\/([^/]+)\/?$/

export function JobNavProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()

  const openJobId = useMemo(() => {
    const m = location.pathname.match(JOB_PATH)
    return m ? decodeURIComponent(m[1]) : null
  }, [location.pathname])

  const openJob = useCallback(
    (id: string) => {
      navigate(`/jobs/${encodeURIComponent(id)}`)
      window.scrollTo({ top: 0 })
    },
    [navigate],
  )

  const closeJob = useCallback(() => {
    // Going back is most natural (preserves where the user came from); fall back
    // to / if there's no history entry to return to.
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }, [navigate])

  return (
    <JobNavContext.Provider value={{ openJobId, openJob, closeJob }}>
      {children}
    </JobNavContext.Provider>
  )
}
