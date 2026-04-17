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

// ── UTD School / Department / Program data ─────────────────────────────────

interface ProgramEntry {
  name: string;
  type: 'degree' | 'certificate' | 'program';
}

interface Department {
  name: string;
  programs: ProgramEntry[];
}

interface School {
  name: string;
  shortName: string;
  departments: Department[];
}

const SCHOOLS: School[] = [
  {
    name: 'Erik Jonsson School of Engineering & Computer Science',
    shortName: 'Erik Jonsson School',
    departments: [
      {
        name: 'Bioengineering',
        programs: [
          { name: 'Bioengineering Program', type: 'program' },
          { name: 'Biomedical Engineering (MS)', type: 'degree' },
          { name: 'Biomedical Engineering (PhD)', type: 'degree' },
          { name: 'Certificate in Development of Regulated Medical Devices and Drugs', type: 'certificate' },
          { name: 'Certificate in Health Data Analytics', type: 'certificate' },
        ],
      },
      {
        name: 'Computer Engineering',
        programs: [
          { name: 'Computer Engineering Program', type: 'program' },
          { name: 'Computer Engineering (MS)', type: 'degree' },
          { name: 'Computer Engineering (PhD)', type: 'degree' },
        ],
      },
      {
        name: 'Computer Science',
        programs: [
          { name: 'Computer Science Program', type: 'program' },
          { name: 'Computer Science (MS)', type: 'degree' },
          { name: 'Computer Science (PhD)', type: 'degree' },
          { name: 'Certificate in Cyber Defense', type: 'certificate' },
          { name: 'Cybersecurity Systems (CCSS) Certificate', type: 'certificate' },
        ],
      },
      {
        name: 'Electrical Engineering',
        programs: [
          { name: 'Electrical and Computer Engineering Program', type: 'program' },
          { name: 'Electrical Engineering (MS)', type: 'degree' },
          { name: 'Electrical Engineering (PhD)', type: 'degree' },
        ],
      },
      {
        name: 'Materials Science and Engineering',
        programs: [
          { name: 'Materials Science and Engineering Program', type: 'program' },
          { name: 'Materials Science and Engineering (MS)', type: 'degree' },
          { name: 'Materials Science and Engineering (PhD)', type: 'degree' },
          { name: 'Certificate in Semiconductor Technology', type: 'certificate' },
        ],
      },
      {
        name: 'Mechanical Engineering',
        programs: [
          { name: 'Mechanical Engineering Program', type: 'program' },
          { name: 'Mechanical Engineering (MS)', type: 'degree' },
          { name: 'Mechanical Engineering (PhD)', type: 'degree' },
        ],
      },
      {
        name: 'Software Engineering',
        programs: [
          { name: 'Software Engineering Program', type: 'program' },
          { name: 'Software Engineering (MS)', type: 'degree' },
          { name: 'Software Engineering (PhD)', type: 'degree' },
          { name: 'Executive Masters of Science in Software Engineering', type: 'degree' },
        ],
      },
      {
        name: 'Systems Engineering',
        programs: [
          { name: 'Systems Engineering Program', type: 'program' },
          { name: 'MS in Systems Engineering and Management', type: 'degree' },
          { name: 'Executive Education MS in Systems Engineering and Management', type: 'degree' },
        ],
      },
      {
        name: 'Engineering and Management',
        programs: [
          { name: 'Engineering and Management Graduate Degrees (MSEE+MBA)', type: 'degree' },
          { name: 'Engineering and Management Graduate Degrees (MSEE+MS)', type: 'degree' },
          { name: 'MS in Systems Engineering and Management', type: 'degree' },
          { name: 'Double Systems Engineering and Management MS/MBA', type: 'degree' },
          { name: 'Executive Education MS in Systems Engineering and Management', type: 'degree' },
          { name: 'Double Systems Engineering and Management Executive Education MS/MBA', type: 'degree' },
        ],
      },
      {
        name: 'Geospatial Information Sciences',
        programs: [
          { name: 'Geospatial Information Sciences (PhD)', type: 'degree' },
        ],
      },
      {
        name: 'Industrial Practice Programs',
        programs: [
          { name: 'Industrial Practice Programs (IPP)', type: 'program' },
        ],
      },
      {
        name: 'ECS Certificate Programs',
        programs: [
          { name: 'Cybersecurity Systems (CCSS) Certificate', type: 'certificate' },
          { name: 'Cyber Defense Certificate', type: 'certificate' },
          { name: 'Health Data Analytics Certificate', type: 'certificate' },
          { name: 'Semiconductor Technology Certificate', type: 'certificate' },
          { name: 'Systems Engineering Certificate', type: 'certificate' },
          { name: 'Systems Management Certificate', type: 'certificate' },
          { name: 'Systems Engineering Certificate - Executive Education', type: 'certificate' },
          { name: 'Systems Management Certificate - Executive Education', type: 'certificate' },
        ],
      },
    ],
  },
  {
    name: 'Naveen Jindal School of Management',
    shortName: 'Jindal School',
    departments: [
      {
        name: 'Accounting and Analytics',
        programs: [
          { name: 'Accounting and Analytics (MS)', type: 'degree' },
          { name: 'Certificate in Research Foundations in Accounting', type: 'certificate' },
        ],
      },
      {
        name: 'Business Administration',
        programs: [
          { name: 'Business Administration (MBA)', type: 'degree' },
        ],
      },
      {
        name: 'Business Analytics and Artificial Intelligence',
        programs: [
          { name: 'Business Analytics and Artificial Intelligence (MS)', type: 'degree' },
          { name: 'Certificate in Applied Machine Learning', type: 'certificate' },
          { name: 'Certificate in Applied Data Engineering for Managers', type: 'certificate' },
          { name: 'Certificate in Analytics for Managers', type: 'certificate' },
          { name: 'Certificate in Business Decision Analytics', type: 'certificate' },
        ],
      },
      {
        name: 'Energy Management',
        programs: [
          { name: 'Energy Management (MS)', type: 'degree' },
        ],
      },
      {
        name: 'Finance',
        programs: [
          { name: 'Finance (MS)', type: 'degree' },
          { name: 'Certificate in Real Estate Investment Management', type: 'certificate' },
          { name: 'Financial Technology and Analytics (MS)', type: 'degree' },
          { name: 'Certificate in Fintech', type: 'certificate' },
          { name: 'Certificate in Financial Data Science', type: 'certificate' },
          { name: 'Certificate in Insurance Technology and Analytics', type: 'certificate' },
        ],
      },
      {
        name: 'Healthcare Leadership and Management',
        programs: [
          { name: 'Healthcare Leadership and Management (MS)', type: 'degree' },
          { name: 'Lean Six Sigma Yellow Belt in Healthcare Quality Certificate', type: 'certificate' },
          { name: 'Certificate in Health Information Technology', type: 'certificate' },
        ],
      },
      {
        name: 'Information Technology and Management',
        programs: [
          { name: 'Information Technology and Management (MS)', type: 'degree' },
          { name: 'Business Analytics and Data Mining Certificate', type: 'certificate' },
          { name: 'Cybersecurity Risk Management Certificate', type: 'certificate' },
          { name: 'Cybersecurity Systems (CCSS) Certificate', type: 'certificate' },
          { name: 'Health Information Technology Certificate', type: 'certificate' },
          { name: 'Intelligent Enterprise Systems Certificate', type: 'certificate' },
          { name: 'Product Management Certificate', type: 'certificate' },
        ],
      },
      {
        name: 'Innovation and Entrepreneurship',
        programs: [
          { name: 'Innovation and Entrepreneurship (MS)', type: 'degree' },
          { name: 'Certificate in Corporate Innovation', type: 'certificate' },
          { name: 'Certificate in New Venture Entrepreneurship', type: 'certificate' },
        ],
      },
      {
        name: 'International Management Studies',
        programs: [
          { name: 'International Management Studies (MS)', type: 'degree' },
          { name: 'International Management Studies (PhD)', type: 'degree' },
        ],
      },
      {
        name: 'Management Science',
        programs: [
          { name: 'Management Science (MS)', type: 'degree' },
          { name: 'Management Science (PhD)', type: 'degree' },
        ],
      },
      {
        name: 'Marketing',
        programs: [
          { name: 'Marketing (MS)', type: 'degree' },
        ],
      },
      {
        name: 'Supply Chain Management',
        programs: [
          { name: 'Supply Chain Management (MS)', type: 'degree' },
          { name: 'Certificate in Procurement in Supply Chain Management', type: 'certificate' },
        ],
      },
      {
        name: 'Systems Engineering and Management',
        programs: [
          { name: 'MS in Systems Engineering and Management', type: 'degree' },
          { name: 'Double Systems Engineering and Management MS/MBA', type: 'degree' },
          { name: 'Certificates in Systems Engineering or Systems Management', type: 'certificate' },
          { name: 'Executive Education MS in Systems Engineering and Management', type: 'degree' },
          { name: 'Double Systems Engineering and Management Executive Education MS/MBA', type: 'degree' },
          { name: 'Executive Education Certificates in Systems Engineering or Systems Management', type: 'certificate' },
          { name: 'Engineering and Management Graduate Degrees (MSEE+MBA/MS/MA)', type: 'degree' },
        ],
      },
      {
        name: 'JSOM Certificate Programs',
        programs: [
          { name: 'Analytics for Managers Certificate', type: 'certificate' },
          { name: 'Applied Data Engineering for Managers Certificate', type: 'certificate' },
          { name: 'Applied Machine Learning Certificate', type: 'certificate' },
          { name: 'Business Analytics & Data Mining Certificate', type: 'certificate' },
          { name: 'Business Decision Analytics Certificate', type: 'certificate' },
          { name: 'Corporate Innovation Certificate', type: 'certificate' },
          { name: 'Cybersecurity Risk Management Certificate', type: 'certificate' },
          { name: 'Cybersecurity Systems (CCSS) Certificate', type: 'certificate' },
          { name: 'Financial Data Science Certificate', type: 'certificate' },
          { name: 'Fintech Certificate', type: 'certificate' },
          { name: 'Healthcare Information Technology Certificate', type: 'certificate' },
          { name: 'Insurance Technology and Analytics Certificate', type: 'certificate' },
          { name: 'Intelligent Enterprise Systems Certificate', type: 'certificate' },
          { name: 'Lean 6 Sigma Yellow Belt in Healthcare Management Certificate', type: 'certificate' },
          { name: 'New Venture Entrepreneurship Certificate', type: 'certificate' },
          { name: 'Product Management Certificate', type: 'certificate' },
          { name: 'Real Estate Investment Management Certificate', type: 'certificate' },
          { name: 'Research Foundations in Accounting Certificate', type: 'certificate' },
          { name: 'Procurement in Supply Chain Management Certificate', type: 'certificate' },
          { name: 'Systems Engineering or Management Certificates', type: 'certificate' },
          { name: 'Systems Engineering or Management Certificates - Executive Education', type: 'certificate' },
        ],
      },
    ],
  },
];

// ── Helper: all department names flat (for domain matching) ───────────────────
function allDeptNames(school: School): string[] {
  return school.departments.map(d => d.name);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    parsed:  'bg-green-100 text-green-700',
    parsing: 'bg-yellow-100 text-yellow-700',
    pending: 'bg-gray-100 text-gray-500',
    error:   'bg-red-100 text-red-600',
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

function ProgramTypeBadge({ type }: { type: ProgramEntry['type'] }) {
  const map: Record<string, string> = {
    degree:      'bg-blue-50 text-blue-600 border-blue-200',
    certificate: 'bg-amber-50 text-amber-600 border-amber-200',
    program:     'bg-purple-50 text-purple-600 border-purple-200',
  };
  const label: Record<string, string> = {
    degree:      'Degree',
    certificate: 'Certificate',
    program:     'Program',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${map[type]}`}>
      {label[type]}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Syllabi() {
  const [courses, setCourses]             = useState<Course[]>([]);
  const [loading, setLoading]             = useState(true);
  const [uploading, setUploading]         = useState(false);
  const [uploadError, setUploadError]     = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  // Navigation state: school → department → program
  const [selectedSchool, setSelectedSchool]   = useState<number | null>(null);
  const [selectedDept, setSelectedDept]       = useState<Department | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<ProgramEntry | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Two separate file inputs: single upload & bulk upload
  const singleFileRef = useRef<HTMLInputElement>(null);
  const bulkFileRef   = useRef<HTMLInputElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

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

  useEffect(() => { fetchCourses(); }, []);

  // ── Upload handler ───────────────────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));

    // Pass the current department as domain so coverage/gap scoping works
    if (selectedDept) formData.append('domain', selectedDept.name);

    try {
      await api.post('/courses/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadSuccess(`${files.length} file${files.length !== 1 ? 's' : ''} uploaded — parsing in background.`);
      fetchCourses();
    } catch (err: any) {
      setUploadError(err?.response?.data?.detail ?? 'Upload failed.');
    } finally {
      setUploading(false);
      if (singleFileRef.current) singleFileRef.current.value = '';
      if (bulkFileRef.current)   bulkFileRef.current.value   = '';
    }
  };

  // ── Delete handler ───────────────────────────────────────────────────────────

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

  // ── Derived data ─────────────────────────────────────────────────────────────

  // Courses that match a given department name
  const coursesForDept = (deptName: string) =>
    courses.filter(c => c.domain === deptName || c.domain?.startsWith(deptName + '/'));

  // Courses that match the currently selected program name
  const coursesForProgram = (programName: string) =>
    courses.filter(c =>
      c.domain === programName ||
      c.domain?.startsWith(programName + '/') ||
      (selectedDept && (c.domain === selectedDept.name || c.domain?.startsWith(selectedDept.name + '/')))
    );

  // Total courses in a school (across all its departments)
  const coursesForSchool = (school: School) =>
    courses.filter(c => allDeptNames(school).some(d => c.domain === d || c.domain?.startsWith(d + '/')));

  const school = selectedSchool !== null ? SCHOOLS[selectedSchool] : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F8F6F3] p-6">

      {/* ── Hidden file inputs ── */}
      <input
        ref={singleFileRef}
        type="file"
        accept=".pdf,.docx,.doc"
        className="hidden"
        onChange={handleUpload}
      />
      <input
        ref={bulkFileRef}
        type="file"
        accept=".pdf,.docx,.doc"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex-1 min-w-0">

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm mb-1 flex-wrap">
            <button
              onClick={() => { setSelectedSchool(null); setSelectedDept(null); setSelectedProgram(null); }}
              className={`font-medium ${selectedSchool === null ? 'text-[#C75B12]' : 'text-gray-400 hover:text-[#C75B12]'} transition-colors`}
            >
              Schools
            </button>

            {school && (
              <>
                <span className="text-gray-300">/</span>
                <button
                  onClick={() => { setSelectedDept(null); setSelectedProgram(null); }}
                  className={`font-medium ${selectedDept === null ? 'text-[#C75B12]' : 'text-gray-400 hover:text-[#C75B12]'} transition-colors`}
                >
                  {school.shortName}
                </button>
              </>
            )}

            {selectedDept && (
              <>
                <span className="text-gray-300">/</span>
                <button
                  onClick={() => setSelectedProgram(null)}
                  className={`font-medium ${selectedProgram === null ? 'text-[#C75B12]' : 'text-gray-400 hover:text-[#C75B12]'} transition-colors`}
                >
                  {selectedDept.name}
                </button>
              </>
            )}

            {selectedProgram && (
              <>
                <span className="text-gray-300">/</span>
                <span className="text-[#C75B12] font-medium truncate max-w-[220px]">{selectedProgram.name}</span>
              </>
            )}
          </div>

          <h1 className="text-2xl font-bold text-gray-900">Syllabi</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedProgram
              ? `${coursesForProgram(selectedProgram.name).length} syllab${coursesForProgram(selectedProgram.name).length !== 1 ? 'i' : 'us'} in ${selectedProgram.name}`
              : selectedDept
              ? `${selectedDept.programs.length} programs · ${coursesForDept(selectedDept.name).length} syllab${coursesForDept(selectedDept.name).length !== 1 ? 'i' : 'us'}`
              : school
              ? `${school.departments.length} departments · ${coursesForSchool(school).length} syllab${coursesForSchool(school).length !== 1 ? 'i' : 'us'}`
              : `${courses.length} total syllab${courses.length !== 1 ? 'i' : 'us'} across ${SCHOOLS.length} schools`}
          </p>
        </div>

        {/* Upload buttons — always visible */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Single upload */}
          <button
            onClick={() => singleFileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 border border-[#C75B12] text-[#C75B12] hover:bg-[#C75B12]/5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Syllabus
          </button>

          {/* Bulk upload */}
          <button
            onClick={() => bulkFileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-[#C75B12] hover:bg-[#a84a0e] text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
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
                Bulk Upload
              </>
            )}
          </button>
        </div>
      </div>

      {/* Upload feedback */}
      {uploadSuccess && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
          {uploadSuccess}
        </div>
      )}
      {uploadError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {uploadError}
        </div>
      )}

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

      {/* ══════════════════════════════════════════════════════════════════════
          VIEW 1: School Cards
      ══════════════════════════════════════════════════════════════════════ */}
      {!loading && selectedSchool === null && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SCHOOLS.map((s, idx) => {
            const count = coursesForSchool(s).length;
            const deptCount = s.departments.length;
            return (
              <button
                key={idx}
                onClick={() => setSelectedSchool(idx)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-left hover:shadow-md hover:border-[#C75B12]/30 transition-all group"
              >
                <div className="bg-[#C75B12] px-5 py-4">
                  <h2 className="text-white font-bold text-base leading-snug">{s.name}</h2>
                </div>
                <div className="p-5">
                  {/* Department name pills preview (first 6) */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {s.departments.slice(0, 6).map(dept => {
                      const c = coursesForDept(dept.name).length;
                      return (
                        <span
                          key={dept.name}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                            c > 0
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-gray-50 text-gray-400 border-gray-200'
                          }`}
                        >
                          {dept.name}{c > 0 && <span className="ml-0.5 font-bold"> ({c})</span>}
                        </span>
                      );
                    })}
                    {s.departments.length > 6 && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-gray-50 text-gray-400 border border-gray-200">
                        +{s.departments.length - 6} more
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                      {deptCount} departments · {count} syllab{count !== 1 ? 'i' : 'us'}
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

      {/* ══════════════════════════════════════════════════════════════════════
          VIEW 2: Department Tiles (within a school)
      ══════════════════════════════════════════════════════════════════════ */}
      {!loading && selectedSchool !== null && selectedDept === null && (
        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-4">
            {SCHOOLS[selectedSchool].name}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {SCHOOLS[selectedSchool].departments.map(dept => {
              const count       = coursesForDept(dept.name).length;
              const progCount   = dept.programs.length;
              const degreeCount = dept.programs.filter(p => p.type === 'degree').length;
              const certCount   = dept.programs.filter(p => p.type === 'certificate').length;

              return (
                <button
                  key={dept.name}
                  onClick={() => { setSelectedDept(dept); setSelectedProgram(null); }}
                  className="bg-white rounded-xl border border-gray-100 p-4 text-left hover:shadow-md hover:border-[#C75B12]/30 transition-all group"
                >
                  {/* Icon */}
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

                  <p className="text-sm font-semibold text-gray-800 leading-snug mb-1">{dept.name}</p>

                  {/* Program/cert counts */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {degreeCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                        {degreeCount} degree{degreeCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {certCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100">
                        {certCount} cert{certCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <p className={`text-xs font-medium ${count > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {count > 0 ? `${count} syllab${count !== 1 ? 'i' : 'us'} uploaded` : `${progCount} programs — no syllabi yet`}
                  </p>

                  <p className="text-xs text-gray-400 mt-2 group-hover:text-[#C75B12] transition-colors">
                    View programs →
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VIEW 3: Program List (within a department)
      ══════════════════════════════════════════════════════════════════════ */}
      {!loading && selectedDept !== null && selectedProgram === null && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-gray-700">{selectedDept.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedDept.programs.length} programs ·{' '}
                {coursesForDept(selectedDept.name).length} syllab{coursesForDept(selectedDept.name).length !== 1 ? 'i' : 'us'} uploaded
              </p>
            </div>
          </div>

          {/* Group by type */}
          {(['program', 'degree', 'certificate'] as const).map(type => {
            const items = selectedDept.programs.filter(p => p.type === type);
            if (items.length === 0) return null;
            const typeLabel: Record<string, string> = {
              program: 'Programs',
              degree: 'Degree Programs',
              certificate: 'Certificates',
            };
            return (
              <div key={type} className="mb-6">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  {typeLabel[type]}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map(program => {
                    // For a program entry, count syllabi whose domain matches the parent department
                    const deptCourseCount = coursesForDept(selectedDept.name).length;
                    return (
                      <button
                        key={program.name}
                        onClick={() => setSelectedProgram(program)}
                        className="bg-white rounded-xl border border-gray-100 p-4 text-left hover:shadow-md hover:border-[#C75B12]/30 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800 leading-snug flex-1">
                            {program.name}
                          </p>
                          <ProgramTypeBadge type={program.type} />
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-gray-400">
                            {deptCourseCount > 0
                              ? `${deptCourseCount} syllab${deptCourseCount !== 1 ? 'i' : 'us'} in this dept`
                              : 'No syllabi yet'}
                          </span>
                          <span className="text-xs text-gray-300 group-hover:text-[#C75B12] transition-colors">
                            Open →
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VIEW 4: Syllabi list inside a Program
          (professor adds one; program director adds many)
      ══════════════════════════════════════════════════════════════════════ */}
      {!loading && selectedProgram !== null && selectedDept !== null && (() => {
        // Show courses whose domain matches the parent department
        const programCourses = coursesForDept(selectedDept.name);
        return (
          <div>
            {/* Sub-header with both upload actions */}
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-700">{selectedProgram.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedDept.name}
                  {programCourses.length > 0 && ` · ${programCourses.length} syllab${programCourses.length !== 1 ? 'i' : 'us'} uploaded`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Professor: upload one or two */}
                <button
                  onClick={() => singleFileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 text-xs text-gray-700 border border-gray-200 hover:border-[#C75B12]/40 hover:bg-[#C75B12]/5 px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add My Syllabus
                </button>

                {/* Program director: bulk upload 15-20 */}
                <button
                  onClick={() => bulkFileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 text-xs text-white bg-[#C75B12] hover:bg-[#a84a0e] px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Uploading…
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0l-3 3m3-3l3 3" />
                      </svg>
                      Bulk Upload All Syllabi
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Upload hints */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3">
                <span className="text-lg mt-0.5">👤</span>
                <div>
                  <p className="text-xs font-semibold text-gray-700">Professor</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Use "Add My Syllabus" to upload your 1–2 course syllabi.</p>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3">
                <span className="text-lg mt-0.5">🎓</span>
                <div>
                  <p className="text-xs font-semibold text-gray-700">Program Director</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Use "Bulk Upload" to add all 15–20 syllabi at once.</p>
                </div>
              </div>
            </div>

            {/* Syllabus list */}
            {programCourses.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-gray-500 font-medium">No syllabi uploaded yet</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">
                  Professors: add your course. Directors: bulk-upload all program syllabi.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => singleFileRef.current?.click()}
                    className="text-sm border border-[#C75B12] text-[#C75B12] px-4 py-2 rounded-lg hover:bg-[#C75B12]/5 transition-colors"
                  >
                    Add My Syllabus
                  </button>
                  <button
                    onClick={() => bulkFileRef.current?.click()}
                    className="text-sm bg-[#C75B12] text-white px-4 py-2 rounded-lg hover:bg-[#a84a0e] transition-colors"
                  >
                    Bulk Upload
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {programCourses.map(course => (
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
                        {course.code    && <span>{course.code}</span>}
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
                        title="Delete syllabus"
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
        );
      })()}
    </div>
  );
}

