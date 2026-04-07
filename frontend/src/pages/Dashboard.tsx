import { useEffect, useState } from 'react'
import api from '../lib/api'

interface KPIData {
  courses_uploaded: number
  jobs_scanned: number
  keywords_found: number
  avg_coverage_score: number | null
  departments_covered: number
}

interface TrendingKeyword {
  text: string
  category: string
  frequency: number
  is_emerging: boolean
}

interface DeptStat {
  domain: string
  count: number
}

const DEPT_COLORS: Record<string, string> = {
  'Computer Science':                    'bg-blue-100 text-blue-700',
  'Systems Engineering':                 'bg-indigo-100 text-indigo-700',
  'Electrical & Computer Engineering':   'bg-violet-100 text-violet-700',
  'Bioengineering':                      'bg-green-100 text-green-700',
  'Mechanical Engineering':              'bg-teal-100 text-teal-700',
  'Materials Science & Engineering':     'bg-cyan-100 text-cyan-700',
  'Finance':                             'bg-emerald-100 text-emerald-700',
  'Accounting':                          'bg-lime-100 text-lime-700',
  'Information Systems':                 'bg-amber-100 text-amber-700',
  'Marketing':                           'bg-orange-100 text-orange-700',
  'Operations / Supply Chain':           'bg-red-100 text-red-700',
  'Organizations, Strategy & Intl Mgmt': 'bg-pink-100 text-pink-700',
}

function KPICard({
  label, value, sub, color, icon
}: {
  label: string
  value: string | number
  sub?: string
  color: string
  icon: string
}) {
  return (
    <div className={`rounded-2xl border p-5 ${color} flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
      <div className="text-3xl font-bold text-gray-800">
        {value === null || value === undefined ? '—' : value}
      </div>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  )
}

export default function Dashboard() {
  const [kpi, setKpi]               = useState<KPIData | null>(null)
  const [trending, setTrending]     = useState<TrendingKeyword[]>([])
  const [deptStats, setDeptStats]   = useState<DeptStat[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      try {
        // Fetch all in parallel
        const [coursesRes, jobsRes, keywordsRes, trendingRes] = await Promise.all([
          api.get('/courses/'),
          api.get('/jobs/stats'),
          api.get('/keywords/stats'),
          api.get('/keywords/trending?limit=8'),
        ])

        const courses: any[] = coursesRes.data
        const jobStats = jobsRes.data
        const kwStats  = keywordsRes.data

        // Compute KPIs
        const totalCourses   = courses.length
        const totalJobs = typeof jobStats?.total === 'number'
          ? jobStats.total
          : Object.values(jobStats as Record<string, number>)
              .filter((v): v is number => typeof v === 'number')
              .reduce((a, b) => a + b, 0)
        const totalKeywords  = Object.values(kwStats as Record<string, number>).reduce((a: number, b) => a + (b as number), 0)
        const scores         = courses.map((c: any) => c.coverage_score).filter((s: any) => s != null)
        const avgScore       = scores.length > 0
          ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
          : null

        setKpi({
          courses_uploaded:    totalCourses,
          jobs_scanned:        totalJobs,
          keywords_found:      totalKeywords,
          avg_coverage_score:  avgScore,
          departments_covered: Object.keys(kwStats).length,
        })

        // Department keyword breakdown
        const deptList: DeptStat[] = Object.entries(kwStats as Record<string, number>)
          .map(([domain, count]) => ({ domain, count: count as number }))
          .sort((a, b) => b.count - a.count)
        setDeptStats(deptList)

        // Trending keywords
        setTrending(trendingRes.data)

      } catch (e) {
        console.error('Dashboard fetch error:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">
          SyllabusCheck — real-time curriculum alignment overview
        </p>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-2xl border bg-gray-50 p-5 animate-pulse h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label="Courses Uploaded"
            value={kpi?.courses_uploaded ?? '—'}
            icon="📚"
            color="bg-orange-50 border-orange-100"
          />
          <KPICard
            label="Jobs Scanned"
            value={kpi?.jobs_scanned?.toLocaleString() ?? '—'}
            sub="from 12+ sources"
            icon="🔍"
            color="bg-blue-50 border-blue-100"
          />
          <KPICard
            label="Keywords Extracted"
            value={kpi?.keywords_found?.toLocaleString() ?? '—'}
            sub="across 12 departments"
            icon="🏷️"
            color="bg-green-50 border-green-100"
          />
          <KPICard
            label="Avg Coverage Score"
            value={kpi?.avg_coverage_score != null ? `${kpi.avg_coverage_score}%` : '—'}
            sub="across all courses"
            icon="📊"
            color="bg-purple-50 border-purple-100"
          />
        </div>
      )}

      {/* Bottom row — Trending + Department breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Trending Skills */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              🔥 Trending Skills
            </h2>
            <span className="text-xs text-gray-400">by job frequency</span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : trending.length === 0 ? (
            <p className="text-gray-400 text-sm">No keyword data yet</p>
          ) : (
            <div className="space-y-2">
              {trending.map((kw, i) => {
                const maxFreq = trending[0]?.frequency || 1
                const pct = Math.round((kw.frequency / maxFreq) * 100)
                return (
                  <div key={kw.text} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-gray-700 truncate">{kw.text}</span>
                        {kw.is_emerging && (
                          <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                            Emerging
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#C75B12] rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{kw.frequency} jobs</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Department keyword breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              🏛️ Keywords by Department
            </h2>
            <span className="text-xs text-gray-400">{deptStats.length} departments</span>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-7 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : deptStats.length === 0 ? (
            <p className="text-gray-400 text-sm">No department data yet</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {deptStats.map(({ domain, count }) => {
                const colorClass = DEPT_COLORS[domain] || 'bg-gray-100 text-gray-600'
                const maxCount = deptStats[0]?.count || 1
                const pct = Math.round((count / maxCount) * 100)
                return (
                  <div key={domain} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-gray-600 truncate">{domain}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-2 flex-shrink-0 ${colorClass}`}>
                          {count.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: '#C75B12',
                            opacity: 0.6 + (pct / 100) * 0.4,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}


