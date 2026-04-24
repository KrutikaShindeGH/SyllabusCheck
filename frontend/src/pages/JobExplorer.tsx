import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore';


interface Job {
  id: string
  source: string
  title: string
  company: string
  location: string
  city: string
  state: string
  is_remote: boolean
  role_type: string
  domain: string
  url: string
  scraped_at: string
}

interface Stats {
  total: number
  by_source: Record<string, number>
}

const SOURCE_COLOR: Record<string, string> = {
  github_simplify:     'bg-gray-100 text-gray-700',
  github_speedyapply:  'bg-gray-100 text-gray-700',
  github_vanshb03:     'bg-gray-100 text-gray-700',
  jsearch_linkedin:    'bg-blue-100 text-blue-700',
  jsearch_indeed:      'bg-indigo-100 text-indigo-700',
  jsearch_ziprecruiter:'bg-orange-100 text-orange-700',
  jsearch_glassdoor:   'bg-green-100 text-green-700',
  arbeitnow:           'bg-purple-100 text-purple-700',
  remotive:            'bg-teal-100 text-teal-700',
}

const ROLE_TYPES = ['', 'internship', 'full-time', 'entry', 'senior', 'contract']

export default function JobExplorer() {
  const [jobs, setJobs]       = useState<Job[]>([])
  const [stats, setStats]     = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [scraping, setScraping] = useState(false)

  const [search,   setSearch]   = useState('')
  const [source,   setSource]   = useState('')
  const [roleType, setRoleType] = useState('')
  const [city,     setCity]     = useState('')
  const [isRemote, setIsRemote] = useState<string>('')

  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  useEffect(() => { fetchJobs(); fetchStats() }, [])

  async function fetchJobs() {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (search)   params.search    = search
      if (source)   params.source    = source
      if (roleType) params.role_type = roleType
      if (city)     params.city      = city
      if (isRemote) params.is_remote = isRemote
      params.limit = '100'

      const { data } = await api.get('/jobs/', { params })
      setJobs(data)
    } catch {}
    setLoading(false)
  }

  async function fetchStats() {
    try {
      const { data } = await api.get('/jobs/stats')
      setStats(data)
    } catch {}
  }

  async function triggerScrape() {
    setScraping(true)
    try {
      await api.post('/jobs/scrape')
      const initialCount = stats?.total || 0
      const poll = setInterval(async () => {
        const { data } = await api.get('/jobs/stats')
        setStats(data)
        if (data.total > initialCount) {
          await fetchJobs()
          setScraping(false)
          clearInterval(poll)
        }
      }, 3000)
      setTimeout(() => { clearInterval(poll); setScraping(false) }, 120000)
    } catch {
      setScraping(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    fetchJobs()
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Job Explorer</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {stats && stats.total > 0 ? `${stats.total.toLocaleString()} live job postings` : 'Browse live job postings'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={triggerScrape}
            disabled={scraping}
            className="px-4 py-2 bg-[#C75B12] text-white rounded-lg text-sm font-semibold hover:bg-[#A84A0A] transition disabled:opacity-50"
          >
            {scraping ? '⏳ Scraping...' : '🔄 Scrape Now'}
          </button>
        )}
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-3 mb-6">
        <input
          placeholder="Search title or company..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#C75B12] bg-white w-56"
        />
        <select
          value={source}
          onChange={e => setSource(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#C75B12] bg-white"
        >
          <option value="">All Sources</option>
          <option value="github">GitHub</option>
          <option value="jsearch_linkedin">LinkedIn</option>
          <option value="jsearch_indeed">Indeed</option>
          <option value="jsearch_ziprecruiter">ZipRecruiter</option>
          <option value="jsearch_glassdoor">Glassdoor</option>
          <option value="arbeitnow">Arbeitnow</option>
          <option value="remotive">Remotive</option>
        </select>
        <select
          value={roleType}
          onChange={e => setRoleType(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#C75B12] bg-white"
        >
          <option value="">All Roles</option>
          {ROLE_TYPES.filter(Boolean).map(r => (
            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
        </select>
        <input
          placeholder="City..."
          value={city}
          onChange={e => setCity(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#C75B12] bg-white w-32"
        />
        <select
          value={isRemote}
          onChange={e => setIsRemote(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#C75B12] bg-white"
        >
          <option value="">Remote + On-site</option>
          <option value="true">Remote Only</option>
          <option value="false">On-site Only</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 transition"
        >
          Search
        </button>
      </form>

      {/* Job List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">💼</div>
          <div className="text-gray-500 text-sm font-medium">No jobs found</div>
          <div className="text-gray-400 text-xs mt-1">Click "Scrape Now" to fetch live job postings</div>
        </div>
      ) : (
        <div className="grid gap-3">
          {jobs.map(job => (
            <div key={job.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-[#C75B12] transition group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLOR[job.source] || 'bg-gray-100 text-gray-600'}`}>
                      {job.source.replace('github_simplify', 'GitHub').replace('github_speedyapply', 'GitHub').replace('github_vanshb03', 'GitHub').replace('jsearch_', '').replace('_', ' ')}
                    </span>
                    {job.role_type && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
                        {job.role_type}
                      </span>
                    )}
                    {job.is_remote && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                        Remote
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-gray-800 mt-1.5 truncate">{job.title}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {job.company && <span className="font-medium text-gray-600">{job.company}</span>}
                    {job.company && job.location && <span className="mx-1.5">·</span>}
                    {job.location && <span>{job.location}</span>}
                  </div>
                </div>
                {(job.url || job.company) && (
                  <a
                    href={job.url || `https://www.google.com/search?q=${encodeURIComponent(job.title + ' ' + job.company)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="shrink-0 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:border-[#C75B12] hover:text-[#C75B12] transition"
                  >
                    Apply →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}