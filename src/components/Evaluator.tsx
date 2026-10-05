// src/components/Evaluator.tsx
import React, { useState, useEffect, useRef } from "react";
import { useStore } from "../store/store";
import type { PROGRAM_COURSE, TERM_STANDING } from "../store/types";
import { backendAPI, type EnrichedGradeRow, type EnrichedStudent } from "../backend/api";
import ShiftingFormModal from "./ShiftingFormModal";
import * as I from "./icons";
// import { AcademicHistoryPrintable } from "./AcademicHistoryPrintable";

type Tab = "grades" | "history" | "progress" | "remarks";
type AdvisingCategory = "General Note" | "Guidance Referral" | "Policy Warning" | "Shifting Recommended";

const GradeInput = ({ initialValue, onSave, disabled }: { initialValue: string, onSave: (val: string) => Promise<boolean>, disabled: boolean }) => {
    const [val, setVal] = useState(initialValue);
    const [isSaving, setIsSaving] = useState(false);
    useEffect(() => {
        setVal(initialValue);
    }, [initialValue]);

    const handleBlur = async () => {
        if (val !== initialValue) {
            setIsSaving(true);
            const success = await onSave(val);
            if (!success) {
                setVal(initialValue);
            }
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
    };

    return (
        <div className="relative inline-flex items-center">
            <input
                type="text"
                disabled={disabled || isSaving}
                value={val}
                onChange={e => setVal(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder="-"
                className="w-20 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-700 disabled:opacity-60 disabled:cursor-not-allowed pr-8"
            />
            {isSaving && (
                <div className="absolute right-2 text-blue-600 animate-spin">
                    <I.Loader className="h-4 w-4" />
                </div>
            )}
        </div>
    );
};

const EMPTY_ARRAY: string[] = [];

export default function Evaluator() {
    const { students, setStudents, programs, courses, programCourses, records, setRecords, remarks, setRemarks, coursePrerequisites, standings, setStandings, activeUser, pushAudit, activeTerm, can, focusedStudentID, setFocusedStudentID, pendingEvaluatorAction, setPendingEvaluatorAction, terms, retentionPolicies, pendingLocalTerm, setPendingLocalTerm, dismissedGhostRows, setDismissedGhostRows } = useStore();
    const selectedStudent = focusedStudentID ? students.find(s => s.studentID === focusedStudentID) || null : null;

    const setSelectedStudent = (student: EnrichedStudent | null) => setFocusedStudentID(student ? student.studentID : null);

    const [leftMode, setLeftMode] = useState<"search" | "new">("search");
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState<Tab>("grades");
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editFormData, setEditFormData] = useState<EnrichedStudent | null>(null);

    const [showExtraCourseDropdown, setShowExtraCourseDropdown] = useState(false);
    const [showTermDropdown, setShowTermDropdown] = useState(false);
    const [termSearchQuery, setTermSearchQuery] = useState("");
    const termDropdownRef = useRef<HTMLDivElement>(null);
    const [courseSearch, setCourseSearch] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowExtraCourseDropdown(false);
            }
            if (termDropdownRef.current && !termDropdownRef.current.contains(event.target as Node)) {
                setShowTermDropdown(false);
            }
        };
        if (showExtraCourseDropdown || showTermDropdown) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showExtraCourseDropdown, showTermDropdown]);

    const dismissedCourses = selectedStudent ? (dismissedGhostRows[selectedStudent.studentID] || EMPTY_ARRAY) : EMPTY_ARRAY;
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
    const isProcessingRef = useRef(false);
    const [localTerm, setLocalTerm] = useState<string>(() => sessionStorage.getItem('compass_evaluatorLocalTerm') || activeTerm);
    useEffect(() => {
        if (localTerm) sessionStorage.setItem('compass_evaluatorLocalTerm', localTerm);
    }, [localTerm]);

    const searchResults = students.filter(s => {
        const q = searchQuery.toLowerCase().trim();
        const qNoHyphens = q.replace(/-/g, '');
        const f = s.studFirstName.toLowerCase();
        const l = s.studLastName.toLowerCase();
        const m = s.studMiddleName ? s.studMiddleName.toLowerCase() : "";
        const mi = m ? m.charAt(0) : "";
        const id = s.studentID.toLowerCase();
        const idFlat = id.replace(/-/g, '');
        const compositeString = `
            ${f} ${l} 
            ${l}, ${f} 
            ${l} ${f} 
            ${f} ${m} ${l} 
            ${l} ${f} ${m} 
            ${f} ${mi} ${l} 
            ${f} ${mi}. ${l} 
            ${l} ${f} ${mi} 
            ${l} ${f} ${mi}. 
            ${id}
        `.toLowerCase();
        return compositeString.includes(q) || (qNoHyphens.length > 0 && idFlat.includes(qNoHyphens));
    });

    const termStanding = standings.find(ts => ts.studentID === selectedStudent?.studentID && ts.termID === localTerm);
    const historyStandings = standings.filter(ts => ts.studentID === selectedStudent?.studentID);

    let currentStatus = termStanding?.termAcademicStatus as string || "No Data";
    if (currentStatus.toUpperCase() === 'ADVISED-TO-SHIFT') currentStatus = 'Advised to Shift';
    if (currentStatus.toUpperCase() === 'ON-PROBATION') currentStatus = 'On-Probation';
    if (currentStatus.toUpperCase() === 'REGULAR') currentStatus = 'Regular';
    if (currentStatus.toUpperCase() === 'UNENCODED') currentStatus = 'Unencoded';

    const localTermDetails = terms.find(t => t.termID === localTerm);

    // TARGETED FIX: Visually project ATS lock onto the frontend profile for unencoded terms
    if ((currentStatus === "No Data" || currentStatus === "Unencoded") && selectedStudent?.accountStatus === 'Active') {
        const hasATS = historyStandings.some(ts => {
            if (ts.termAcademicStatus !== 'Advised to Shift' && (ts.termAcademicStatus as string) !== 'Advised-to-Shift') return false;
            const t = terms.find(term => term.termID === ts.termID);
            if (!t || !localTermDetails) return false;
            const tStartYear = parseInt(t.termSY.split('-')[0]);
            const localStartYear = parseInt(localTermDetails.termSY.split('-')[0]);
            if (tStartYear < localStartYear) return true;
            if (tStartYear === localStartYear) {
                const semW: Record<string, number> = { "1st Semester": 1, "2nd Semester": 2, "Midyear": 3 };
                return semW[t.termSem] < semW[localTermDetails.termSem];
            }
            return false;
        });
        if (hasATS) currentStatus = 'Advised to Shift';
    }

    const activeTermObj = terms.find(t => t.termID === activeTerm);

    const dynamicMaxYear = selectedStudent ? (() => {
        const progYearLevels = programCourses.filter(pc => pc.programCode === selectedStudent.programCode).map(pc => Number(pc.yearLevel) || Number((pc as any).yrLevel));
        return progYearLevels.length > 0 ? Math.max(...progYearLevels) : 4;
    })() : 4;

    const chronologicalYear = (() => {
        if (!selectedStudent || !localTermDetails) return 1;
        let effectiveYearEnrolled = selectedStudent.yearEnrolled;
        const localStartYear = parseInt(localTermDetails.termSY.split('-')[0]);

        const studentStandings = standings.filter(s => s.studentID === selectedStudent.studentID);
        if (studentStandings.length > 0) {
            const priorStandings = studentStandings.filter(s => {
                const t = terms.find(term => term.termID === s.termID);
                if (!t) return false;
                const tStartYear = parseInt(t.termSY.split('-')[0]);
                if (tStartYear < localStartYear) return true;
                if (tStartYear === localStartYear) {
                    const getSemVal = (sem: string) => sem === '1st Semester' ? 1 : sem === '2nd Semester' ? 2 : 3;
                    return getSemVal(t.termSem) < getSemVal(localTermDetails.termSem);
                }
                return false;
            });

            if (priorStandings.length > 0) {
                const mostRecent = priorStandings.sort((a, b) => {
                    const tA = terms.find(t => t.termID === a.termID);
                    const tB = terms.find(t => t.termID === b.termID);
                    if (!tA || !tB) return 0;
                    const yearA = parseInt(tA.termSY.split('-')[0]);
                    const yearB = parseInt(tB.termSY.split('-')[0]);
                    if (yearA !== yearB) return yearB - yearA;
                    const getSemVal = (sem: string) => sem === '1st Semester' ? 1 : sem === '2nd Semester' ? 2 : 3;
                    return getSemVal(tB.termSem) - getSemVal(tA.termSem);
                })[0];

                if (mostRecent && mostRecent.yearLevel) {
                    const recentTerm = terms.find(t => t.termID === mostRecent.termID);
                    if (recentTerm) {
                        const recentStartYear = parseInt(recentTerm.termSY.split('-')[0]);
                        effectiveYearEnrolled = recentStartYear - mostRecent.yearLevel + 1;
                    }
                }
            }
        }
        return Math.max(1, localStartYear - effectiveYearEnrolled + 1);
    })();
    const displayYearLevel = termStanding?.yearLevel || Math.min(dynamicMaxYear, chronologicalYear);

    let ghostRowYearLevel = displayYearLevel;
    if (selectedStudent && termStanding) {
        const localRecords = records.filter(r => r.studentID === selectedStudent.studentID && r.termID === localTerm);
        const localMajorYearLevels = localRecords
            .map(r => programCourses.find(pc => pc.programCourseID === r.programCourseID))
            .filter(pc => pc && pc.majorMinorClassif === 'Major')
            .map(pc => Number(pc!.yearLevel) || Number((pc as any).yrLevel));

        if (localMajorYearLevels.length > 0) {
            const priority1YearLevel = Math.min(...localMajorYearLevels);
            if (termStanding.yearLevel === priority1YearLevel) {
                const hasFutureStandings = historyStandings.some(s => {
                    const t = terms.find(term => term.termID === s.termID);
                    if (!t || !localTermDetails) return false;
                    const tStartYear = parseInt(t.termSY.split('-')[0]);
                    const localStartYear = parseInt(localTermDetails.termSY.split('-')[0]);
                    if (tStartYear > localStartYear) return true;
                    if (tStartYear === localStartYear) {
                        const semW: Record<string, number> = { "1st Semester": 1, "2nd Semester": 2, "Midyear": 3 };
                        return semW[t.termSem] > semW[localTermDetails.termSem];
                    }
                    return false;
                });

                if (!hasFutureStandings && selectedStudent.yearLevel > priority1YearLevel) {
                    // Latest term: allow global profile projection
                    ghostRowYearLevel = Math.min(dynamicMaxYear, selectedStudent.yearLevel);
                } else {
                    // TARGETED FIX: Past term: Strictly enforce the established local standing (Priority 1) over chronological math
                    ghostRowYearLevel = priority1YearLevel;
                }
            }
        }
    }

    const isReadOnly = selectedStudent ? selectedStudent.accountStatus !== 'Active' : false;

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
    let displayCQPA = termStanding?.semCQPA || 0;
    if (displayCQPA === 0 && selectedStudent?.accountStatus === 'Active') {
        const localTermIndex = availableTerms.findIndex(t => t.termID === localTerm);
        if (localTermIndex >= 0) {
            for (let i = localTermIndex + 1; i < availableTerms.length; i++) {
                const pt = availableTerms[i];
                const ts = historyStandings.find(s => s.termID === pt.termID);
                if (ts && ts.semCQPA > 0) {
                    displayCQPA = ts.semCQPA;
                    break;
                }
            }
        }
    }


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
            const rows = await backendAPI.getEnrichedGrades(selectedStudent, localTerm, localTermDetails, programCourses, courses, records, coursePrerequisites, dismissedCourses, activeTerm, retentionPolicies, ghostRowYearLevel);
            const prog = await backendAPI.getCurriculumProgress(selectedStudent, activeTerm, programCourses, records, retentionPolicies);
            if (isMounted) { setDisplayRows(rows); setProgressStats(prog); setIsLoading(false); }
        };
        void fetchBackendData();
        return () => { isMounted = false; };
        // TARGETED FIX: Added ghostRowYearLevel to dependency array to prevent UI desyncs requiring 2 clicks
    }, [selectedStudent, localTerm, localTermDetails, programCourses, courses, records, coursePrerequisites, dismissedCourses, activeTerm, retentionPolicies, ghostRowYearLevel]);

    const handleIDChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 3) {
            val = `${val.slice(0, 2)}-${val.slice(2, 3)}-${val.slice(3, 10)}`;
        } else if (val.length > 2) {
            val = `${val.slice(0, 2)}-${val.slice(2, 3)}`;
        }
        setFormData({ ...formData, studentID: val });
    };

    const handleAutoPopulate = async () => {
        if (!activeUser || !selectedStudent || !localTermDetails || isProcessingRef.current) return;
        isProcessingRef.current = true;
        setIsLoading(true);
        const { data: newRecords, newStanding, updatedStudentYearLevel, error } = await backendAPI.generateAutoPopulateRecords(
            selectedStudent, localTerm, localTermDetails, programCourses, records, activeUser.userID, activeTerm, standings, retentionPolicies, terms, displayYearLevel
        );
        if (error) {
            alert(error);
        } else if (newRecords && newRecords.length > 0) {
            setRecords([...records, ...newRecords]);
            if (newStanding) {
                setStandings([...standings, newStanding]);
            }
            if (updatedStudentYearLevel !== undefined) {
                const updated = { ...selectedStudent, yearLevel: updatedStudentYearLevel };
                setStudents(students.map(s => s.studentID === updated.studentID ? updated : s));
                setSelectedStudent(updated);
            }
            pushAudit(`AUTO_POPULATED_GRADES_${localTerm}`, selectedStudent.studentID);
        }
        setIsLoading(false);
        isProcessingRef.current = false;
    };

    const handleAddExtraCourse = async (courseCode: string) => {
        if (!activeUser || !selectedStudent || isProcessingRef.current) return;
        isProcessingRef.current = true;
        setIsLoading(true);

        // PHASE 3 FIX: Intercept manual additions if the subject was previously dismissed as a ghost row.
        // This instantly brings the ghost row back to the UI without saving a blank database row.
        if (dismissedCourses.includes(courseCode)) {
            setDismissedGhostRows({
                ...dismissedGhostRows,
                [selectedStudent.studentID]: dismissedCourses.filter(c => c !== courseCode)
            });
            setShowExtraCourseDropdown(false);
            setCourseSearch("");
            setIsLoading(false);
            isProcessingRef.current = false;
            return;
        }

        const { recordsData, standingsData, updatedYearLevel, error } = await backendAPI.upsertGrade(
            courseCode, "", undefined, selectedStudent, localTerm, records,
            programCourses, courses, standings, activeUser.userID, terms, retentionPolicies
        );

        // TARGETED FIX: Safe release of processing locks to prevent permanent UI freeze on error
        if (error) {
            setIsLoading(false);
            isProcessingRef.current = false;
            return alert(error);
        }
        if (recordsData) setRecords(recordsData);
        if (standingsData) setStandings(standingsData);
        if (updatedYearLevel !== undefined) {
            const updated = { ...selectedStudent, yearLevel: updatedYearLevel };
            setStudents(students.map(s => s.studentID === updated.studentID ? updated : s));
            setSelectedStudent(updated);
        }
        pushAudit(`ADDED_SUBJECT_${localTerm}`, selectedStudent.studentID);
        setShowExtraCourseDropdown(false);
        setCourseSearch("");
        setIsLoading(false);
        isProcessingRef.current = false;
    };

    const handleGradeChange = async (code: string, val: string, recordID?: string): Promise<boolean> => {
        if (!activeUser || !selectedStudent || isProcessingRef.current) return false;
        isProcessingRef.current = true;
        setIsLoading(true);

        const { recordsData, standingsData, updatedYearLevel, error } = await backendAPI.upsertGrade(
            code, val, recordID, selectedStudent, localTerm, records,
            programCourses, courses, standings, activeUser.userID, terms, retentionPolicies
        );

        if (error) {
            alert(error);
            // TARGETED FIX: Safe release of processing locks inside the error branch
            setIsLoading(false);
            isProcessingRef.current = false;
            return false;
        }
        if (recordsData) setRecords(recordsData);
        if (standingsData) setStandings(standingsData);
        if (updatedYearLevel !== undefined) {
            const updated = { ...selectedStudent, yearLevel: updatedYearLevel };
            setStudents(students.map(s => s.studentID === updated.studentID ? updated : s));
            setSelectedStudent(updated);
        }
        if (!recordID) pushAudit("ENCODED_NEW_GRADE", selectedStudent.studentID);
        setIsLoading(false);
        isProcessingRef.current = false;
        return true;
    };

    const handleDeleteRow = async (code: string, recordID?: string) => {
        if (!activeUser || !selectedStudent || isProcessingRef.current) return;
        if (!recordID) {
            setDismissedGhostRows({
                ...dismissedGhostRows,
                [selectedStudent.studentID]: [...dismissedCourses, code]
            });
            return;
        }

        isProcessingRef.current = true;
        setIsLoading(true);

        const { recordsData, standingsData, updatedYearLevel, error } = await backendAPI.deleteGradeRow(
            recordID, records, selectedStudent, localTerm,
            programCourses, courses, standings, terms, retentionPolicies
        );

        // TARGETED FIX: Safe release of processing locks to prevent permanent UI freeze on error
        if (error) {
            setIsLoading(false);
            isProcessingRef.current = false;
            return alert(error);
        }
        if (recordsData) setRecords(recordsData);
        if (standingsData) setStandings(standingsData);
        if (updatedYearLevel !== undefined) {
            const updated = { ...selectedStudent, yearLevel: updatedYearLevel };
            setStudents(students.map(s => s.studentID === updated.studentID ? updated : s));
            setSelectedStudent(updated);
        }
        setDismissedGhostRows({
            ...dismissedGhostRows,
            [selectedStudent.studentID]: [...dismissedCourses, code]
        });
        pushAudit("DELETED_GRADE_RECORD", recordID);

        setIsLoading(false);
        isProcessingRef.current = false;
    };

    const handleCreateStudent = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        const cleanID = formData.studentID.replace(/\D/g, '');
        if (cleanID.length < 7) {
            isProcessingRef.current = false;
            return alert("Invalid Student ID format. It must contain at least 7 digits (e.g., XX-X-XXXX).");
        }
        if (students.some(s => s.studentID === formData.studentID)) {
            isProcessingRef.current = false;
            return alert("A student with this ID already exists in the system.");
        }

        const firstName = formData.firstName.trim();
        const lastName = formData.lastName.trim();
        const middleName = formData.middleName.trim();
        if (!firstName || !lastName) {
            isProcessingRef.current = false;
            return alert("Names cannot be empty or just spaces.");
        }
        const nameRegex = /^[A-Za-z\s\- ]+$/;
        if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
            isProcessingRef.current = false;
            return alert("Names must only contain letters, spaces, and hyphens.");
        }
        if (middleName && !nameRegex.test(middleName)) {
            isProcessingRef.current = false;
            return alert("Middle name must only contain letters, spaces, and hyphens.");
        }

        const newStudent: EnrichedStudent = {
            studentID: formData.studentID, studFirstName: firstName, studMiddleName: middleName, studLastName: lastName,
            shsTrack: formData.shsTrack as EnrichedStudent["shsTrack"], yearLevel: Number(formData.yearLevel) as EnrichedStudent["yearLevel"], accountStatus: "Active", programCode: formData.programCode,
            yearEnrolled: Number(formData.yearEnrolled)
        };

        const { data, error } = await backendAPI.createStudent(newStudent, students);
        if (error) {
            isProcessingRef.current = false;
            return alert(error);
        }
        if (data) setStudents(data);

        pushAudit("CREATED_STUDENT_RECORD", formData.studentID);
        setSelectedStudent(newStudent);

        if (newStudent.yearLevel === 1) {
            const targetTerm = terms.find(t => t.termSY === `${newStudent.yearEnrolled}-${newStudent.yearEnrolled + 1}` && t.termSem === "1st Semester");
            if (targetTerm) setLocalTerm(targetTerm.termID);
        }

        setSearchQuery(""); setActiveTab("grades"); setLeftMode("search");
        setFormData({ studentID: "", firstName: "", middleName: "", lastName: "", shsTrack: "STEM", programCode: "", yearLevel: "", yearEnrolled: currentYearStr });
        isProcessingRef.current = false;
    };

    const handleUpdateProfile = async () => {
        if (!editFormData || isProcessingRef.current) return;
        isProcessingRef.current = true;
        const firstName = editFormData.studFirstName.trim();
        const lastName = editFormData.studLastName.trim();
        const middleName = editFormData.studMiddleName?.trim() || "";

        if (!firstName || !lastName) {
            isProcessingRef.current = false;
            return alert("Names cannot be empty or just spaces.");
        }
        const nameRegex = /^[A-Za-z\s\- ]+$/;
        if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
            isProcessingRef.current = false;
            return alert("Names must only contain letters, spaces, and hyphens.");
        }
        if (middleName && !nameRegex.test(middleName)) {
            isProcessingRef.current = false;
            return alert("Middle name must only contain letters, spaces, and hyphens.");
        }

        const updatedStudent: EnrichedStudent = {
            ...editFormData,
            studFirstName: firstName,
            studLastName: lastName,
            studMiddleName: middleName
        };

        const { data, standingsData, error } = await backendAPI.updateStudent(updatedStudent, students, localTerm, standings, terms);
        if (error) {
            isProcessingRef.current = false;
            return alert(error);
        }
        if (data) setStudents(data);
        if (standingsData) setStandings(standingsData);

        setSelectedStudent(updatedStudent);
        pushAudit("UPDATED_STUDENT_RECORD", updatedStudent.studentID);
        setIsEditingProfile(false);
        isProcessingRef.current = false;
    };

    const handleDeleteStudent = async () => {
        if (!selectedStudent || isProcessingRef.current) return;
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete the record for ${selectedStudent.studFirstName} ${selectedStudent.studLastName}?`)) return;

        isProcessingRef.current = true;
        const { data, error } = await backendAPI.deleteStudent(selectedStudent.studentID, students, records, standings, remarks);
        if (error) {
            isProcessingRef.current = false;
            return alert(error);
        }
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
        isProcessingRef.current = false;
    };

    const handleSaveRemark = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!activeUser || !remarkForm.content.trim() || !selectedStudent) return;

        const { data, error } = await backendAPI.upsertRemark(remarkForm, editingRemarkID, selectedStudent.studentID, localTerm, activeUser, remarks, standings);
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

    const validHistoryStandings = historyStandings.filter(ts => ts.termAcademicStatus !== 'Unencoded');
    const groupedHistory = validHistoryStandings.reduce((acc, ts) => {
        const term = terms.find(t => t.termID === ts.termID);
        const yLvl = ts.yearLevel || Math.max(1, parseInt(term?.termSY.split('-')[0] || "0") - (selectedStudent?.yearEnrolled || 0) + 1);
        if (!acc[yLvl]) acc[yLvl] = [];
        acc[yLvl].push(ts);
        return acc;
    }, {} as Record<number, TERM_STANDING[]>);

    const sortedYears = Object.keys(groupedHistory).map(Number).sort((a, b) => b - a);

    return (
        <div className="flex w-full flex-col gap-6 p-6 lg:h-full lg:flex-row lg:overflow-hidden lg:p-8 print:h-auto print:overflow-visible print:block print:p-0">
            <div className="print:hidden flex w-full flex-col gap-4 lg:w-1/3 lg:shrink-0 lg:overflow-y-auto lg:pr-2">
                {can('manage_records') && (
                    <div className="flex shrink-0 gap-1 rounded-lg bg-slate-200/50 p-1 transition-colors">
                        <button onClick={() => { setLeftMode("search"); setIsEditingProfile(false); }} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${leftMode === "search" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Find Record</button>
                        <button onClick={() => { setLeftMode("new"); setSelectedStudent(null); setIsEditingProfile(false); }} className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${leftMode === "new" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>+ New Student</button>
                    </div>
                )}


                {leftMode === "new" && (
                    <form onSubmit={handleCreateStudent} className="flex shrink-0 flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors">
                        <div><h2 className="font-bold text-slate-800">Register New Student</h2></div>
                        <div className="flex flex-col gap-3">
                            <input required placeholder="Student ID (XX-X-XXXXX)" value={formData.studentID} onChange={handleIDChange} className="w-full rounded-md border border-slate-300 bg-transparent p-2 text-sm font-mono outline-none focus:border-blue-700 transition-colors" />
                            <input required placeholder="First Name" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} className="w-full rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:border-blue-700 transition-colors" />
                            <input placeholder="Middle Name (Optional)" value={formData.middleName} onChange={e => setFormData({ ...formData, middleName: e.target.value })} className="w-full rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:border-blue-700 transition-colors" />
                            <input required placeholder="Last Name" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} className="w-full rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:border-blue-700 transition-colors" />

                            <div className="grid grid-cols-2 gap-3">
                                <select required value={formData.programCode} onChange={e => setFormData({ ...formData, programCode: e.target.value })} className="w-full rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:border-blue-700 transition-colors"><option value="" disabled hidden>Program...</option>{programs.filter(p => !p.isArchived).map(p => <option key={p.programCode} value={p.programCode}>{p.programCode}</option>)}</select>
                                <select required value={formData.yearLevel} onChange={e => setFormData({ ...formData, yearLevel: e.target.value })} className="w-full rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:border-blue-700 transition-colors"><option value="" disabled hidden>Year Lvl...</option>{[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}</select>
                                <select required value={formData.shsTrack} onChange={e => setFormData({ ...formData, shsTrack: e.target.value })} className="w-full rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:border-blue-700 transition-colors"><option value="" disabled hidden>SHS Track...</option><option>STEM</option><option>HUMSS</option><option>ABM</option><option>GAS</option><option>TVL</option></select>
                                <input required type="number" placeholder="Year Enrolled" value={formData.yearEnrolled} onChange={e => setFormData({ ...formData, yearEnrolled: e.target.value })} className="w-full rounded-md border border-slate-300 bg-transparent p-2 text-sm outline-none focus:border-blue-700 transition-colors" />
                            </div>
                        </div>
                        <button type="submit" className="mt-2 w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 transition-colors">Create Record</button>
                    </form>
                )}

                {leftMode === "search" && (
                    <>
                        <div className="relative shrink-0">
                            <I.Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="Search by ID or Name" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-700" />
                        </div>

                        {searchQuery && (
                            <div className="shrink-0 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                                {searchResults.map(s => (
                                    <button key={s.studentID} onClick={() => { setSelectedStudent(s); setSearchQuery(""); setLeftMode("search"); setActiveTab("grades"); setIsEditingProfile(false); }} className="flex w-full flex-col items-start border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 transition">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-800">{s.studLastName}, {s.studFirstName}</span>
                                            {s.accountStatus !== 'Active' && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">{s.accountStatus}</span>}
                                        </div>
                                        <div className="font-mono text-xs text-slate-500">{s.studentID} &bull; {s.programCode}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {selectedStudent && (
                            <div className="flex flex-col gap-4 pb-4">
                                {currentStatus === 'Advised to Shift' && !isEditingProfile && (
                                    <div className="flex shrink-0 items-start justify-between gap-3 rounded-lg border border-coral bg-coral-tint p-4 text-coral transition-colors">
                                        <div className="flex items-start gap-3">
                                            <I.Warning className="mt-0.5 h-5 w-5 shrink-0" />
                                            <div>
                                                <div className="font-bold uppercase tracking-wide text-red-800">Advised to Shift</div>
                                                <div className="mt-1 text-xs font-medium text-red-700">Mandatory shifting triggered.</div>
                                            </div>
                                        </div>
                                        {can('generate_forms') && (
                                            <button onClick={() => setShowShiftingModal(true)} className="shrink-0 rounded-md bg-coral px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-red-600">
                                                Generate Form
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors">
                                    <div className="h-16 bg-gradient-to-r from-blue-700 to-blue-900"></div>
                                    <div className="px-5 pb-5">
                                        <div className="relative -mt-8 mb-3 flex h-16 w-16 items-center justify-center rounded-xl border-4 border-white bg-slate-800 text-xl font-bold text-white shadow-sm">{selectedStudent.studFirstName.charAt(0)}</div>

                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                            <div className="flex flex-col">
                                                <h2 className="text-xl font-bold text-slate-800">{selectedStudent.studLastName}, {selectedStudent.studFirstName}</h2>
                                                <div className="font-mono text-sm text-slate-500 mt-1">{selectedStudent.studentID}</div>
                                            </div>
                                            <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm ${currentStatus === 'Advised to Shift' ? 'bg-coral text-white' : currentStatus === 'On-Probation' ? 'bg-amber text-white' : currentStatus === 'Unencoded' ? 'bg-slate-200 text-slate-800' : 'bg-blue-700 text-white'}`}>{currentStatus}</span>
                                                <div className="flex gap-2">
                                                    {/* activeUser?.userType === 'Deans_Office_Staff' && !isEditingProfile && (<button onClick={() => window.print()} className="print:hidden rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm hover:text-blue-700 transition-colors"><I.Printer className="h-3 w-3 inline mr-1 -mt-0.5" /> Print History</button>) */}
                                                    {can('manage_records') && !isEditingProfile && (<button onClick={() => { setEditFormData({ ...selectedStudent, yearLevel: displayYearLevel as any }); setIsEditingProfile(true); }} className="print:hidden rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm hover:text-blue-700 transition-colors">Edit Profile</button>)}
                                                </div>
                                            </div>
                                        </div>

                                        {isEditingProfile && editFormData ? (
                                            <div className="mt-5 flex flex-col gap-3 rounded-lg border border-blue-100 bg-slate-50 p-4 text-sm transition-colors">
                                                <input type="text" placeholder="First Name" value={editFormData.studFirstName} onChange={e => setEditFormData({ ...editFormData, studFirstName: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white p-1.5 text-sm outline-none focus:border-blue-700 transition-colors" />
                                                <input type="text" placeholder="Middle Name" value={editFormData.studMiddleName || ""} onChange={e => setEditFormData({ ...editFormData, studMiddleName: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white p-1.5 text-sm outline-none focus:border-blue-700 transition-colors" />
                                                <input type="text" placeholder="Last Name" value={editFormData.studLastName} onChange={e => setEditFormData({ ...editFormData, studLastName: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white p-1.5 text-sm outline-none focus:border-blue-700 transition-colors" />

                                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                                    <select value={editFormData.programCode} onChange={e => setEditFormData({ ...editFormData, programCode: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white p-1.5 text-sm outline-none focus:border-blue-700 transition-colors">{programs.filter(p => !p.isArchived || p.programCode === editFormData.programCode).map(p => <option key={p.programCode} value={p.programCode}>{p.programCode}</option>)}</select>
                                                    <select value={editFormData.yearLevel} onChange={e => setEditFormData({ ...editFormData, yearLevel: Number(e.target.value) as EnrichedStudent["yearLevel"] })} className="w-full rounded-md border border-slate-300 bg-white p-1.5 text-sm outline-none focus:border-blue-700 transition-colors">{[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}</select>
                                                    <select value={editFormData.shsTrack} onChange={e => setEditFormData({ ...editFormData, shsTrack: e.target.value as EnrichedStudent["shsTrack"] })} className="w-full rounded-md border border-slate-300 bg-white p-1.5 text-sm outline-none focus:border-blue-700 transition-colors">
                                                        <option>STEM</option><option>HUMSS</option><option>ABM</option><option>GAS</option><option>TVL</option>
                                                    </select>
                                                    <input type="number" placeholder="Year Enrolled" value={editFormData.yearEnrolled} onChange={e => setEditFormData({ ...editFormData, yearEnrolled: Number(e.target.value) })} className="w-full rounded-md border border-slate-300 bg-white p-1.5 text-sm outline-none focus:border-blue-700 transition-colors" />
                                                </div>

                                                <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
                                                    {can('archive_student') ? (
                                                        <button onClick={handleDeleteStudent} className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition">Delete Record</button>
                                                    ) : <div></div>}
                                                    <div className="flex gap-2">
                                                        <button onClick={() => setIsEditingProfile(false)} className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 transition">Cancel</button>
                                                        <button onClick={handleUpdateProfile} className="rounded-md bg-blue-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-800 transition">Save Changes</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-5 flex flex-wrap lg:grid lg:grid-cols-12 gap-y-4 gap-x-4 lg:gap-x-6 rounded-lg border border-slate-100 bg-slate-50 p-4 transition-colors">
                                                <div className="flex-1 min-w-fit lg:col-span-4">
                                                    <div className="whitespace-nowrap text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-slate-400">TQPA</div>
                                                    <div className="font-mono text-lg lg:text-xl font-bold text-slate-800">{termStanding?.termQPA?.toFixed(2) || "0.00"}</div>
                                                </div>
                                                <div className="flex-1 min-w-fit lg:col-span-4">
                                                    <div className="whitespace-nowrap text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-slate-400">CQPA</div>
                                                    <div className="font-mono text-lg lg:text-xl font-bold text-slate-800">{displayCQPA.toFixed(2)}</div>
                                                </div>
                                                <div className="flex-1 min-w-[100px] lg:col-span-4">
                                                    <div className="whitespace-nowrap text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-slate-400">Account</div>
                                                    <select
                                                        disabled={!can('archive_student')}
                                                        value={selectedStudent.accountStatus}
                                                        onChange={async (e) => {
                                                            const updated = { ...selectedStudent, accountStatus: e.target.value as "Active" | "Inactive" | "Graduated", yearLevel: displayYearLevel as any };
                                                            const { data, standingsData, error } = await backendAPI.updateStudent(updated, students, localTerm, standings, terms);
                                                            if (error) return alert(error);
                                                            if (data) setStudents(students.map(s => s.studentID === updated.studentID ? updated : s));
                                                            if (standingsData) setStandings(standingsData);
                                                            setSelectedStudent(updated);
                                                            pushAudit(`STATUS_CHANGED_TO_${updated.accountStatus.toUpperCase()}`, updated.studentID);
                                                        }}
                                                        className="mt-0.5 w-full lg:w-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] lg:text-xs font-semibold outline-none focus:border-blue-700 disabled:opacity-60 transition-colors"
                                                    >
                                                        <option value="Active">Active</option>
                                                        <option value="Inactive">Inactive</option>
                                                        <option value="Graduated">Graduated</option>
                                                    </select>
                                                </div>

                                                <div className="hidden lg:block lg:col-span-12 h-px w-full bg-slate-200"></div>

                                                <div className="flex-1 min-w-fit lg:col-span-3">
                                                    <div className="whitespace-nowrap text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-slate-400">Program</div>
                                                    <div className="whitespace-nowrap text-[11px] lg:text-sm font-medium text-slate-700">{selectedStudent.programCode}</div>
                                                </div>
                                                <div className="flex-1 min-w-fit lg:col-span-3">
                                                    <div className="whitespace-nowrap text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-slate-400">Year Lvl</div>
                                                    <div className="whitespace-nowrap text-[11px] lg:text-sm font-medium text-slate-700">Year {displayYearLevel}</div>
                                                </div>
                                                <div className="flex-1 min-w-fit lg:col-span-3">
                                                    <div className="whitespace-nowrap text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-slate-400">Enrolled</div>
                                                    <div className="whitespace-nowrap text-[11px] lg:text-sm font-medium text-slate-700">AY {selectedStudent.yearEnrolled}</div>
                                                </div>
                                                <div className="flex-1 min-w-fit lg:col-span-3">
                                                    <div className="whitespace-nowrap text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-slate-400">Term Profile</div>
                                                    <div className="whitespace-nowrap text-[11px] lg:text-sm font-medium text-slate-700">{localTermDetails?.termSem}</div>
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

            <div className="print:hidden flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors">
                <div className="flex border-b border-slate-200 bg-slate-50 px-2 pt-2">
                    {[{ id: "grades", label: "Grade Encoding" }, { id: "history", label: "Academic History" }, { id: "progress", label: "Curriculum Progress" }, { id: "remarks", label: "Advising Remarks" }].map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} disabled={!selectedStudent} className={`px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-40 ${activeTab === tab.id && selectedStudent ? "border-b-2 border-blue-700 text-blue-700" : "text-slate-500 hover:text-slate-700"}`}>{tab.label}</button>
                    ))}
                </div>

                <div className="relative flex-1 overflow-y-auto bg-white transition-colors">
                    {isLoading}

                    {selectedStudent ? (
                        <>
                            {activeTab === "grades" && (
                                <div className="flex h-full flex-col">
                                    <div className="flex items-center justify-between border-b border-slate-100 p-4 flex-wrap gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="text-sm font-bold text-slate-700">Encoded Subjects ({displayRows.length})</div>
                                            <div className="relative">
                                                <button onClick={() => { setShowTermDropdown(!showTermDropdown); setTermSearchQuery(""); }} className="flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none hover:border-blue-700 transition-colors">
                                                    {localTermDetails ? `${localTermDetails.termSem}, AY ${localTermDetails.termSY} ${localTermDetails.termID === activeTerm ? "(Current)" : ""}` : "Select Term..."}
                                                    <I.ChevronDown className="h-3 w-3" />
                                                </button>
                                                {showTermDropdown && (
                                                    <div ref={termDropdownRef} className="absolute left-0 top-full z-20 mt-1 max-h-[300px] w-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                                                        <div className="sticky top-0 z-10 bg-slate-100 shadow-sm">
                                                            <div className="border-b border-slate-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Available Terms</div>
                                                            <input type="text" autoFocus value={termSearchQuery} onChange={e => setTermSearchQuery(e.target.value)} placeholder="Search term or year..." className="w-full border-b border-slate-200 bg-transparent px-3 py-2 text-xs text-slate-700 outline-none" onClick={e => e.stopPropagation()} />
                                                        </div>
                                                        {availableTerms.filter(t => {
                                                            const searchStr = `${t.termSem} ${t.termSY}`.toLowerCase();
                                                            return searchStr.includes(termSearchQuery.toLowerCase());
                                                        }).map(t => (
                                                            <button key={t.termID} onClick={() => { setLocalTerm(t.termID); setShowTermDropdown(false); }} className={`flex w-full items-center justify-between border-b border-slate-50 px-4 py-2 text-left text-sm transition ${t.termID === localTerm ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                                                                <span className={`font-bold ${t.termID === localTerm ? 'text-blue-700' : 'text-slate-800'}`}>{t.termSem}</span>
                                                                <span className="text-xs text-slate-400">AY {t.termSY} {t.termID === activeTerm ? "(Current)" : ""}</span>
                                                            </button>
                                                        ))}
                                                        {availableTerms.filter(t => `${t.termSem} ${t.termSY}`.toLowerCase().includes(termSearchQuery.toLowerCase())).length === 0 && (
                                                            <div className="px-4 py-3 text-center text-xs text-slate-400">No terms match search.</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {can('encode_grades') && (
                                            <div className="flex gap-2">
                                                <button onClick={handleAutoPopulate} disabled={isReadOnly} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-700 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                                    Auto-Populate Term
                                                </button>
                                                <div className="relative">
                                                    <button onClick={() => { setShowExtraCourseDropdown(!showExtraCourseDropdown); setCourseSearch(""); }} disabled={isReadOnly} className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed">
                                                        + Add Subject
                                                    </button>
                                                    {showExtraCourseDropdown && (
                                                        <div ref={dropdownRef} className="absolute right-0 top-full z-20 mt-1 max-h-[300px] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                                                            <div className="sticky top-0 z-10 bg-slate-100 shadow-sm">
                                                                <div className="border-b border-slate-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Available Curriculum Subjects</div>
                                                                <input type="text" autoFocus value={courseSearch} onChange={e => setCourseSearch(e.target.value)} placeholder="Search course code..." className="w-full border-b border-slate-200 bg-transparent px-3 py-2 text-xs text-slate-700 outline-none" onClick={e => e.stopPropagation()} />
                                                            </div>
                                                            {programCourses.filter(pc => {
                                                                if (pc.programCode !== selectedStudent?.programCode) return false;
                                                                if (displayRows.some(r => r.courseCode === pc.courseCode)) return false;
                                                                if (!pc.courseCode.toLowerCase().includes(courseSearch.toLowerCase())) return false;
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
                                                                <button key={pc.courseCode} onClick={() => handleAddExtraCourse(pc.courseCode)} className="flex w-full items-center justify-between border-b border-slate-50 px-4 py-2 text-left text-sm hover:bg-blue-50 transition">
                                                                    <span className="font-bold text-slate-800">{pc.courseCode}</span>
                                                                    <span className="text-xs text-slate-400">{pc.termSem === "Midyear" ? "Mid-Year" : pc.termSem}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm text-slate-600">
                                            <thead className="bg-slate-50 text-xs uppercase text-slate-400 border-b border-slate-100">
                                                <tr>
                                                    <th className="px-5 py-4 font-semibold min-w-[200px]">Course</th>
                                                    <th className="px-5 py-4 text-center font-semibold min-w-[100px]">Units</th>
                                                    <th className="px-5 py-4 text-center font-semibold min-w-[150px]">Validations</th>
                                                    <th className="px-5 py-4 font-semibold min-w-[150px]">Final Grade</th>
                                                    <th className="px-5 py-4 text-right font-semibold whitespace-nowrap w-24 sticky right-0 bg-slate-50 shadow-[-5px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {displayRows.map(row => (
                                                    <tr key={row.courseCode} className="transition hover:bg-slate-50">
                                                        <td className="px-5 py-4"><div className="font-bold text-slate-800">{row.courseCode}</div><div className="text-xs text-slate-500">{row.courseTitle}</div></td>
                                                        <td className="px-5 py-4 text-center font-mono">{row.courseUnits}</td>
                                                        <td className="px-5 py-4 text-center">{row.isMissingPrereq ? (<span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"><I.Warning className="h-3 w-3" /> PREREQ MISSING</span>) : (<span className="text-[10px] font-bold text-blue-700">OK</span>)}</td>
                                                        <td className="px-5 py-4">
                                                            <GradeInput
                                                                initialValue={row.finalGrade}
                                                                disabled={!can('encode_grades') || isReadOnly}
                                                                onSave={(val) => handleGradeChange(row.courseCode, val, row.recordID)}
                                                            />
                                                        </td>
                                                        <td className="px-5 py-4 text-right whitespace-nowrap w-24 sticky right-0 bg-white shadow-[-5px_0_15px_-3px_rgba(0,0,0,0.05)]">
                                                            {can('encode_grades') && row.isBlank && !isReadOnly && (<button onClick={() => handleDeleteRow(row.courseCode, row.recordID)} className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-coral"><I.X className="h-4 w-4" /></button>)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeTab === "history" && (
                                <table className="w-full text-left text-sm text-slate-600">
                                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-400">
                                        <tr><th className="px-5 py-4 font-semibold">Term / Semester</th><th className="px-5 py-4 font-semibold">TQPA</th><th className="px-5 py-4 font-semibold">CQPA</th><th className="px-5 py-4 text-right font-semibold">Status</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {sortedYears.map(year => (
                                            <React.Fragment key={`ylvl-${year}`}>
                                                <tr className="bg-slate-100">
                                                    <td colSpan={4} className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                                                        Year Level {year}
                                                    </td>
                                                </tr>
                                                {groupedHistory[year].sort((a, b) => {
                                                    const tA = terms.find(t => t.termID === a.termID);
                                                    const tB = terms.find(t => t.termID === b.termID);
                                                    if (!tA || !tB) return 0;
                                                    if (tA.termSY !== tB.termSY) return tB.termSY.localeCompare(tA.termSY);
                                                    const semW: Record<string, number> = { "1st Semester": 1, "2nd Semester": 2, "Midyear": 3 };
                                                    return semW[tB.termSem] - semW[tA.termSem];
                                                }).map(ts => {
                                                    const term = terms.find(t => t.termID === ts.termID);
                                                    // PHASE 4 FIX: Swapped accordion mapping key from termID to deterministic standingID
                                                    const isExpanded = expandedTerms[ts.standingID];
                                                    let histStatus = ts.termAcademicStatus as string;
                                                    if (histStatus.toUpperCase() === 'ADVISED-TO-SHIFT') histStatus = 'Advised to Shift';
                                                    if (histStatus.toUpperCase() === 'ON-PROBATION') histStatus = 'On-Probation';
                                                    if (histStatus.toUpperCase() === 'REGULAR') histStatus = 'Regular';
                                                    if (histStatus.toUpperCase() === 'UNENCODED') histStatus = 'Unencoded';

                                                    return (
                                                        <React.Fragment key={ts.standingID}>
                                                            <tr onClick={() => setExpandedTerms({ ...expandedTerms, [ts.standingID]: !isExpanded })} className="cursor-pointer transition hover:bg-slate-50">
                                                                <td className="flex items-center gap-3 px-5 py-4"><I.ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} /><div><div className="font-bold text-slate-800">{term?.termSem}</div><div className="text-xs text-slate-500">AY {term?.termSY}</div></div></td>
                                                                <td className="px-5 py-4 font-mono">{ts.termQPA.toFixed(2)}</td><td className="px-5 py-4 font-mono font-bold text-slate-800">{ts.semCQPA.toFixed(2)}</td>
                                                                <td className="px-5 py-4 text-right"><span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${histStatus === 'Advised to Shift' ? 'bg-coral-tint text-coral' : histStatus === 'On-Probation' ? 'bg-amber-tint text-amber' : histStatus === 'Unencoded' ? 'bg-slate-200 text-slate-800' : 'bg-blue-50 text-blue-700'}`}>{histStatus}</span></td>
                                                            </tr>
                                                            {isExpanded && (
                                                                <tr>
                                                                    <td colSpan={4} className="bg-slate-50/50 p-0 border-b border-slate-100">
                                                                        <div className="px-10 py-4">
                                                                            <table className="w-full text-xs text-left text-slate-600">
                                                                                <thead>
                                                                                    <tr className="border-b border-slate-200 text-slate-500">
                                                                                        <th className="py-2">Course Code</th>
                                                                                        <th className="py-2">Units</th>
                                                                                        <th className="py-2 text-right">Final Grade</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {records.filter(r => r.studentID === selectedStudent?.studentID && r.termID === ts.termID).filter(rec => {
                                                                                        if (rec.finalGrade === null && rec.gradeRemarks === null) return false;
                                                                                        const hasGradedDuplicate = records.some(dup => dup.recordID !== rec.recordID && dup.studentID === selectedStudent?.studentID && dup.termID === ts.termID && dup.programCourseID === rec.programCourseID && (dup.finalGrade !== null || dup.gradeRemarks !== null));
                                                                                        return !hasGradedDuplicate;
                                                                                    }).map(rec => {
                                                                                        const pc = programCourses.find(p => p.programCourseID === rec.programCourseID);
                                                                                        return (
                                                                                            <tr key={rec.recordID} className="border-b border-slate-100 last:border-0">
                                                                                                <td className="py-2 font-bold">{pc?.courseCode || 'Unknown'}</td>
                                                                                                <td className="py-2">{courses.find(c => c.courseCode === pc?.courseCode)?.courseUnits || 0}</td>
                                                                                                <td className="py-2 text-right font-mono font-bold text-slate-800">{rec.finalGrade !== null ? (rec.finalGrade === 0 ? "F" : rec.finalGrade.toFixed(2)) : (rec.gradeRemarks || '-')}</td>
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
                                            </React.Fragment>
                                        ))}
                                        {historyStandings.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">No academic history records found.</td></tr>}
                                    </tbody>
                                </table>
                            )}

                            {activeTab === "progress" && (
                                <div className="flex h-full flex-col bg-slate-50/30 overflow-hidden">
                                    <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3">
                                        <div className="flex items-center gap-3 text-xs">
                                            <div className="font-bold uppercase tracking-wider text-slate-500">Filter By:</div>
                                            <select value={progFilterClassif} onChange={e => setProgFilterClassif(e.target.value)} className="rounded-md border border-slate-200 bg-transparent px-2 py-1 text-slate-600 outline-none"><option value="All">All Types</option><option value="Major">Major</option><option value="Minor">Minor</option></select>
                                            <select value={progFilterYear} onChange={e => setProgFilterYear(e.target.value)} className="rounded-md border border-slate-200 bg-transparent px-2 py-1 text-slate-600 outline-none"><option value="All">All Years</option><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option></select>
                                            <select value={progFilterSem} onChange={e => setProgFilterSem(e.target.value)} className="rounded-md border border-slate-200 bg-transparent px-2 py-1 text-slate-600 outline-none"><option value="All">All Semesters</option><option value="1st Semester">1st Sem</option><option value="2nd Semester">2nd Sem</option><option value="Midyear">Midyear</option></select>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                        <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm transition-colors"><h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-blue-700">Completed Courses ({filterProgress(progressStats.completed).length})</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{filterProgress(progressStats.completed).map(pc => (<div key={pc.courseCode} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs transition-colors"><span className="font-bold text-slate-800">{pc.courseCode}</span></div>))}</div></div>

                                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors"><h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-600">Remaining Requirements ({filterProgress(progressStats.remaining).length})</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{filterProgress(progressStats.remaining).map(pc => (<div key={pc.courseCode} className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-3 py-2 text-xs opacity-60 transition-colors"><span className="font-bold text-slate-600">{pc.courseCode}</span></div>))}</div></div>
                                    </div>
                                </div>
                            )}

                            {activeTab === "remarks" && (
                                <div className="flex h-full flex-col bg-slate-50/30">
                                    <div className="flex-1 overflow-y-auto p-5">
                                        {remarks.filter(r => termStanding && r.standingID === termStanding.standingID).map(remark => (
                                            <div key={remark.remarkID} className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors">
                                                <div className="mb-2 flex justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-slate-700">
                                                            {remark.COMPASS_USER ? `${remark.COMPASS_USER.userFirstName} ${remark.COMPASS_USER.userLastName}` : "Unknown User"}
                                                        </span>
                                                        <span className="text-xs text-slate-400">
                                                            {new Date(remark.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    {can('add_remarks') && activeUser?.userID === remark.userID && (
                                                        <div className="flex items-center gap-2">
                                                            <button onClick={() => { setEditingRemarkID(remark.remarkID); setRemarkForm({ category: "General Note", content: remark.content }); }} className="text-slate-400 transition hover:text-blue-700"><I.Edit2 className="h-4 w-4" /></button>
                                                            <button onClick={() => handleDeleteRemark(remark.remarkID)} className="text-slate-400 transition hover:text-coral"><I.X className="h-4 w-4" /></button>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{remark.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {can('add_remarks') && (
                                        <form onSubmit={handleSaveRemark} className="border-t border-slate-200 bg-white p-4 shadow-sm transition-colors">
                                            {!editingRemarkID && (
                                                <select disabled={isReadOnly} value={remarkForm.category} onChange={e => setRemarkForm({ ...remarkForm, category: e.target.value as AdvisingCategory })} className="mb-3 w-1/3 rounded-md border border-slate-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                                    <option>General Note</option>
                                                    <option>Guidance Referral</option>
                                                    <option>Policy Warning</option>
                                                    <option>Shifting Recommended</option>
                                                </select>
                                            )}
                                            <textarea disabled={isReadOnly} required value={remarkForm.content} onChange={e => setRemarkForm({ ...remarkForm, content: e.target.value })} placeholder="Enter advising remark here..." className="w-full resize-none rounded-lg border border-slate-300 bg-transparent p-3 text-sm outline-none focus:border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed" rows={3}></textarea>
                                            <div className="mt-3 flex items-center gap-3">
                                                <button disabled={isReadOnly} type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-800 transition disabled:opacity-50 disabled:cursor-not-allowed">{editingRemarkID ? "Update Remark" : "Save Remark"}</button>
                                                {editingRemarkID && <button type="button" onClick={() => { setEditingRemarkID(null); setRemarkForm({ category: "General Note", content: "" }); }} className="text-sm font-semibold text-slate-500 hover:text-slate-700 transition">Cancel</button>}
                                            </div>
                                        </form>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (<div className="flex h-full items-center justify-center text-slate-400">Please select a student to view their data.</div>)}
                </div>
            </div>

            <ShiftingFormModal isOpen={showShiftingModal} onClose={() => setShowShiftingModal(false)} preselectedStudentID={selectedStudent?.studentID} />

            {/* !showShiftingModal && selectedStudent && (
                <AcademicHistoryPrintable
                    student={selectedStudent}
                    records={records}
                    programCourses={programCourses}
                    terms={terms}
                    courses={courses}
                    standings={standings}
                />
            ) */}
        </div>
    );
}