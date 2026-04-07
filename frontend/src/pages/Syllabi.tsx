// frontend/src/pages/Syllabi.tsx
import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

interface Course {
  id: string;
  title: string;
  code: string;
  semester: string;
  domain: string;
  status: string;
  coverage_score: number | null;
  created_at: string;
  parsed_topics: string[] | null;
}

const SCHOOLS = [
  {
    name: 'Erik Jonsson School of Engineering & Computer Science',
    shortName: 'Erik Jonsson School',
    departments: [
      'Computer Science',
      'Electrical & Computer Engineering',
      'Bioengineering',
      'Mechanical Engineering',
      'Materials Science & Engineering',
      'Systems Engineering',
    ],
  },
  {
    name: 'Naveen Jindal School of Management',
    shortName: 'Jindal School',
    departments: [
      'Accounting',
      'Finance',
      'Information Systems',
      'Marketing',
      'Operations / Supply Chain',
      'Organizations, Strategy & Intl Mgmt',
    ],
  },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    parsed: 'bg-green-100 text-green-700',
    parsing: 'bg-yellow-100 text-yellow-700',
    pending: 'bg-gray-100 text-gray-500',
    error: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">—</span>;
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  return (
    <span className="font-semibold text-sm" style={{ color }}>
      {score.toFixed(0)}%
    </span>
  );
}

export default function Syllabi() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<number | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCourses = async () => {
    try {
      const res = await api.get<Course[]>('/courses/');
      setCourses(res.data);
    } catch {
      // silently fail — user sees empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));
    try {
      await api.post('/courses/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadSuccess(`${files.length} file(s) uploaded — parsing in background.`);
      fetchCourses();
    } catch (err: any) {
      setUploadError(err?.response?.data?.detail ?? 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (courseId: string) => {
    if (!confirm('Delete this course and all its coverage data?')) return;
    setDeletingId(courseId);
    try {
      await api.delete(`/courses/${courseId}`);
      setCourses(prev => prev.filter(c => c.id !== courseId));
    } catch {
      alert('Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  // Count courses per department
  const countForDept = (dept: string) =>
    courses.filter(c => c.domain === dept || c.domain?.startsWith(dept + '/')).length;

  const deptCourses = selectedDept
    ? courses.filter(c => c.domain === selectedDept || c.domain?.startsWith(selectedDept + '/'))
    : [];

  // ── Breadcrumb ──────────────────────────────────────────────────────────────
  const school = selectedSchool !== null ? SCHOOLS[selectedSchool] : null;

  return (
    <div className="min-h-screen bg-[#F8F6F3] p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm mb-1">
            <button
              onClick={() => { setSelectedSchool(null); setSelectedDept(null); }}
              className={`font-medium ${selectedSchool === null ? 'text-[#C75B12]' : 'text-gray-400 hover:text-[#C75B12]'}`}
            >
              Schools
            </button>
            {school && (
              <>
                <span className="text-gray-300">/</span>
                <button
                  onClick={() => setSelectedDept(null)}
                  className={`font-medium ${selectedDept === null ? 'text-[#C75B12]' : 'text-gray-400 hover:text-[#C75B12]'}`}
                >
                  {school.shortName}
                </button>
              </>
            )}
            {selectedDept && (
              <>
                <span className="text-gray-300">/</span>
                <span className="text-[#C75B12] font-medium">{selectedDept}</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Syllabi</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedDept
              ? `${deptCourses.length} course${deptCourses.length !== 1 ? 's' : ''} in ${selectedDept}`
              : school
              ? `${school.departments.length} departments · ${courses.filter(c => school.departments.some(d => c.domain === d || c.domain?.startsWith(d + '/'))).length} courses`
              : `${courses.length} total course${courses.length !== 1 ? 's' : ''} across ${SCHOOLS.length} schools`}
          </p>
        </div>

        {/* Upload button — always visible */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-[#C75B12] hover:bg-[#a84a0e] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Uploading…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0l-3 3m3-3l3 3" />
                </svg>
                Upload Syllabus
              </>
            )}
          </button>
          {uploadSuccess && <p className="text-xs text-green-600 mt-1 text-right">{uploadSuccess}</p>}
          {uploadError && <p className="text-xs text-red-500 mt-1 text-right">{uploadError}</p>}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <svg className="animate-spin w-6 h-6 mr-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading courses…
        </div>
      )}

      {/* ── VIEW 1: School Cards ── */}
      {!loading && selectedSchool === null && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SCHOOLS.map((school, idx) => {
            const schoolCourses = courses.filter(c => school.departments.some(d => c.domain === d || c.domain?.startsWith(d + '/'))).length;
            return (
              <button
                key={idx}
                onClick={() => setSelectedSchool(idx)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-left hover:shadow-md hover:border-[#C75B12]/30 transition-all group"
              >
                {/* Orange header */}
                <div className="bg-[#C75B12] px-5 py-4">
                  <h2 className="text-white font-bold text-base leading-snug">{school.name}</h2>
                </div>
                {/* Department preview */}
                <div className="p-5">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {school.departments.map(dept => {
                      const count = countForDept(dept);
                      return (
                        <span
                          key={dept}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                            count > 0
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-gray-50 text-gray-400 border-gray-200'
                          }`}
                        >
                          {dept} {count > 0 && <span className="ml-0.5 font-bold">({count})</span>}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {school.departments.length} departments · {schoolCourses} course{schoolCourses !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[#C75B12] text-sm font-medium group-hover:translate-x-0.5 transition-transform">
                      Explore →
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── VIEW 2: Department Tiles ── */}
      {!loading && selectedSchool !== null && selectedDept === null && (
        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-4">
            {SCHOOLS[selectedSchool].name}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {SCHOOLS[selectedSchool].departments.map(dept => {
              const count = countForDept(dept);
              return (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:shadow-md hover:border-green-300 transition-all group"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${
                    count > 0 ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <svg
                      className={`w-5 h-5 ${count > 0 ? 'text-green-600' : 'text-gray-400'}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 leading-snug mb-1">{dept}</p>
                  <p className={`text-xs font-medium ${count > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {count} course{count !== 1 ? 's' : ''}
                  </p>
                  {count > 0 && (
                    <p className="text-xs text-gray-400 mt-2 group-hover:text-[#C75B12] transition-colors">
                      View courses →
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── VIEW 3: Course List ── */}
      {!loading && selectedDept !== null && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-700">{selectedDept}</h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-[#C75B12] border border-[#C75B12]/30 hover:bg-[#C75B12]/5 px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              + Upload for this dept
            </button>
          </div>

          {deptCourses.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-gray-500 font-medium">No syllabi uploaded yet</p>
              <p className="text-xs text-gray-400 mt-1">Upload a syllabus to get started</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 text-sm bg-[#C75B12] text-white px-4 py-2 rounded-lg hover:bg-[#a84a0e] transition-colors"
              >
                Upload Syllabus
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {deptCourses.map(course => (
                <div
                  key={course.id}
                  className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center justify-between hover:shadow-sm transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-800 text-sm">{course.title}</p>
                      <StatusBadge status={course.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      {course.code && <span>{course.code}</span>}
                      {course.semester && <span>· {course.semester}</span>}
                      {course.parsed_topics && (
                        <span>· {course.parsed_topics.length} topics extracted</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4 shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-0.5">Coverage</p>
                      <ScoreRing score={course.coverage_score} />
                    </div>
                    <button
                      onClick={() => handleDelete(course.id)}
                      disabled={deletingId === course.id}
                      className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Delete course"
                    >
                      {deletingId === course.id ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

