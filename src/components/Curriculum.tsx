// src/components/Curriculum.tsx
import React, { useState, useRef } from "react";
import { useStore } from "../store/store";
import type { COURSE_PREREQUISITE, DEGREE_PROGRAM, PROGRAM_COURSE } from "../store/types";
import { backendAPI } from "../backend/api";
import * as I from "./icons";

const formatCourseCode = (val: string) => {
    let c = val.replace(/\s+/g, "").toUpperCase();
    const match = c.match(/\d/);
    if (!match) return c;
    const idx = match.index!;
    let prefix = c.substring(0, idx);
    let suffix = c.substring(idx);

    if (prefix.endsWith("E") && prefix.length > 2) {
        prefix = prefix.substring(0, prefix.length - 1);
        suffix = "E" + suffix;
    }
    return `${prefix}${suffix}`;
};

const formatPrereqs = (
    prereqs: COURSE_PREREQUISITE[],
    programCode: string,
    allProgramCourses: PROGRAM_COURSE[]
): string => {
    if (prereqs.length === 0) return "None";

    const progCourses = allProgramCourses.filter(pc => pc.programCode === programCode);

    // Task 1: Curriculum Timeframe Grouping
    const blocks: { yearLevel: number, termSem: "1st Semester" | "2nd Semester" | "Midyear", pcs: PROGRAM_COURSE[] }[] = [];

    for (let y = 1; y <= 4; y++) {
        for (const s of ["1st Semester", "2nd Semester", "Midyear"] as const) {
            const pcs = progCourses.filter(pc => pc.yearLevel === y && pc.termSem === s);
            if (pcs.length > 0) {
                blocks.push({ yearLevel: y, termSem: s, pcs });
            }
        }
    }

    // Task 2: Prerequisite Intersection Scan
    const prereqPCIDs = new Set(prereqs.map(pr => pr.prereqProgramCourseID));
    let startBlockIndex = -1;
    let endBlockIndex = -1;

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const blockIDs = block.pcs.map(pc => pc.programCourseID);
        const allInBlockArePrereqs = blockIDs.every(id => prereqPCIDs.has(id));
        const someInBlockArePrereqs = blockIDs.some(id => prereqPCIDs.has(id));

        if (allInBlockArePrereqs) {
            if (startBlockIndex === -1) startBlockIndex = i;
            endBlockIndex = i;
        } else if (someInBlockArePrereqs) {
            startBlockIndex = -1;
            break;
        } else {
            if (startBlockIndex !== -1) {
                const sequenceIDs = new Set<string>();
                for (let j = startBlockIndex; j <= endBlockIndex; j++) {
                    blocks[j].pcs.forEach(pc => sequenceIDs.add(pc.programCourseID));
                }
                if (sequenceIDs.size !== prereqPCIDs.size) {
                    startBlockIndex = -1;
                }
                break;
            }
        }
    }

    let isContiguousComplete = (startBlockIndex !== -1 && endBlockIndex !== -1);

    if (isContiguousComplete) {
        let totalCoursesInBlocks = 0;
        for (let i = startBlockIndex; i <= endBlockIndex; i++) {
            totalCoursesInBlocks += blocks[i].pcs.length;
        }
        // Fallback to individual strings if there's only 1 subject in the contiguous blocks, or if the size mismatches
        if (totalCoursesInBlocks !== prereqPCIDs.size || totalCoursesInBlocks < 2) {
            isContiguousComplete = false;
        }
    }

    // Task 3: Dynamic String Rendering
    if (isContiguousComplete && endBlockIndex >= 0) {
        const startBlock = blocks[startBlockIndex];
        const endBlock = blocks[endBlockIndex];

        const formatSem = (sem: string) => sem === "Midyear" ? "Midyear" : sem;
        const formatYearText = (y: number) => {
            if (y === 1) return "1st Year";
            if (y === 2) return "2nd Year";
            if (y === 3) return "3rd Year";
            return `${y}th Year`;
        };

        const startText = `${formatYearText(startBlock.yearLevel)} ${formatSem(startBlock.termSem)}`;
        const endText = `${formatYearText(endBlock.yearLevel)} ${formatSem(endBlock.termSem)}`;

        if (startBlock === endBlock) {
            return `All ${startText} subjects`;
        }
        return `All ${startText} to ${endText} subjects`;
    }

    // Fallback
    const prereqCodesString = prereqs.map(pr => {
        const prereqPC = allProgramCourses.find(pc => pc.programCourseID === pr.prereqProgramCourseID);
        return prereqPC ? prereqPC.courseCode : null;
    }).filter(Boolean).join(", ");

    return prereqCodesString || "None";
};

export default function Curriculum() {
    const { programs, setPrograms, courses, setCourses, programCourses, setProgramCourses, coursePrerequisites, setCoursePrerequisites, pushAudit, can } = useStore();

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedProgram, setSelectedProgram] = useState<DEGREE_PROGRAM | null>(null);
    const isProcessingRef = useRef(false);

    const [showProgramForm, setShowProgramForm] = useState(false);
    const [editingProgCode, setEditingProgCode] = useState<string | null>(null);
    const [progForm, setProgForm] = useState({ code: "", title: "", year: "" });

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

    const [showArchived, setShowArchived] = useState(false);

    const filteredPrograms = programs.filter(p => {
        if (!showArchived && (p as any).isArchived) return false;

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
            setProgForm({ code: prog.programCode, title: prog.programTitle, year: prog.curriculumYear });
            setEditingProgCode(prog.programCode);
        } else {
            setProgForm({ code: "", title: "", year: "" });
            setEditingProgCode(null);
        }
        setShowProgramForm(true);
    };

    const openCourseForm = (course?: PROGRAM_COURSE & { courseTitle: string, courseUnits: number }) => {
        if (course) {
            const prereqs = coursePrerequisites.filter(pr => pr.programCourseID === course.programCourseID);
            const prereqCodesString = prereqs.map(pr => {
                const prereqPC = programCourses.find(pc => pc.programCourseID === pr.prereqProgramCourseID);
                return prereqPC ? prereqPC.courseCode : null;
            }).filter(Boolean).join(", ");

            setCourseForm({
                courseCode: course.courseCode, title: course.courseTitle, units: course.courseUnits.toString(),
                yearLevel: course.yearLevel.toString(), semester: course.termSem, classification: course.majorMinorClassif,
                isCQPAIncluded: course.isCQPAIncluded, prerequisites: prereqCodesString
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
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        if (!/^\d{4}-\d{4}$/.test(progForm.year)) {
            isProcessingRef.current = false;
            return alert("Invalid School Year format. Please use YYYY-YYYY (e.g., 2024-2025).");
        }

        const [startYear, endYear] = progForm.year.split('-').map(Number);
        if (endYear - startYear !== 1) {
            isProcessingRef.current = false;
            return alert("Invalid School Year. The end year must be exactly one year after the start year (e.g., 2024-2025).");
        }

        const trimmedCode = progForm.code.trim();
        const trimmedTitle = progForm.title.trim();

        if (!trimmedCode || !trimmedTitle) {
            isProcessingRef.current = false;
            return alert("Program code and title are required.");
        }

        const newProg: DEGREE_PROGRAM = {
            programCode: trimmedCode.toUpperCase(),
            programTitle: trimmedTitle,
            curriculumYear: progForm.year
        };

        const { data, error } = await backendAPI.saveProgram(newProg, editingProgCode, programs);

        if (error) {
            isProcessingRef.current = false;
            return alert(error);
        }

        if (data) setPrograms(data);

        pushAudit(editingProgCode ? "UPDATED_CURRICULUM" : "CREATED_CURRICULUM", newProg.programCode);
        setShowProgramForm(false);
        setSelectedProgram(newProg);
        isProcessingRef.current = false;
    };

    const handleDeleteProgram = async () => {
        if (!editingProgCode || !window.confirm(`Are you sure you want to archive curriculum ${editingProgCode}?`)) return;

        const { programsData, programCoursesData, coursePrerequisitesData, coursesData, error } = await backendAPI.deleteProgramAndUniqueCourses(
            editingProgCode, programs, programCourses, coursePrerequisites, courses
        );

        if (error) return alert(`Deletion failed: ${error}`);

        if (programsData) setPrograms(programsData);
        if (programCoursesData) setProgramCourses(programCoursesData);
        if (coursePrerequisitesData) setCoursePrerequisites(coursePrerequisitesData);
        if (coursesData) setCourses(coursesData);

        pushAudit("ARCHIVED_CURRICULUM", editingProgCode);
        setShowProgramForm(false);
        setSelectedProgram(null);
    };

    const handleRestoreProgram = async () => {
        if (!editingProgCode || !window.confirm(`Are you sure you want to restore curriculum ${editingProgCode}?`)) return;

        const { programsData, error } = await backendAPI.restoreProgram(editingProgCode, programs);
        if (error) return alert(`Restore failed: ${error}`);

        if (programsData) setPrograms(programsData);

        pushAudit("RESTORED_CURRICULUM", editingProgCode);
        setShowProgramForm(false);
        setSelectedProgram(programsData?.find(p => p.programCode === editingProgCode) || null);
    };

    const handleSaveCourse = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!selectedProgram || isProcessingRef.current) return;
        isProcessingRef.current = true;

        if (courseForm.semester === "" || courseForm.classification === "") {
            isProcessingRef.current = false;
            return alert("Please select a valid semester and classification.");
        }

        const unitsNum = Number(courseForm.units);
        if (isNaN(unitsNum) || unitsNum < 0) {
            isProcessingRef.current = false;
            return alert("Course units cannot be negative. Use 0 for non-credited subjects (e.g., PEP).");
        }

        const normalizedInputCode = courseForm.courseCode.replace(/\s+/g, "").toUpperCase();
        const isDuplicate = programCourses.some(pc =>
            pc.programCode === selectedProgram.programCode &&
            pc.courseCode.replace(/\s+/g, "").toUpperCase() === normalizedInputCode &&
            pc.courseCode !== editingCourseCode
        );

        if (isDuplicate) {
            isProcessingRef.current = false;
            return alert(`Course code '${courseForm.courseCode}' already exists in this curriculum.`);
        }

        const strictPayload = {
            ...courseForm,
            semester: courseForm.semester as "1st Semester" | "2nd Semester" | "Midyear",
            classification: courseForm.classification as "Major" | "Minor"
        };

        const { coursesData, programCoursesData, coursePrerequisitesData, error } = await backendAPI.saveCourseToCurriculum(
            strictPayload, selectedProgram, editingCourseCode, courses, programCourses, coursePrerequisites
        );

        if (error) {
            isProcessingRef.current = false;
            return alert(error);
        }

        if (coursesData) setCourses(coursesData);
        if (programCoursesData) setProgramCourses(programCoursesData);
        if (coursePrerequisitesData) setCoursePrerequisites(coursePrerequisitesData);

        const code = courseForm.courseCode.trim().toUpperCase();
        if (editingCourseCode) pushAudit("UPDATED_COURSE_IN_CURRICULUM", `${selectedProgram.programCode} ->${code}`);
        else pushAudit("ADDED_COURSE_TO_CURRICULUM", `${selectedProgram.programCode} ->${code}`);

        setShowCourseForm(false);
        isProcessingRef.current = false;
    };

    const handleDeleteCourse = async (courseCode: string) => {
        if (!selectedProgram || !window.confirm(`Are you sure you want to permanently remove ${courseCode} from the curriculum?`)) return;

        const { programCoursesData, coursePrerequisitesData, error } = await backendAPI.deleteCourseFromCurriculum(
            selectedProgram.programCode, courseCode, programCourses, coursePrerequisites
        );

        if (error) return alert(`Deletion failed: ${error}`);

        if (programCoursesData) setProgramCourses(programCoursesData);
        if (coursePrerequisitesData) setCoursePrerequisites(coursePrerequisitesData);

        pushAudit("REMOVED_COURSE_FROM_CURRICULUM", `${selectedProgram.programCode} -> ${courseCode}`);
    };

    const years = [1, 2, 3, 4];
    const semesters = ["1st Semester", "2nd Semester", "Midyear"];

    return (
        <div className="flex w-full flex-col gap-6 p-6 lg:h-full lg:flex-row lg:overflow-hidden lg:p-8">

            <div className="flex w-full flex-col lg:h-full lg:w-1/3 lg:shrink-0 lg:pr-2">

                <div className="flex flex-col gap-4 shrink-0 pb-4">
                    <div className="flex items-center justify-between">
                        <div><h2 className="text-xl font-bold text-slate-800">Program Catalog</h2><p className="text-[11px] text-slate-500">Manage institutional curriculums.</p></div>
                        {can('manage_curriculum') && (
                            <button onClick={() => openProgramForm()} className="flex items-center justify-center rounded-lg bg-blue-700 p-2 text-white shadow-sm transition hover:bg-blue-800"><I.Plus className="h-5 w-5" /></button>
                        )}
                    </div>
                    {showProgramForm && (
                        <form onSubmit={handleSaveProgram} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors">
                            <h3 className="font-bold text-slate-800">{editingProgCode ? "Edit Curriculum" : "New Curriculum"}</h3>
                            <input required placeholder="Program Code (e.g. BSCS)" value={progForm.code} onChange={e => setProgForm({ ...progForm, code: e.target.value.toUpperCase() })} className="rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:border-blue-700 transition-colors" />
                            <input required placeholder="Descriptive Title" value={progForm.title} onChange={e => setProgForm({ ...progForm, title: e.target.value })} className="rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:border-blue-700 transition-colors" />
                            <input required placeholder="Curriculum Year (e.g., 2024-2025)" value={progForm.year} onChange={e => setProgForm({ ...progForm, year: e.target.value })} className="w-full rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:border-blue-700 transition-colors" />
                            <div className="mt-2 flex gap-2">
                                {editingProgCode && programs.find(p => p.programCode === editingProgCode && (p as any).isArchived) ? (
                                    <button type="button" onClick={handleRestoreProgram} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-100" title="Restore Curriculum"><I.ArchiveRestore className="h-4 w-4" /></button>
                                ) : editingProgCode ? (
                                    <button type="button" onClick={handleDeleteProgram} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100" title="Archive Curriculum"><I.X className="h-4 w-4" /></button>
                                ) : null}
                                <button type="button" onClick={() => setShowProgramForm(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
                                <button type="submit" className="flex-1 rounded-lg bg-blue-700 py-2 text-sm font-bold text-white transition hover:bg-blue-800">Save Program</button>
                            </div>
                        </form>
                    )}
                    <div className="relative shrink-0">
                        <I.Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Search by Code or Title..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-700" />
                    </div>
                    <label className="flex items-center gap-2 px-1 text-sm text-slate-600 cursor-pointer w-max">
                        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded border-slate-300 text-blue-700 focus:ring-blue-700" />
                        Show Archived Curriculums
                    </label>
                </div>

                {/* FIXED: Applied conditional hidden lg:flex visibility to securely hide the catalog when viewing a curriculum on mobile */}
                <div className={`flex-col gap-2 pb-4 flex-1 overflow-y-auto pr-1 ${selectedProgram && !searchQuery ? 'hidden lg:flex' : 'flex'}`}>
                    {filteredPrograms.map(program => (
                        <button
                            key={program.programCode}
                            onClick={() => { setSelectedProgram(program); setShowCourseForm(false); setSearchQuery(""); }}
                            className={`group shrink-0 flex w-full flex-col items-start rounded-xl border p-4 text-left shadow-sm transition ${selectedProgram?.programCode === program.programCode ? "border-blue-700 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                        >
                            <div className="flex w-full items-start justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="font-bold text-slate-800">{program.programCode}</div>
                                    {(program as any).isArchived && <span className="text-[10px] uppercase font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">Archived</span>}
                                    {can('manage_curriculum') && (<div onClick={(e) => { e.stopPropagation(); openProgramForm(program); }} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><I.Edit2 className="h-3.5 w-3.5" /></div>)}
                                </div>
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">{programCourses.filter(pc => pc.programCode === program.programCode).length} Courses</span>
                            </div>
                            <div className="mt-1 text-xs font-medium text-slate-600">{program.programTitle}</div>
                            <div className="mt-2 inline-block rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 border border-slate-200">Effective Year: {program.curriculumYear}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* FIXED: Applied conditional hidden lg:flex visibility to securely hide the details panel when typing a search query or returning to catalog on mobile */}
            <div className={`flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors ${!selectedProgram || searchQuery ? 'hidden lg:flex' : 'flex'}`}>
                {selectedProgram ? (
                    <>
                        <div className="flex flex-col shrink-0">
                            <div className="border-b border-slate-200 bg-slate-50 p-5">
                                {/* FIXED: Mobile Dismiss Button for Curriculum Details */}
                                <button onClick={() => setSelectedProgram(null)} className="mb-3 flex items-center text-xs font-bold text-slate-500 hover:text-blue-700 lg:hidden transition-colors">
                                    &larr; Back to Catalog
                                </button>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">{selectedProgram.programTitle}</h2>
                                        <div className="mt-1 text-sm text-slate-500">Effective Year: <span className="font-semibold text-slate-700">{selectedProgram.curriculumYear}</span></div>
                                        <div className="mt-3 flex items-center gap-4 text-[10px] font-bold text-slate-500">
                                            <div className="flex items-center gap-1.5"><span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 uppercase">MAJOR</span> <span>CCS course that is subject to 2-strike rule</span></div>
                                            <div className="flex items-center gap-1.5"><span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 uppercase">CQPA</span> <span>Course is included in CQPA calculation</span></div>
                                        </div>
                                    </div>
                                    {can('manage_curriculum') ? (<button onClick={() => openCourseForm()} className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 transition">+ Add Subject</button>) : (<div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"><I.Warning className="h-4 w-4" />Read-Only Mode</div>)}
                                </div>
                            </div>
                            {showCourseForm && (
                                <form onSubmit={handleSaveCourse} className="border-b border-slate-200 bg-slate-100 p-5 shadow-inner transition-colors">
                                    <div className="mb-3 font-bold text-slate-700">{editingCourseCode ? "Edit Subject" : "New Subject"}</div>
                                    <div className="grid grid-cols-4 gap-3">
                                        <input
                                            required
                                            placeholder="Code (e.g. CS40)"
                                            value={courseForm.courseCode}
                                            onChange={e => setCourseForm({ ...courseForm, courseCode: e.target.value.toUpperCase() })}
                                            onBlur={e => setCourseForm({ ...courseForm, courseCode: formatCourseCode(e.target.value) })}
                                            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700 disabled:opacity-60"
                                            disabled={!!editingCourseCode}
                                        />
                                        <input required placeholder="Descriptive Title" value={courseForm.title} onChange={e => setCourseForm({ ...courseForm, title: e.target.value })} className="col-span-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700" />
                                        <input required type="number" placeholder="Units" value={courseForm.units} onChange={e => setCourseForm({ ...courseForm, units: e.target.value })} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700" />
                                        <select required value={courseForm.yearLevel} onChange={e => setCourseForm({ ...courseForm, yearLevel: e.target.value })} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700"><option value="" disabled hidden>Year Lvl...</option>{years.map(y => <option key={y} value={y}>Year {y}</option>)}</select>
                                        <select required value={courseForm.semester} onChange={e => setCourseForm({ ...courseForm, semester: e.target.value as SemesterType })} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700"><option value="" disabled hidden>Semester...</option><option value="1st Semester">1st Semester</option><option value="2nd Semester">2nd Semester</option><option value="Midyear">Mid-Year</option></select>
                                        <select required value={courseForm.classification} onChange={e => setCourseForm({ ...courseForm, classification: e.target.value as ClassifType })} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700"><option value="" disabled hidden>Type...</option><option>Major</option><option>Minor</option></select>

                                        <input
                                            placeholder="Prereqs (e.g. CS 31, CS 35)"
                                            value={courseForm.prerequisites}
                                            onChange={e => setCourseForm({ ...courseForm, prerequisites: e.target.value.toUpperCase() })}
                                            onBlur={e => setCourseForm({ ...courseForm, prerequisites: e.target.value.split(',').map(s => formatCourseCode(s)).filter(s => s.trim() !== "").join(', ') })}
                                            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700"
                                        />
                                    </div>
                                    <div className="mt-4 flex items-center justify-between">
                                        <div className="flex gap-4 text-sm font-semibold text-slate-700"><label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={courseForm.isCQPAIncluded} onChange={e => setCourseForm({ ...courseForm, isCQPAIncluded: e.target.checked })} className="h-4 w-4 accent-blue-700" /> Count in CQPA</label></div>
                                        <div className="flex gap-2"><button type="button" onClick={() => setShowCourseForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition">Cancel</button><button type="submit" className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-bold text-white hover:bg-blue-800 transition">Save Course</button></div>
                                    </div>
                                </form>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto bg-slate-50/30 p-5 transition-colors">
                            <div className="flex flex-col gap-6">
                                {years.map(year => (
                                    <div key={year}>
                                        {semesters.map(sem => {
                                            const coursesList = getCourses(year, sem);
                                            if (coursesList.length === 0) return null;
                                            return (
                                                <div key={`${year}-${sem}`} className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors">
                                                    <div className="border-b border-slate-100 bg-slate-100 px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-600">Year {year} • {sem === "Midyear" ? "Mid-Year" : sem}</div>
                                                    <table className="w-full text-left text-sm text-slate-600">
                                                        <thead className="border-b border-slate-100 bg-white text-[10px] uppercase text-slate-400">
                                                            <tr><th className="px-5 py-3 font-semibold">Course Code</th><th className="px-5 py-3 font-semibold">Title</th><th className="px-5 py-3 font-semibold text-center">Units</th><th className="px-5 py-3 font-semibold text-center">Pre-reqs</th><th className="px-5 py-3 font-semibold text-center">Flags</th><th className="px-5 py-3 font-semibold text-right">Actions</th></tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {coursesList.map(course => {
                                                                const isMatch = searchQuery && (course.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) || course.courseTitle.toLowerCase().includes(searchQuery.toLowerCase()));

                                                                const prereqs = coursePrerequisites.filter(pr => pr.programCourseID === course.programCourseID);
                                                                const displayPrereqs = formatPrereqs(prereqs, selectedProgram.programCode, programCourses);
                                                                const isGenericPrereq = displayPrereqs.startsWith("All ") && displayPrereqs.endsWith(" subjects");

                                                                const prereqCodesString = prereqs.map(pr => {
                                                                    const prereqPC = programCourses.find(pc => pc.programCourseID === pr.prereqProgramCourseID);
                                                                    return prereqPC ? prereqPC.courseCode : null;
                                                                }).filter(Boolean).join(", ");

                                                                return (
                                                                    <tr key={course.courseCode} className={`transition ${isMatch ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                                                                        <td className="px-5 py-3 font-bold text-slate-800">{course.courseCode}</td><td className="px-5 py-3 text-xs">{course.courseTitle}</td><td className="px-5 py-3 text-center font-mono">{course.courseUnits}</td>
                                                                        <td className="px-5 py-3 text-center text-xs font-mono text-slate-500">
                                                                            {isGenericPrereq ? (
                                                                                <div className="group relative inline-block cursor-help">
                                                                                    <span className="block group-hover:hidden underline decoration-dashed underline-offset-4 decoration-slate-300 hover:decoration-blue-400 transition-colors">{displayPrereqs}</span>
                                                                                    <span className="hidden group-hover:block animate-in fade-in zoom-in-95 duration-200">{prereqCodesString}</span>
                                                                                </div>
                                                                            ) : (
                                                                                <span>{displayPrereqs}</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-5 py-3 text-center">
                                                                            <div className="flex justify-center gap-1">
                                                                                {course.majorMinorClassif === 'Major' &&
                                                                                    <div className="group relative flex items-center justify-center cursor-help">
                                                                                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 transition-colors hover:bg-amber-500 hover:text-white uppercase">MAJOR</span>
                                                                                        <span className="pointer-events-none absolute -top-8 left-1/2 z-10 w-max -translate-x-1/2 rounded bg-slate-800 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">Repeated failure in this course results in Advised to Shift standing</span>
                                                                                    </div>
                                                                                }
                                                                                {course.isCQPAIncluded &&
                                                                                    <div className="group relative flex items-center justify-center cursor-help">
                                                                                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 transition-colors hover:bg-indigo-600 hover:text-white uppercase">CQPA</span>
                                                                                        <span className="pointer-events-none absolute -top-8 left-1/2 z-10 w-max -translate-x-1/2 rounded bg-slate-800 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">This course is included in CQPA calculation</span>
                                                                                    </div>
                                                                                }
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-5 py-3 text-right">{can('manage_curriculum') && (<div className="flex items-center justify-end gap-2"><button onClick={() => openCourseForm(course)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-700 transition"><I.Edit2 className="h-4 w-4" /></button><button onClick={() => handleDeleteCourse(course.courseCode)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-coral transition"><I.X className="h-4 w-4" /></button></div>)}</td>
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
                ) : (<div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-400"><I.Book className="mb-4 h-12 w-12 opacity-30" /><h3 className="text-lg font-bold text-slate-600">No Curriculum Selected</h3></div>)}
            </div>
        </div>
    );
}