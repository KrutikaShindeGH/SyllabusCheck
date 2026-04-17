import { useState, useEffect } from 'react';
import api from '../lib/api';

interface Course {
  id: string;
  title: string;
  code: string;
  domain: string;
  status: string;
  coverage_score: number | null;
}

interface PerCourse {
  course_id: string;
  course_name: string;
  domain: string;
  covered_count: number;
  total_required: number;
  coverage_pct: number;
  covered_keywords: string[];
}

interface GapResult {
  job_role: string;
  jobs_matched: number;
  total_required_keywords: number;
  total_covered: number;
  overall_coverage_pct: number;
  covered_keywords: string[];
  missing_keywords: string[];
  per_course_breakdown: PerCourse[];
  warning?: string;
}

export default function ProgramGapAnalysis() {
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState<Course[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [jobRole, setJobRole] = useState('');
  const [result, setResult] = useState<GapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Course[]>('/courses/').then(r => setAllCourses(r.data));
  }, []);

  const addToSelected = (course: Course) => {
    if (!selected.find(s => s.id === course.id)) {
      setSelected(prev => [...prev, course]);
    }
  };

  const removeFromSelected = (id: string) => {
    setSelected(prev => prev.filter(s => s.id !== id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!draggingId) return;
    const course = allCourses.find(c => c.id === draggingId);
    if (course) addToSelected(course);
    setDraggingId(null);
  };

  const handleAnalyze = async () => {
    if (!selected.length || !jobRole.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<GapResult>('/coverage/program-gap', {
        course_ids: selected.map(s => s.id),
        job_role: jobRole.trim(),
      });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const unselected = allCourses.filter(c => !selected.find(s => s.id === c.id));

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#F8F6F3]">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Program Gap Analysis</h1>
        <p className="text-sm text-gray-500 mt-1">
          Drag any syllabi into the basket, pick a job role, and see how well they cover it together.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left panel: syllabus library ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 max-h-[520px] overflow-y-auto">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Your Syllabi ({unselected.length})
          </p>
          {unselected.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">All syllabi are selected</p>
          )}
          {unselected.map(course => (
            <div
              key={course.id}
              draggable
              onDragStart={() => setDraggingId(course.id)}
              onClick={() => addToSelected(course)}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 hover:border-[#C75B12]/30 hover:bg-orange-50 cursor-grab active:cursor-grabbing transition group"
            >
              <span className="text-gray-300 group-hover:text-[#C75B12] text-sm">⠿</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{course.title}</p>
                {course.domain && (
                  <p className="text-[10px] text-gray-400 truncate">{course.domain}</p>
                )}
              </div>
              <span className="text-[10px] text-[#C75B12] opacity-0 group-hover:opacity-100 shrink-0">
                Add →
              </span>
            </div>
          ))}
        </div>

        {/* ── Center: drop zone + job role + analyze ── */}
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`min-h-[220px] rounded-2xl border-2 border-dashed p-4 transition-colors ${
              dragOver
                ? 'border-[#C75B12] bg-orange-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            {selected.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                <div className="text-3xl mb-2">📂</div>
                <p className="text-sm text-gray-400">Drag syllabi here</p>
                <p className="text-xs text-gray-300 mt-1">or click them in the left panel</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Selected ({selected.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {selected.map(s => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-[#C75B12]/10 text-[#C75B12] rounded-full text-xs font-medium"
                    >
                      {s.title}
                      <button
                        onClick={() => removeFromSelected(s.id)}
                        className="w-4 h-4 rounded-full hover:bg-[#C75B12]/20 flex items-center justify-center font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Job role input */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Job Role to Compare Against
            </label>
            <input
              type="text"
              value={jobRole}
              onChange={e => setJobRole(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              placeholder="e.g. Data Engineer, ML Engineer, Software Developer…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C75B12]/30"
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !selected.length || !jobRole.trim()}
              className="w-full py-2.5 bg-[#C75B12] text-white rounded-xl text-sm font-semibold hover:bg-[#a84a0e] transition disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing…
                </>
              ) : '⚡ Analyze Gap'}
            </button>
            {!selected.length && (
              <p className="text-xs text-gray-400 text-center">Select at least one syllabus</p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* ── Right panel: results ── */}
        <div className="space-y-4">
          {!result && !loading && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-sm">Results will appear here after analysis</p>
            </div>
          )}

          {result && (
            <>
              {result.warning && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
                  {result.warning}
                </div>
              )}

              {/* Overall score card */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`text-4xl font-bold ${
                    result.overall_coverage_pct >= 70 ? 'text-emerald-600'
                    : result.overall_coverage_pct >= 40 ? 'text-amber-500'
                    : 'text-red-500'
                  }`}>
                    {result.overall_coverage_pct}%
                  </span>
                  <span className="text-sm text-gray-500">overall coverage</span>
                </div>
                <p className="text-xs text-gray-400">
                  {result.total_covered} of {result.total_required_keywords} required skills covered
                  for <strong className="text-gray-600">{result.job_role}</strong>
                  {result.jobs_matched > 0 && ` · from ${result.jobs_matched} job postings`}
                </p>

                {/* Visual bar */}
                <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      result.overall_coverage_pct >= 70 ? 'bg-emerald-500'
                      : result.overall_coverage_pct >= 40 ? 'bg-amber-400'
                      : 'bg-red-400'
                    }`}
                    style={{ width: `${result.overall_coverage_pct}%` }}
                  />
                </div>
              </div>

              {/* Per-course table */}
              {result.per_course_breakdown.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Per Syllabus
                  </p>
                  <div className="space-y-2">
                    {result.per_course_breakdown.map(c => (
                      <div key={c.course_id}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="font-medium text-gray-700 truncate pr-2">{c.course_name}</span>
                          <span className={`font-semibold shrink-0 ${
                            c.coverage_pct >= 70 ? 'text-emerald-600'
                            : c.coverage_pct >= 40 ? 'text-amber-500'
                            : 'text-red-500'
                          }`}>{c.coverage_pct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              c.coverage_pct >= 70 ? 'bg-emerald-500'
                              : c.coverage_pct >= 40 ? 'bg-amber-400'
                              : 'bg-red-400'
                            }`}
                            style={{ width: `${c.coverage_pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing keywords */}
              {result.missing_keywords.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                    Missing Skills ({result.missing_keywords.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                    {result.missing_keywords.map(k => (
                      <span key={k} className="text-[11px] px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg font-medium">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Covered keywords */}
              {result.covered_keywords.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">
                    Covered Skills ({result.covered_keywords.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                    {result.covered_keywords.map(k => (
                      <span key={k} className="text-[11px] px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

