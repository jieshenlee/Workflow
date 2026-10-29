import type { Platform } from '../../lib/types'

export const PLATFORM_META: Record<
  Platform,
  { cls: string; label: string; name: string; limit: number }
> = {
  instagram: { cls: 'pi-ig', label: 'M', name: 'Meta', limit: 2200 },
  facebook:  { cls: 'pi-fb', label: 'FB', name: 'Facebook', limit: 63206 },
  tiktok:    { cls: 'pi-tt', label: 'TT', name: 'TikTok', limit: 2200 },
  youtube:   { cls: 'pi-yt', label: 'YT', name: 'YouTube', limit: 5000 },
  x:         { cls: 'pi-x',  label: 'X',  name: 'X', limit: 280 },
  threads:   { cls: 'pi-th', label: 'TH', name: 'Threads', limit: 500 },
  linkedin:  { cls: 'pi-li', label: 'in', name: 'LinkedIn', limit: 3000 },
  pinterest: { cls: 'pi-pn', label: 'P',  name: 'Pinterest', limit: 500 },
}

export function PlatformIcon({ platform, size = 22 }: { platform: Platform; size?: number }) {
  const meta = PLATFORM_META[platform]
  if (!meta) return null
  return (
    <span
      className={`pi ${meta.cls}`}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      title={meta.name}
    >
      {meta.label}
    </span>
  )
}
