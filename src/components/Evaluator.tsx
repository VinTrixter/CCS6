// src/components/Evaluator.tsx
import React, { useState, useEffect, useRef } from "react";
import { useStore } from "../store/store";
import type { PROGRAM_COURSE } from "../store/types";
import { backendAPI, type EnrichedGradeRow, type EnrichedStudent } from "../backend/api";
import ShiftingFormModal from "./ShiftingFormModal";
import * as I from "./icons";

type Tab = "grades" | "history" | "progress" | "remarks";
type AdvisingCategory = "General Note" | "Guidance Referral" | "Policy Warning" | "Shifting Recommended";

const GradeInput = ({ initialValue, onSave, disabled }: { initialValue: string, onSave: (val: string) => void, disabled: boolean }) => {
    const [val, setVal] = useState(initialValue);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVal(initialValue);
    }, [initialValue]);

    const handleBlur = () => {
        if (val !== initialValue) onSave(val);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
    };

    return (
        <input
            type="text"
            disabled={disabled}
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="-"
            className="w-20 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 outline-none transition focus:border-blue-700 dark:focus:border-blue-500 disabled:opacity-60"
        />
    );
};

export default function Evaluator() {
    // FIXED: Extracted pendingLocalTerm and setPendingLocalTerm to enable Term Warping
    const { students, setStudents, programs, courses, programCourses, records, setRecords, remarks, setRemarks, coursePrerequisites, standings, setStandings, activeUser, pushAudit, activeTerm, can, focusedStudentID, setFocusedStudentID, pendingEvaluatorAction, setPendingEvaluatorAction, terms, retentionPolicies, pendingLocalTerm, setPendingLocalTerm } = useStore();

    const selectedStudent = focusedStudentID ? students.find(s => s.studentID === focusedStudentID) || null : null;
    const setSelectedStudent = (student: EnrichedStudent | null) => setFocusedStudentID(student ? student.studentID : null);

    const [leftMode, setLeftMode] = useState<"search" | "new">("search");
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState<Tab>("grades");
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editFormData, setEditFormData] = useState<EnrichedStudent | null>(null);

    const [showExtraCourseDropdown, setShowExtraCourseDropdown] = useState(false);
    const [courseSearch, setCourseSearch] = useState("");

    const dropdownRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowExtraCourseDropdown(false);
            }
        };
        if (showExtraCourseDropdown) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showExtraCourseDropdown]);

    const [dismissedCourses, setDismissedCourses] = useState<string[]>([]);
    const [expandedTerms, setExpandedTerms] = useState<Record<string, boolean>>({});

    const [editingRemarkID, setEditingRemarkID] = useState<string | null>(null);
    const [remarkForm, setRemarkForm] = useState<{ category: AdvisingCategory; content: string }>({ category: "General Note", content: "" });
    const [showShiftingModal, setShowShiftingModal] = useState(false);

    const currentYearStr = new Date().getFullYear().toString();
    const [formData, setFormData] = useState({ studentID: "", firstName: "", middleName: "", lastName: "", shsTrack: "STEM", programCode: "", yearLevel: "", yearEnrolled: currentYearStr });

    const [progFilterClassif, setProgFilterClassif] = useState<string>("All");
    const [progFilterYear, setProgFilterYear] = useState<string>("All");
    const [progFilterSem, setProgFilterSem] = useState<string>("All");

    const [displayRows, setDisplayRows] = useState<EnrichedGradeRow[]>([]);
    const [progressStats, setProgressStats] = useState({ completed: [] as PROGRAM_COURSE[], enrolled: [] as PROGRAM_COURSE[], remaining: [] as PROGRAM_COURSE[] });
    const [isLoading, setIsLoading] = useState(false);

    const [localTerm, setLocalTerm] = useState<string>(activeTerm);

    const searchResults = students.filter(s => {
        const compositeString = `${s.studFirstName} ${s.studLastName} ${s.studLastName}, ${s.studFirstName} ${s.studentID}`.toLowerCase();
        return compositeString.includes(searchQuery.toLowerCase().trim());
    });

    const termStanding = standings.find(ts => ts.studentID === selectedStudent?.studentID && ts.termID === localTerm);
    const historyStandings = standings.filter(ts => ts.studentID === selectedStudent?.studentID);

    let currentStatus = termStanding?.termAcademicStatus as string || "No Data";
    if (currentStatus.toUpperCase() === 'ADVISED-TO-SHIFT') currentStatus = 'Advised to Shift';
    if (currentStatus.toUpperCase() === 'ON-PROBATION') currentStatus = 'On-Probation';
    if (currentStatus.toUpperCase() === 'REGULAR') currentStatus = 'Regular';
    if (currentStatus.toUpperCase() === 'UNENCODED') currentStatus = 'Unencoded';

    const localTermDetails = terms.find(t => t.termID === localTerm);
    const activeTermObj = terms.find(t => t.termID === activeTerm);

    const availableTerms = terms.filter(t => {
        if (!activeTermObj) return false;
        if (selectedStudent && selectedStudent.yearEnrolled) {
            const termStartYear = parseInt(t.termSY.split('-')[0]);
            if (termStartYear < selectedStudent.yearEnrolled) return false;
        }
        if (t.termSY !== activeTermObj.termSY) return t.termSY.localeCompare(activeTermObj.termSY) <= 0;
        const semWeights: Record<string, number> = { "1st Semester": 1, "2nd Semester": 2, "Midyear": 3 };
        return semWeights[t.termSem] <= semWeights[activeTermObj.termSem];
    }).sort((a, b) => {
        if (a.termSY !== b.termSY) return b.termSY.localeCompare(a.termSY);
        const semWeights: Record<string, number> = { "1st Semester": 1, "2nd Semester": 2, "Midyear": 3 };
        return semWeights[b.termSem] - semWeights[a.termSem];
    });

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalTerm(activeTerm);
    }, [activeTerm, selectedStudent?.studentID]);

    // FIXED: Dedicated hook intercepting Term Warping commands from the Dashboard
    useEffect(() => {
        if (pendingLocalTerm && localTerm !== pendingLocalTerm) {
            setLocalTerm(pendingLocalTerm);
            setPendingLocalTerm(null);
        }
    }, [pendingLocalTerm, localTerm, setPendingLocalTerm]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;

        if (pendingEvaluatorAction === "new") {
            timer = setTimeout(() => {
                setLeftMode("new");
                setFocusedStudentID(null);
                setIsEditingProfile(false);
                setPendingEvaluatorAction(null);
            }, 0);
        } else if (focusedStudentID) {
            timer = setTimeout(() => {
                setLeftMode("search");
                setActiveTab("grades");
                setIsEditingProfile(false);
            }, 0);
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [pendingEvaluatorAction, focusedStudentID, setFocusedStudentID, setPendingEvaluatorAction]);

    useEffect(() => {
        let isMounted = true;
        const fetchBackendData = async () => {
            setIsLoading(true);
            const rows = await backendAPI.getEnrichedGrades(selectedStudent, localTerm, localTermDetails, programCourses, courses, records, coursePrerequisites, dismissedCourses, activeTerm, retentionPolicies);
            const prog = await backendAPI.getCurriculumProgress(selectedStudent, activeTerm, programCourses, records, retentionPolicies);
            if (isMounted) { setDisplayRows(rows); setProgressStats(prog); setIsLoading(false); }
        };
        void fetchBackendData();
        return () => { isMounted = false; };
    }, [selectedStudent, localTerm, localTermDetails, programCourses, courses, records, coursePrerequisites, dismissedCourses, activeTerm, retentionPolicies]);

    const handleIDChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 3) {
            val = `${val.slice(0,2)}-${val.slice(2,3)}-${val.slice(3, 10)}`;
        } else if (val.length > 2) {
            val = `${val.slice(0,2)}-${val.slice(2,3)}`;
        }
        setFormData({...formData, studentID: val});
    };

    const handleAutoPopulate = async () => {
        if (!activeUser || !selectedStudent || !localTermDetails) return;
        setIsLoading(true);

        const { data: newRecords, newStanding, error } = await backendAPI.generateAutoPopulateRecords(
            selectedStudent, localTerm, localTermDetails, programCourses, records, activeUser.userID
        );

        if (error) {
            alert(error);
        } else if (newRecords && newRecords.length > 0) {
            setRecords([...records, ...newRecords]);
            if (newStanding) {
                setStandings([...standings, newStanding]);
            }
            pushAudit(`AUTO_POPULATED_GRADES_${localTerm}`, selectedStudent.studentID);
        }

        setIsLoading(false);
    };

    const handleAddExtraCourse = async (courseCode: string) => {
        if (!activeUser || !selectedStudent) return;
        const activeProgram = programs.find(p => p.programCode === selectedStudent.programCode);
        if (!activeProgram) return;

        const { recordsData, standingsData, error } = await backendAPI.upsertGrade(
            courseCode, "", undefined, selectedStudent, localTerm, records,
            programCourses, courses, activeProgram, standings, activeUser.userID, terms, retentionPolicies
        );

        if (error) return alert(error);
        if (recordsData) setRecords(recordsData);
        if (standingsData) setStandings(standingsData);
        pushAudit(`ADDED_SUBJECT_${localTerm}`, selectedStudent.studentID);
        setShowExtraCourseDropdown(false);
        setCourseSearch("");
    };

    const handleGradeChange = async (code: string, val: string, recordID?: string) => {
        if (!activeUser || !selectedStudent) return;
        const activeProgram = programs.find(p => p.programCode === selectedStudent.programCode);
        if (!activeProgram) return;

        const { recordsData, standingsData, error } = await backendAPI.upsertGrade(
            code, val, recordID, selectedStudent, localTerm, records,
            programCourses, courses, activeProgram, standings, activeUser.userID, terms, retentionPolicies
        );

        if (error) return alert(error);
        if (recordsData) setRecords(recordsData);
        if (standingsData) setStandings(standingsData);
        if (!recordID) pushAudit("ENCODED_NEW_GRADE", selectedStudent.studentID);
    };

    const handleDeleteRow = async (code: string, recordID?: string) => {
        if (!activeUser || !selectedStudent || !recordID) return;
        const activeProgram = programs.find(p => p.programCode === selectedStudent.programCode);
        if (!activeProgram) return;

        const { recordsData, standingsData, error } = await backendAPI.deleteGradeRow(
            recordID, records, selectedStudent, localTerm,
            programCourses, courses, activeProgram, standings, terms, retentionPolicies
        );

        if (error) return alert(error);
        if (recordsData) setRecords(recordsData);
        if (standingsData) setStandings(standingsData);
        setDismissedCourses([...dismissedCourses, code]);
        pushAudit("DELETED_GRADE_RECORD", recordID);
    };

    const handleCreateStudent = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const cleanID = formData.studentID.replace(/\D/g, '');
        if (cleanID.length < 7) {
            return alert("Invalid Student ID format. It must contain at least 7 digits (e.g., XX-X-XXXX).");
        }

        if (!formData.firstName || !formData.lastName) return alert("Required fields missing.");

        const newStudent: EnrichedStudent = {
            studentID: formData.studentID, studFirstName: formData.firstName, studMiddleName: formData.middleName, studLastName: formData.lastName,
            shsTrack: formData.shsTrack as EnrichedStudent["shsTrack"], yearLevel: Number(formData.yearLevel) as EnrichedStudent["yearLevel"], accountStatus: "Active", programCode: formData.programCode,
            yearEnrolled: Number(formData.yearEnrolled)
        };
        const { data, error } = await backendAPI.createStudent(newStudent, students);
        if (error) return alert(error);
        if (data) setStudents(data);
        pushAudit("CREATED_STUDENT_RECORD", formData.studentID);
        setSelectedStudent(newStudent);
        setSearchQuery(""); setActiveTab("grades"); setLeftMode("search"); setDismissedCourses([]);
        setFormData({ studentID: "", firstName: "", middleName: "", lastName: "", shsTrack: "STEM", programCode: "", yearLevel: "", yearEnrolled: currentYearStr });
    };

    const handleUpdateProfile = async () => {
        if (!editFormData || !editFormData.studFirstName.trim() || !editFormData.studLastName.trim()) return alert("Names cannot be empty.");
        const { data, error } = await backendAPI.updateStudent(editFormData, students);
        if (error) return alert(error);
        if (data) setStudents(data);
        setSelectedStudent(editFormData);
        pushAudit("UPDATED_STUDENT_RECORD", editFormData.studentID);
        setIsEditingProfile(false);
    };

    const handleDeleteStudent = async () => {
        if (!selectedStudent) return;
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete the record for ${selectedStudent.studFirstName} ${selectedStudent.studLastName}?`)) return;

        const { data, error } = await backendAPI.deleteStudent(selectedStudent.studentID, students, records, standings, remarks);
        if (error) return alert(error);
        if (data) {
            setStudents(data.students);
            setRecords(data.records);
            setStandings(data.standings);
            setRemarks(data.remarks);
        }
        pushAudit("DELETED_STUDENT_RECORD", selectedStudent.studentID);
        setSelectedStudent(null);
        setIsEditingProfile(false);
        setLeftMode("search");
    };

    const handleSaveRemark = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!activeUser || !remarkForm.content.trim() || !selectedStudent) return;
        const { data, error } = await backendAPI.upsertRemark(remarkForm, editingRemarkID, selectedStudent.studentID, localTerm, activeUser.userID, remarks, standings);
        if (error) return alert(error);
        if (data) setRemarks(data);
        if (editingRemarkID) pushAudit("UPDATED_REMARK", editingRemarkID);
        else pushAudit("ADDED_REMARK", selectedStudent.studentID);
        setEditingRemarkID(null); setRemarkForm({ category: "General Note", content: "" });
    };

    const handleDeleteRemark = async (remarkID: string) => {
        if (!window.confirm("Are you sure you want to delete this advising remark?")) return;
        const { data, error } = await backendAPI.deleteRemark(remarkID, remarks);
        if (error) return alert(error);
        if (data) setRemarks(data);
        pushAudit("DELETED_REMARK", remarkID);
    };

    const filterProgress = (list: PROGRAM_COURSE[]) => list.filter(pc =>
        !(progFilterClassif !== "All" && pc.majorMinorClassif !== progFilterClassif) &&
        !(progFilterYear !== "All" && pc.yearLevel.toString() !== progFilterYear) &&
        !(progFilterSem !== "All" && pc.termSem !== progFilterSem)
    );

    return (
        <div className="flex w-full flex-col gap-6 p-6 lg:h-full lg:flex-row lg:overflow-hidden lg:p-8">
            <div className="flex w-full flex-col gap-4 lg:w-1/3 lg:shrink-0 lg:overflow-y-auto lg:pr-2">
                {can('manage_records') && (
                    <div className="flex shrink-0 gap-1 rounded-lg bg-slate-200/50 dark:bg-slate-800/50 p-1 transition-colors">
                        <button onClick={() => { setLeftMode("search"); setIsEditingProfile(false); }} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${leftMode === "search" ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>Find Record</button>
                        <button onClick={() => { setLeftMode("new"); setSelectedStudent(null); setIsEditingProfile(false); }} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${leftMode === "new" ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>+ New Student</button>
                    </div>
                )}

                {leftMode === "new" && (
                    <form onSubmit={handleCreateStudent} className="flex shrink-0 flex-col gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm transition-colors">
                        <div><h2 className="font-bold text-slate-800 dark:text-slate-100">Register New Student</h2></div>
                        <div className="flex flex-col gap-3">
                            <input required placeholder="Student ID (XX-X-XXXXX)" value={formData.studentID} onChange={handleIDChange} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm font-mono outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                            <input required placeholder="First Name" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                            <input placeholder="Middle Name (Optional)" value={formData.middleName} onChange={e => setFormData({...formData, middleName: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                            <input required placeholder="Last Name" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                            <div className="grid grid-cols-2 gap-3">
                                <select required value={formData.programCode} onChange={e => setFormData({...formData, programCode: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="" disabled hidden>Program...</option>{programs.map(p => <option key={p.programCode} value={p.programCode}>{p.programCode}</option>)}</select>
                                <select required value={formData.yearLevel} onChange={e => setFormData({...formData, yearLevel: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="" disabled hidden>Year Lvl...</option>{[1,2,3,4].map(y => <option key={y} value={y}>Year {y}</option>)}</select>
                                <select required value={formData.shsTrack} onChange={e => setFormData({...formData, shsTrack: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="" disabled hidden>SHS Track...</option><option>STEM</option><option>HUMSS</option><option>ABM</option><option>GAS</option><option>TVL</option></select>
                                <input required type="number" placeholder="Year Enrolled" value={formData.yearEnrolled} onChange={e => setFormData({...formData, yearEnrolled: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                            </div>
                        </div>
                        <button type="submit" className="mt-2 w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 transition-colors">Create Record</button>
                    </form>
                )}

                {leftMode === "search" && (
                    <>
                        <div className="relative shrink-0">
                            <I.Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                            <input type="text" placeholder="Search by ID or Name" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-700 dark:focus:border-blue-500" />
                        </div>
                        {searchQuery && (
                            <div className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
                                {searchResults.map(s => (
                                    <button key={s.studentID} onClick={() => { setSelectedStudent(s); setSearchQuery(""); setLeftMode("search"); setActiveTab("grades"); setIsEditingProfile(false); }} className="flex w-full flex-col items-start border-b border-slate-100 dark:border-slate-700 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-800 dark:text-slate-200">{s.studLastName}, {s.studFirstName}</span>
                                            {s.accountStatus !== 'Active' && <span className="rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">{s.accountStatus}</span>}
                                        </div>
                                        <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{s.studentID} • {s.programCode}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                        {selectedStudent && (
                            <div className="flex flex-col gap-4 pb-4">
                                {currentStatus === 'Advised to Shift' && !isEditingProfile && (
                                    <div className="flex shrink-0 items-start justify-between gap-3 rounded-lg border border-coral dark:border-red-900 bg-coral-tint dark:bg-red-900/30 p-4 text-coral dark:text-red-400 transition-colors">
                                        <div className="flex items-start gap-3">
                                            <I.Warning className="mt-0.5 h-5 w-5 shrink-0" />
                                            <div>
                                                <div className="font-bold uppercase tracking-wide text-red-800 dark:text-red-300">Advised to Shift</div>
                                                <div className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">Mandatory shifting triggered.</div>
                                            </div>
                                        </div>
                                        {can('generate_forms') && (
                                            <button onClick={() => setShowShiftingModal(true)} className="shrink-0 rounded-md bg-coral dark:bg-red-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-red-600 dark:hover:bg-red-600">
                                                Generate Form
                                            </button>
                                        )}
                                    </div>
                                )}
                                <div className="shrink-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm transition-colors">
                                    <div className="h-16 bg-gradient-to-r from-blue-700 to-blue-900 dark:from-blue-600 dark:to-blue-900"></div>
                                    <div className="px-5 pb-5">
                                        <div className="relative -mt-8 mb-3 flex h-16 w-16 items-center justify-center rounded-xl border-4 border-white dark:border-slate-800 bg-slate-800 dark:bg-slate-700 text-xl font-bold text-white shadow-sm">{selectedStudent.studFirstName.charAt(0)}</div>
                                        <div className="flex items-start justify-between">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-3">
                                                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{selectedStudent.studLastName}, {selectedStudent.studFirstName}</h2>
                                                    {can('manage_records') && !isEditingProfile && (<button onClick={() => { setEditFormData(selectedStudent); setIsEditingProfile(true); }} className="rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 shadow-sm hover:text-blue-700 dark:hover:text-blue-400 transition-colors">Edit Profile</button>)}
                                                </div>
                                                <div className="font-mono text-sm text-slate-500 dark:text-slate-400">{selectedStudent.studentID}</div>
                                            </div>
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm ${currentStatus === 'Advised to Shift' ? 'bg-coral dark:bg-red-700 text-white' : currentStatus === 'On-Probation' ? 'bg-amber dark:bg-amber-700 text-white' : currentStatus === 'Unencoded' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300' : 'bg-blue-700 dark:bg-blue-600 text-white'}`}>{currentStatus}</span>
                                        </div>

                                        {isEditingProfile && editFormData ? (
                                            <div className="mt-5 flex flex-col gap-3 rounded-lg border border-blue-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 text-sm transition-colors">
                                                <input type="text" placeholder="First Name" value={editFormData.studFirstName} onChange={e => setEditFormData({...editFormData, studFirstName: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                                                <input type="text" placeholder="Middle Name" value={editFormData.studMiddleName || ""} onChange={e => setEditFormData({...editFormData, studMiddleName: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                                                <input type="text" placeholder="Last Name" value={editFormData.studLastName} onChange={e => setEditFormData({...editFormData, studLastName: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                                    <select value={editFormData.programCode} onChange={e => setEditFormData({...editFormData, programCode: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors">{programs.map(p => <option key={p.programCode} value={p.programCode}>{p.programCode}</option>)}</select>
                                                    <select value={editFormData.yearLevel} onChange={e => setEditFormData({...editFormData, yearLevel: Number(e.target.value) as EnrichedStudent["yearLevel"]})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors">{[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}</select>
                                                    <select value={editFormData.shsTrack} onChange={e => setEditFormData({...editFormData, shsTrack: e.target.value as EnrichedStudent["shsTrack"]})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors">
                                                        <option>STEM</option><option>HUMSS</option><option>ABM</option><option>GAS</option><option>TVL</option>
                                                    </select>
                                                    <input type="number" placeholder="Year Enrolled" value={editFormData.yearEnrolled} onChange={e => setEditFormData({...editFormData, yearEnrolled: Number(e.target.value)})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                                                </div>
                                                <div className="mt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-3">
                                                    {can('archive_student') ? (
                                                        <button onClick={handleDeleteStudent} className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition">Delete Record</button>
                                                    ) : <div></div>}
                                                    <div className="flex gap-2">
                                                        <button onClick={() => setIsEditingProfile(false)} className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition">Cancel</button>
                                                        <button onClick={handleUpdateProfile} className="rounded-md bg-blue-700 dark:bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-800 dark:hover:bg-blue-700 transition">Save Changes</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-5 grid grid-cols-3 gap-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 text-sm transition-colors">
                                                <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">QPA</div><div className="font-mono text-xl font-bold text-slate-800 dark:text-slate-100">{termStanding?.termQPA?.toFixed(2) || "0.00"}</div></div>
                                                <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">CQPA</div><div className="font-mono text-xl font-bold text-slate-800 dark:text-slate-100">{termStanding?.semCQPA?.toFixed(2) || "0.00"}</div></div>
                                                <div>
                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Account</div>
                                                    <select
                                                        disabled={!can('archive_student')}
                                                        value={selectedStudent.accountStatus}
                                                        onChange={async (e) => {
                                                            const updated = {...selectedStudent, accountStatus: e.target.value as "Active" | "Inactive" | "Graduated"};
                                                            const { data, error } = await backendAPI.updateStudent(updated, students);
                                                            if (error) return alert(error);
                                                            if (data) setStudents(students.map(s => s.studentID === updated.studentID ? updated : s));
                                                            setSelectedStudent(updated);
                                                            pushAudit(`STATUS_CHANGED_TO_${updated.accountStatus.toUpperCase()}`, updated.studentID);
                                                        }}
                                                        className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-1 text-xs font-semibold outline-none focus:border-blue-700 dark:focus:border-blue-500 disabled:opacity-60 transition-colors"
                                                    >
                                                        <option value="Active">Active</option>
                                                        <option value="Inactive">Inactive</option>
                                                        <option value="Graduated">Graduated</option>
                                                    </select>
                                                </div>
                                                <div className="col-span-3 mt-2 grid grid-cols-2 gap-2 border-t border-slate-200 dark:border-slate-700 pt-3 sm:grid-cols-4">
                                                    <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Program</div><div className="font-medium text-slate-700 dark:text-slate-300">{selectedStudent.programCode}</div></div>
                                                    <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Year Lvl</div><div className="font-medium text-slate-700 dark:text-slate-300">Year {selectedStudent.yearLevel}</div></div>
                                                    <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Enrolled</div><div className="font-medium text-slate-700 dark:text-slate-300">AY {selectedStudent.yearEnrolled}</div></div>
                                                    <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Term Profile</div><div className="font-medium text-slate-700 dark:text-slate-300">{localTermDetails?.termSem}</div></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm transition-colors">
                <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-2 pt-2">
                    {[{ id: "grades", label: "Grade Encoding" }, { id: "history", label: "Academic History" }, { id: "progress", label: "Curriculum Progress" }, { id: "remarks", label: "Advising Remarks" }].map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} disabled={!selectedStudent} className={`px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-40 ${activeTab === tab.id && selectedStudent ? "border-b-2 border-blue-700 dark:border-blue-400 text-blue-700 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>{tab.label}</button>
                    ))}
                </div>

                <div className="relative flex-1 overflow-y-auto bg-white dark:bg-slate-800 transition-colors">
                    {isLoading && (<div className="absolute top-2 right-4 z-10 flex items-center justify-center"><div className="animate-pulse text-xs font-bold text-blue-700 dark:text-blue-400">Syncing...</div></div>)}

                    {selectedStudent ? (
                        <>
                            {activeTab === "grades" && (
                                <div className="flex h-full flex-col">
                                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 p-4 flex-wrap gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">Encoded Subjects ({displayRows.length})</div>
                                            <select
                                                value={localTerm}
                                                onChange={e => setLocalTerm(e.target.value)}
                                                className="rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"
                                            >
                                                {availableTerms.map(t => (
                                                    <option key={t.termID} value={t.termID}>
                                                        {t.termSem}, AY {t.termSY} {t.termID === activeTerm ? "(Current)" : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        {can('encode_grades') && (
                                            <div className="flex gap-2">
                                                <button onClick={handleAutoPopulate} className="rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm transition hover:border-blue-700 hover:text-blue-700 dark:hover:border-blue-400 dark:hover:text-blue-400">
                                                    Auto-Populate Term
                                                </button>
                                                <div className="relative">
                                                    <button onClick={() => { setShowExtraCourseDropdown(!showExtraCourseDropdown); setCourseSearch(""); }} className="rounded-md bg-blue-700 dark:bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 dark:hover:bg-blue-700">
                                                        + Add Subject
                                                    </button>
                                                    {showExtraCourseDropdown && (
                                                        <div ref={dropdownRef} className="absolute right-0 top-full z-20 mt-1 max-h-[300px] w-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl">
                                                            <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 shadow-sm">
                                                                <div className="border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Available Curriculum Subjects</div>
                                                                <input type="text" autoFocus value={courseSearch} onChange={e => setCourseSearch(e.target.value)} placeholder="Search course code..." className="w-full border-b border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none" onClick={e => e.stopPropagation()} />
                                                            </div>
                                                            {programCourses.filter(pc => {
                                                                if (pc.programCode !== selectedStudent?.programCode) return false;
                                                                if (displayRows.some(r => r.courseCode === pc.courseCode)) return false;
                                                                if (!pc.courseCode.toLowerCase().includes(courseSearch.toLowerCase())) return false;

                                                                // FIXED: Locks Major subjects strictly to their assigned curriculum semester
                                                                if (pc.majorMinorClassif === 'Major' && localTermDetails && pc.termSem !== localTermDetails.termSem) return false;

                                                                const cohortPolicy = retentionPolicies.find(p => p.programCode === selectedStudent?.programCode && p.effectiveYear === selectedStudent?.yearEnrolled);
                                                                const passThreshold = cohortPolicy ? (pc.majorMinorClassif === 'Major' ? cohortPolicy.majorPassingGrade : cohortPolicy.minorPassingGrade) : 1.0;

                                                                const studentHistory = records.filter(r => r.studentID === selectedStudent?.studentID && r.programCourseID === pc.programCourseID);
                                                                for (const histRec of studentHistory) {
                                                                    if (histRec.gradeRemarks === 'INC') return false;
                                                                    if (histRec.finalGrade !== null && histRec.finalGrade >= passThreshold) return false;
                                                                }
                                                                return true;
                                                            }).map(pc => (
                                                                <button key={pc.courseCode} onClick={() => handleAddExtraCourse(pc.courseCode)} className="flex w-full items-center justify-between border-b border-slate-50 dark:border-slate-700/50 px-4 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 transition">
                                                                    <span className="font-bold text-slate-800 dark:text-slate-200">{pc.courseCode}</span>
                                                                    <span className="text-xs text-slate-400 dark:text-slate-500">{pc.termSem === "Midyear" ? "Mid-Year" : pc.termSem}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                                            <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                                            <tr>
                                                <th className="px-5 py-4 font-semibold min-w-[200px]">Course</th>
                                                <th className="px-5 py-4 text-center font-semibold min-w-[100px]">Units</th>
                                                <th className="px-5 py-4 text-center font-semibold min-w-[150px]">Validations</th>
                                                <th className="px-5 py-4 font-semibold min-w-[150px]">Final Grade</th>
                                                <th className="px-5 py-4 text-right font-semibold whitespace-nowrap w-24 sticky right-0 bg-slate-50 dark:bg-slate-900/50 shadow-[-5px_0_15px_-3px_rgba(0,0,0,0.05)] dark:shadow-black/20 z-10">Actions</th>
                                            </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {displayRows.map(row => (
                                                <tr key={row.courseCode} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                    <td className="px-5 py-4"><div className="font-bold text-slate-800 dark:text-slate-200">{row.courseCode}</div><div className="text-xs text-slate-500 dark:text-slate-400">{row.courseTitle}</div></td>
                                                    <td className="px-5 py-4 text-center font-mono">{row.courseUnits}</td>
                                                    <td className="px-5 py-4 text-center">{row.isMissingPrereq ? (<span className="inline-flex items-center gap-1 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400"><I.Warning className="h-3 w-3" /> PREREQ MISSING</span>) : (<span className="text-[10px] font-bold text-blue-700 dark:text-blue-400">OK</span>)}</td>
                                                    <td className="px-5 py-4">
                                                        <GradeInput
                                                            initialValue={row.finalGrade}
                                                            disabled={!can('encode_grades')}
                                                            onSave={(val) => handleGradeChange(row.courseCode, val, row.recordID)}
                                                        />
                                                    </td>
                                                    <td className="px-5 py-4 text-right whitespace-nowrap w-24 sticky right-0 bg-white dark:bg-slate-800 shadow-[-5px_0_15px_-3px_rgba(0,0,0,0.05)] dark:shadow-black/20">
                                                        {can('encode_grades') && row.recordID && row.isBlank && (<button onClick={() => handleDeleteRow(row.courseCode, row.recordID!)} className="rounded p-1 text-slate-400 dark:text-slate-500 transition hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-coral dark:hover:text-red-400"><I.X className="h-4 w-4" /></button>)}
                                                    </td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            {activeTab === "history" && (
                                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                                    <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-400 dark:text-slate-500">
                                    <tr><th className="px-5 py-4 font-semibold">Term / Semester</th><th className="px-5 py-4 font-semibold">QPA</th><th className="px-5 py-4 font-semibold">CQPA</th><th className="px-5 py-4 text-right font-semibold">Status</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {historyStandings.map(ts => {
                                        const term = terms.find(t => t.termID === ts.termID);
                                        const isExpanded = expandedTerms[ts.termID];

                                        let histStatus = ts.termAcademicStatus as string;
                                        if (histStatus.toUpperCase() === 'ADVISED-TO-SHIFT') histStatus = 'Advised to Shift';
                                        if (histStatus.toUpperCase() === 'ON-PROBATION') histStatus = 'On-Probation';
                                        if (histStatus.toUpperCase() === 'REGULAR') histStatus = 'Regular';
                                        if (histStatus.toUpperCase() === 'UNENCODED') histStatus = 'Unencoded';

                                        return (
                                            <React.Fragment key={ts.standingID}>
                                                <tr onClick={() => setExpandedTerms({...expandedTerms, [ts.termID]: !isExpanded})} className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                    <td className="flex items-center gap-3 px-5 py-4"><I.ChevronRight className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${isExpanded ? "rotate-90" : ""}`} /><div><div className="font-bold text-slate-800 dark:text-slate-200">{term?.termSem}</div><div className="text-xs text-slate-500 dark:text-slate-400">AY {term?.termSY}</div></div></td>
                                                    <td className="px-5 py-4 font-mono">{ts.termQPA.toFixed(2)}</td><td className="px-5 py-4 font-mono font-bold text-slate-800 dark:text-slate-200">{ts.semCQPA.toFixed(2)}</td>
                                                    <td className="px-5 py-4 text-right"><span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${histStatus === 'Advised to Shift' ? 'bg-coral-tint dark:bg-red-900/30 text-coral dark:text-red-400' : histStatus === 'On-Probation' ? 'bg-amber-tint dark:bg-amber-900/30 text-amber dark:text-amber-400' : histStatus === 'Unencoded' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}`}>{histStatus}</span></td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan={4} className="bg-slate-50/50 dark:bg-slate-900/50 p-0 border-b border-slate-100 dark:border-slate-700">
                                                            <div className="px-10 py-4">
                                                                <table className="w-full text-xs text-left text-slate-600 dark:text-slate-400">
                                                                    <thead>
                                                                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                                                                        <th className="py-2">Course Code</th>
                                                                        <th className="py-2">Units</th>
                                                                        <th className="py-2 text-right">Final Grade</th>
                                                                    </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                    {records.filter(r => r.studentID === selectedStudent?.studentID && r.termID === ts.termID).filter(rec => {
                                                                        if (rec.finalGrade !== null || rec.gradeRemarks !== null) return true;
                                                                        const hasGradedDuplicate = records.some(dup => dup.termID === ts.termID && dup.programCourseID === rec.programCourseID && (dup.finalGrade !== null || dup.gradeRemarks !== null));
                                                                        return !hasGradedDuplicate;
                                                                    }).map(rec => {
                                                                        const pc = programCourses.find(p => p.programCourseID === rec.programCourseID);
                                                                        return (
                                                                            <tr key={rec.recordID} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                                                                                <td className="py-2 font-bold">{pc?.courseCode || 'Unknown'}</td>
                                                                                <td className="py-2">{courses.find(c => c.courseCode === pc?.courseCode)?.courseUnits || 0}</td>
                                                                                <td className="py-2 text-right font-mono font-bold text-slate-800 dark:text-slate-200">{rec.finalGrade !== null ? (rec.finalGrade === 0 ? "F" : rec.finalGrade) : (rec.gradeRemarks || '-')}</td>
                                                                            </tr>
                                                                        )
                                                                    })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            )}
                            {activeTab === "progress" && (
                                <div className="flex h-full flex-col bg-slate-50/30 dark:bg-slate-900/30 overflow-hidden">
                                    <div className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3">
                                        <div className="flex items-center gap-3 text-xs">
                                            <div className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Filter By:</div>
                                            <select value={progFilterClassif} onChange={e => setProgFilterClassif(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-600 bg-transparent dark:bg-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300 outline-none"><option value="All">All Types</option><option value="Major">Major</option><option value="Minor">Minor</option></select>
                                            <select value={progFilterYear} onChange={e => setProgFilterYear(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-600 bg-transparent dark:bg-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300 outline-none"><option value="All">All Years</option><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option></select>
                                            <select value={progFilterSem} onChange={e => setProgFilterSem(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-600 bg-transparent dark:bg-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300 outline-none"><option value="All">All Semesters</option><option value="1st Semester">1st Sem</option><option value="2nd Semester">2nd Sem</option><option value="Midyear">Midyear</option></select>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                        <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-800 p-4 shadow-sm transition-colors"><h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">Completed Courses ({filterProgress(progressStats.completed).length})</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{filterProgress(progressStats.completed).map(pc => (<div key={pc.courseCode} className="rounded-md border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs transition-colors"><span className="font-bold text-slate-800 dark:text-slate-200">{pc.courseCode}</span></div>))}</div></div>
                                        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-800 p-4 shadow-sm transition-colors"><h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-amber-700 dark:text-amber-500">Currently Enrolled ({filterProgress(progressStats.enrolled).length})</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{filterProgress(progressStats.enrolled).map(pc => (<div key={pc.courseCode} className="rounded-md border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs transition-colors"><span className="font-bold text-slate-800 dark:text-slate-200">{pc.courseCode}</span></div>))}</div></div>
                                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm transition-colors"><h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Remaining Requirements ({filterProgress(progressStats.remaining).length})</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{filterProgress(progressStats.remaining).map(pc => (<div key={pc.courseCode} className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/50 px-3 py-2 text-xs opacity-60 transition-colors"><span className="font-bold text-slate-600 dark:text-slate-400">{pc.courseCode}</span></div>))}</div></div>
                                    </div>
                                </div>
                            )}
                            {activeTab === "remarks" && (
                                <div className="flex h-full flex-col bg-slate-50/30 dark:bg-slate-900/30">
                                    <div className="flex-1 overflow-y-auto p-5">
                                        {remarks.filter(r => termStanding && r.standingID === termStanding.standingID).map(remark => (
                                            <div key={remark.remarkID} className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm transition-colors">
                                                <div className="mb-2 flex justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-slate-400 dark:text-slate-500">{remark.timestamp.split('T')[0]}</span>
                                                    </div>
                                                    {can('add_remarks') && (
                                                        <div className="flex items-center gap-2">
                                                            <button onClick={() => { setEditingRemarkID(remark.remarkID); setRemarkForm({ category: "General Note", content: remark.content }); }} className="text-slate-400 dark:text-slate-500 transition hover:text-blue-700 dark:hover:text-blue-400"><I.Edit2 className="h-4 w-4" /></button>
                                                            <button onClick={() => handleDeleteRemark(remark.remarkID)} className="text-slate-400 dark:text-slate-500 transition hover:text-coral dark:hover:text-red-400"><I.X className="h-4 w-4" /></button>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{remark.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {can('add_remarks') && (
                                        <form onSubmit={handleSaveRemark} className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm transition-colors">
                                            {!editingRemarkID && (
                                                <select value={remarkForm.category} onChange={e => setRemarkForm({...remarkForm, category: e.target.value as AdvisingCategory})} className="mb-3 w-1/3 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 px-3 py-1.5 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500">
                                                    <option>General Note</option>
                                                    <option>Guidance Referral</option>
                                                    <option>Policy Warning</option>
                                                    <option>Shifting Recommended</option>
                                                </select>
                                            )}
                                            <textarea required value={remarkForm.content} onChange={e => setRemarkForm({...remarkForm, content: e.target.value})} placeholder="Enter advising remark here..." className="w-full resize-none rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-3 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500" rows={3}></textarea>
                                            <div className="mt-3 flex items-center gap-3">
                                                <button type="submit" className="rounded-lg bg-blue-700 dark:bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-800 dark:hover:bg-blue-700 transition">{editingRemarkID ? "Update Remark" : "Save Remark"}</button>
                                                {editingRemarkID && <button type="button" onClick={() => { setEditingRemarkID(null); setRemarkForm({ category: "General Note", content: "" }); }} className="text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition">Cancel</button>}
                                            </div>
                                        </form>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (<div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-500">Please select a student to view their data.</div>)}
                </div>
            </div>

            <ShiftingFormModal isOpen={showShiftingModal} onClose={() => setShowShiftingModal(false)} preselectedStudentID={selectedStudent?.studentID} />
        </div>
    );
}