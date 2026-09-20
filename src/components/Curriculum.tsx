// src/components/Curriculum.tsx
import React, { useState } from "react";
import { useStore } from "../store/store";
import type { DEGREE_PROGRAM, PROGRAM_COURSE } from "../store/types";
import { backendAPI } from "../backend/api";
import * as I from "./icons";

export default function Curriculum() {
    const { programs, setPrograms, courses, setCourses, programCourses, setProgramCourses, pushAudit, can} = useStore();

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedProgram, setSelectedProgram] = useState<DEGREE_PROGRAM | null>(null);

    const [showProgramForm, setShowProgramForm] = useState(false);
    const [editingProgCode, setEditingProgCode] = useState<string | null>(null);
    const [progForm, setProgForm] = useState({ code: "", title: "", year: "", threshold: "" });

    const [showCourseForm, setShowCourseForm] = useState(false);
    const [editingCourseCode, setEditingCourseCode] = useState<string | null>(null);
    type SemesterType = "1st Semester" | "2nd Semester" | "Midyear" | "";
    type ClassifType = "Major" | "Minor" | "";

    const [courseForm, setCourseForm] = useState<{
        courseCode: string; title: string; units: string; yearLevel: string;
        semester: SemesterType; classification: ClassifType; isCQPAIncluded: boolean; prerequisites: string;
    }>({
        courseCode: "", title: "", units: "", yearLevel: "", semester: "",
        classification: "", isCQPAIncluded: false, prerequisites: ""
    });

    const filteredPrograms = programs.filter(p => {
        const matchesProg = p.programCode.toLowerCase().includes(searchQuery.toLowerCase()) || p.programTitle.toLowerCase().includes(searchQuery.toLowerCase());
        const progCourses = programCourses.filter(pc => pc.programCode === p.programCode);
        const matchesCourse = progCourses.some(pc => {
            const baseCourse = courses.find(c => c.courseCode === pc.courseCode);
            return pc.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) || (baseCourse?.courseTitle.toLowerCase().includes(searchQuery.toLowerCase()));
        });
        return matchesProg || matchesCourse;
    });

    const getCourses = (year: number, semester: string) => {
        if (!selectedProgram) return [];
        return programCourses
            .filter(pc => pc.programCode === selectedProgram.programCode && pc.yearLevel === year && pc.termSem === semester)
            .map(pc => {
                const base = courses.find(c => c.courseCode === pc.courseCode);
                return { ...pc, courseTitle: base?.courseTitle || "Unknown", courseUnits: base?.courseUnits || 0 };
            });
    };

    const openProgramForm = (prog?: DEGREE_PROGRAM) => {
        if (prog) {
            setProgForm({ code: prog.programCode, title: prog.programTitle, year: prog.curriculumYear, threshold: prog.passingGradeThreshold?.toString() || "1.0" });
            setEditingProgCode(prog.programCode);
        } else {
            setProgForm({ code: "", title: "", year: "", threshold: "" });
            setEditingProgCode(null);
        }
        setShowProgramForm(true);
    };

    const openCourseForm = (course?: PROGRAM_COURSE & { courseTitle: string, courseUnits: number }) => {
        if (course) {
            setCourseForm({
                courseCode: course.courseCode, title: course.courseTitle, units: course.courseUnits.toString(),
                yearLevel: course.yearLevel.toString(), semester: course.termSem, classification: course.majorMinorClassif,
                isCQPAIncluded: course.isCQPAIncluded, prerequisites: ""
            });
            setEditingCourseCode(course.courseCode);
        } else {
            setCourseForm({ courseCode: "", title: "", units: "", yearLevel: "", semester: "", classification: "", isCQPAIncluded: false, prerequisites: "" });
            setEditingCourseCode(null);
        }
        setShowCourseForm(true);
    };

    const handleSaveProgram = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        const newProg: DEGREE_PROGRAM = { programCode: progForm.code.toUpperCase(), programTitle: progForm.title, curriculumYear: progForm.year, passingGradeThreshold: Number(progForm.threshold) };
        const error = await backendAPI.validateCurriculum(newProg.programCode, newProg.curriculumYear, editingProgCode, programs);
        if (error) return alert(error);

        if (editingProgCode) {
            setPrograms(programs.map(p => p.programCode === editingProgCode ? newProg : p));
            pushAudit("UPDATED_CURRICULUM", newProg.programCode);
        } else {
            setPrograms([...programs, newProg]);
            pushAudit("CREATED_CURRICULUM", newProg.programCode);
        }
        setShowProgramForm(false);
        setSelectedProgram(newProg);
    };

    const handleDeleteProgram = () => {
        if (!editingProgCode || !window.confirm(`Are you sure you want to permanently delete curriculum ${editingProgCode}?`)) return;
        setPrograms(programs.filter(p => p.programCode !== editingProgCode));
        pushAudit("DELETED_CURRICULUM", editingProgCode);
        setShowProgramForm(false);
        setSelectedProgram(null);
    };

    const handleSaveCourse = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!selectedProgram) return;

        if (courseForm.semester === "" || courseForm.classification === "") {
            return alert("Please select a valid semester and classification.");
        }

        const strictPayload = {
            ...courseForm,
            semester: courseForm.semester as "1st Semester" | "2nd Semester" | "Midyear",
            classification: courseForm.classification as "Major" | "Minor"
        };

        const { coursesData, programCoursesData, error } = await backendAPI.saveCourseToCurriculum(
            strictPayload, selectedProgram, editingCourseCode, courses, programCourses
        );

        if (error) return alert(error);

        if (coursesData) setCourses(coursesData);
        if (programCoursesData) setProgramCourses(programCoursesData);

        const code = courseForm.courseCode.trim().toUpperCase();
        if (editingCourseCode) pushAudit("UPDATED_COURSE_IN_CURRICULUM", `${selectedProgram.programCode} -> ${code}`);
        else pushAudit("ADDED_COURSE_TO_CURRICULUM", `${selectedProgram.programCode} -> ${code}`);

        setShowCourseForm(false);
    };

    const handleDeleteCourse = (courseCode: string) => {
        if (!selectedProgram || !window.confirm(`Remove ${courseCode} from curriculum?`)) return;
        // FIXED: Added precise PROGRAM_COURSE typings to the callback parameters
        setProgramCourses((prev: PROGRAM_COURSE[]) => prev.filter((pc: PROGRAM_COURSE) => !(pc.programCode === selectedProgram.programCode && pc.courseCode === courseCode)));
        pushAudit("REMOVED_COURSE_FROM_CURRICULUM", `${selectedProgram.programCode} -> ${courseCode}`);
    };

    const years = [1, 2, 3, 4];
    const semesters = ["1st Semester", "2nd Semester", "Midyear"];

    return (
        <div className="flex w-full flex-col gap-6 p-6 lg:h-full lg:flex-row lg:overflow-hidden lg:p-8">
            <div className="flex w-full flex-col gap-4 lg:w-1/3 lg:shrink-0 lg:overflow-y-auto lg:pr-2">
                <div className="flex items-center justify-between">
                    <div><h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Program Catalog</h2><p className="text-[11px] text-slate-500 dark:text-slate-400">Manage institutional curriculums.</p></div>
                    {can('manage_curriculum') && (
                        <button onClick={() => openProgramForm()} className="flex items-center justify-center rounded-lg bg-blue-700 dark:bg-blue-600 p-2 text-white shadow-sm transition hover:bg-blue-800 dark:hover:bg-blue-700"><I.Plus className="h-5 w-5" /></button>
                    )}
                </div>
                {showProgramForm && (
                    <form onSubmit={handleSaveProgram} className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm transition-colors">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100">{editingProgCode ? "Edit Curriculum" : "New Curriculum"}</h3>
                        <input required placeholder="Program Code (e.g. BSCS)" value={progForm.code} onChange={e => setProgForm({...progForm, code: e.target.value.toUpperCase()})} className="rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                        <input required placeholder="Descriptive Title" value={progForm.title} onChange={e => setProgForm({...progForm, title: e.target.value})} className="rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                        <div className="flex gap-2">
                            <input required placeholder="Curriculum Year (e.g., 2018-2019)" value={progForm.year} onChange={e => setProgForm({...progForm, year: e.target.value})} className="w-1/2 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                            <input required type="number" step="0.5" placeholder="Pass Threshold" value={progForm.threshold} onChange={e => setProgForm({...progForm, threshold: e.target.value})} className="w-1/2 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                        </div>
                        <div className="mt-2 flex gap-2">
                            {editingProgCode && (
                                <button type="button" onClick={handleDeleteProgram} className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 transition hover:bg-red-100 dark:hover:bg-red-900/50"><I.X className="h-4 w-4" /></button>
                            )}
                            <button type="button" onClick={() => setShowProgramForm(false)} className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                            <button type="submit" className="flex-1 rounded-lg bg-blue-700 dark:bg-blue-600 py-2 text-sm font-bold text-white transition hover:bg-blue-800 dark:hover:bg-blue-700">Save Program</button>
                        </div>
                    </form>
                )}
                <div className="relative shrink-0">
                    <I.Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input type="text" placeholder="Search by Code or Title..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-700 dark:focus:border-blue-500" />
                </div>
                <div className="flex flex-col gap-2 pb-4">
                    {filteredPrograms.map(program => (
                        <button key={program.programCode} onClick={() => { setSelectedProgram(program); setShowCourseForm(false); }} className={`group flex w-full flex-col items-start rounded-xl border p-4 text-left shadow-sm transition ${selectedProgram?.programCode === program.programCode ? "border-blue-700 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>
                            <div className="flex w-full items-start justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="font-bold text-slate-800 dark:text-slate-200">{program.programCode}</div>
                                    {can('manage_curriculum') && (<div onClick={(e) => { e.stopPropagation(); openProgramForm(program); }} className="rounded p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300"><I.Edit2 className="h-3.5 w-3.5" /></div>)}
                                </div>
                                <span className="rounded bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600">{programCourses.filter(pc => pc.programCode === program.programCode).length} Courses</span>
                            </div>
                            <div className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">{program.programTitle}</div>
                            <div className="mt-2 inline-block rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600">Effective Year: {program.curriculumYear}</div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm transition-colors">
                {selectedProgram ? (
                    <>
                        <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-5">
                            <div className="flex items-center justify-between">
                                <div><h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{selectedProgram.programTitle}</h2><div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Effective Year: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedProgram.curriculumYear}</span></div></div>
                                {can('manage_curriculum') ? (<button onClick={() => openCourseForm()} className="flex items-center gap-2 rounded-lg bg-slate-800 dark:bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 dark:hover:bg-blue-500 transition">+ Add Subject</button>) : (<div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-500"><I.Warning className="h-4 w-4" />Read-Only Mode</div>)}
                            </div>
                        </div>
                        {showCourseForm && (
                            <form onSubmit={handleSaveCourse} className="border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-5 shadow-inner transition-colors">
                                <div className="mb-3 font-bold text-slate-700 dark:text-slate-300">{editingCourseCode ? "Edit Subject" : "New Subject"}</div>
                                <div className="grid grid-cols-4 gap-3">
                                    <input required placeholder="Code (e.g. CS40)" value={courseForm.courseCode} onChange={e => setCourseForm({...courseForm, courseCode: e.target.value.toUpperCase()})} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 disabled:opacity-60" disabled={!!editingCourseCode} />
                                    <input required placeholder="Descriptive Title" value={courseForm.title} onChange={e => setCourseForm({...courseForm, title: e.target.value})} className="col-span-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500" />
                                    <input required type="number" placeholder="Units" value={courseForm.units} onChange={e => setCourseForm({...courseForm, units: e.target.value})} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500" />
                                    <select required value={courseForm.yearLevel} onChange={e => setCourseForm({...courseForm, yearLevel: e.target.value})} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500"><option value="" disabled hidden>Year Lvl...</option>{years.map(y => <option key={y} value={y}>Year {y}</option>)}</select>
                                    <select required value={courseForm.semester} onChange={e => setCourseForm({...courseForm, semester: e.target.value as SemesterType})} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500"><option value="" disabled hidden>Semester...</option><option value="1st Semester">1st Semester</option><option value="2nd Semester">2nd Semester</option><option value="Midyear">Mid-Year</option></select>
                                    <select required value={courseForm.classification} onChange={e => setCourseForm({...courseForm, classification: e.target.value as ClassifType})} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500"><option value="" disabled hidden>Type...</option><option>Major</option><option>Minor</option></select>
                                    <input placeholder="Prereqs (e.g. CS31)" value={courseForm.prerequisites} onChange={e => setCourseForm({...courseForm, prerequisites: e.target.value.toUpperCase()})} className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500" />
                                </div>
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="flex gap-4 text-sm font-semibold text-slate-700 dark:text-slate-300"><label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={courseForm.isCQPAIncluded} onChange={e => setCourseForm({...courseForm, isCQPAIncluded: e.target.checked})} className="h-4 w-4 accent-blue-700" /> Count in CQPA</label></div>
                                    <div className="flex gap-2"><button type="button" onClick={() => setShowCourseForm(false)} className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition">Cancel</button><button type="submit" className="rounded-lg bg-blue-700 dark:bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-800 dark:hover:bg-blue-700 transition">Save Course</button></div>
                                </div>
                            </form>
                        )}
                        <div className="flex-1 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/30 p-5 transition-colors">
                            <div className="flex flex-col gap-6">
                                {years.map(year => (
                                    <div key={year}>
                                        {semesters.map(sem => {
                                            const coursesList = getCourses(year, sem);
                                            if (coursesList.length === 0) return null;
                                            return (
                                                <div key={`${year}-${sem}`} className="mb-6 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm transition-colors">
                                                    <div className="border-b border-slate-100 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Year {year} • {sem === "Midyear" ? "Mid-Year" : sem}</div>
                                                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                                                        <thead className="border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] uppercase text-slate-400 dark:text-slate-500">
                                                        <tr><th className="px-5 py-3 font-semibold">Course Code</th><th className="px-5 py-3 font-semibold">Title</th><th className="px-5 py-3 font-semibold text-center">Units</th><th className="px-5 py-3 font-semibold text-center">Pre-reqs</th><th className="px-5 py-3 font-semibold text-center">Flags</th><th className="px-5 py-3 font-semibold text-right">Actions</th></tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                        {coursesList.map(course => {
                                                            const isMatch = searchQuery && (course.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) || course.courseTitle.toLowerCase().includes(searchQuery.toLowerCase()));
                                                            return (
                                                                <tr key={course.courseCode} className={`transition ${isMatch ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
                                                                    <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-200">{course.courseCode}</td><td className="px-5 py-3 text-xs">{course.courseTitle}</td><td className="px-5 py-3 text-center font-mono">{course.courseUnits}</td><td className="px-5 py-3 text-center text-xs font-mono text-slate-500 dark:text-slate-500">None</td>
                                                                    <td className="px-5 py-3 text-center"><div className="flex justify-center gap-1">{course.majorMinorClassif === 'Major' && <span className="rounded bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:text-blue-400">MAJOR</span>}{course.isCQPAIncluded && <span className="rounded bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:text-blue-400">CQPA</span>}</div></td>
                                                                    <td className="px-5 py-3 text-right">{can('manage_curriculum') && (<div className="flex items-center justify-end gap-2"><button onClick={() => openCourseForm(course)} className="rounded p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-blue-400 transition"><I.Edit2 className="h-4 w-4" /></button><button onClick={() => handleDeleteCourse(course.courseCode)} className="rounded p-1.5 text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-coral dark:hover:text-red-400 transition"><I.X className="h-4 w-4" /></button></div>)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (<div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-600"><I.Book className="mb-4 h-12 w-12 opacity-30" /><h3 className="text-lg font-bold text-slate-600 dark:text-slate-500">No Curriculum Selected</h3></div>)}
            </div>
        </div>
    );
}