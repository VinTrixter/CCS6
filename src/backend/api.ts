// src/backend/api.ts
import { supabase } from './supabaseClient';
import type {
    STUDENT, DEGREE_PROGRAM, COURSE,
    PROGRAM_COURSE, TERM_STANDING, ADVISING_REMARK, ACADEMIC_RECORD, COURSE_PREREQUISITE, ACADEMIC_TERM
} from '../store/types';

// 1. Strict Typing to resolve "Property 'programCode' does not exist on type 'STUDENT'"
export type EnrichedStudent = STUDENT & { programCode: string };

export interface EnrichedGradeRow {
    courseCode: string;
    courseTitle: string;
    courseUnits: number;
    isMissingPrereq: boolean;
    finalGrade: string;
    isBlank: boolean;
    recordID?: string;
}

// 2. Extracted Helper to resolve "Duplicated code fragment (14 lines long)"
const evaluateAndApplyStanding = (
    studentID: string, activeTerm: string, updatedRecords: ACADEMIC_RECORD[],
    programCourses: PROGRAM_COURSE[], courses: COURSE[], program: DEGREE_PROGRAM,
    currentStandings: TERM_STANDING[]
) => {
    const newStanding = AcademicEngine.evaluateAcademicStanding(studentID, activeTerm, updatedRecords, programCourses, courses, program, currentStandings);

    const updatedStandingsArray = [...currentStandings];
    const standingIndex = updatedStandingsArray.findIndex(ts => ts.standingID === newStanding.standingID);

    if (standingIndex >= 0) updatedStandingsArray[standingIndex] = newStanding;
    else updatedStandingsArray.push(newStanding);

    return { newStanding, updatedStandingsArray };
};

const AcademicEngine = {
    evaluateAcademicStanding(
        studentID: string, activeTerm: string, studentRecords: ACADEMIC_RECORD[],
        programCourses: PROGRAM_COURSE[], courses: COURSE[], program: DEGREE_PROGRAM,
        currentStandings: TERM_STANDING[]
    ): TERM_STANDING {
        const termRecords = studentRecords.filter(r => r.studentID === studentID && r.termID === activeTerm);
        const historicalRecords = studentRecords.filter(r => r.studentID === studentID && r.termID <= activeTerm);

        const calculateQPA = (recordsToEvaluate: ACADEMIC_RECORD[]) => {
            let totalPoints = 0;
            let totalUnits = 0;
            recordsToEvaluate.forEach(record => {
                const pc = programCourses.find(p => p.programCourseID === record.programCourseID);
                if (pc && pc.isCQPAIncluded && record.finalGrade !== null && !record.gradeRemarks) {
                    const baseCourse = courses.find(c => c.courseCode === pc.courseCode);
                    const units = baseCourse ? baseCourse.courseUnits : 3;
                    totalPoints += (record.finalGrade * units);
                    totalUnits += units;
                }
            });
            return totalUnits > 0 ? (totalPoints / totalUnits) : 0.0;
        };

        const semCQPA = calculateQPA(termRecords);
        const runningCQPA = calculateQPA(historicalRecords);
        const threshold = program.passingGradeThreshold || 2.0;

        let status: "Regular" | "On-Probation" | "Advised to Shift" = "Regular";
        let isConsecutiveOP = false;

        if (semCQPA > 0 && semCQPA < threshold) {
            status = "On-Probation";
            const previousStanding = currentStandings.find(ts => ts.studentID === studentID && ts.termID < activeTerm);
            if (previousStanding && previousStanding.termAcademicStatus === "On-Probation") {
                isConsecutiveOP = true;
                status = "Advised to Shift";
            }
        }

        const existingStanding = currentStandings.find(ts => ts.studentID === studentID && ts.termID === activeTerm);
        const standingID = existingStanding ? existingStanding.standingID : `STD-${Date.now()}`;

        return {
            standingID, semCQPA, runningCQPA, termAcademicStatus: status,
            isConsecutiveOP, studentID, termID: activeTerm
        };
    }
};

export const backendAPI = {
    // FIXED: Removed implicit 'any' and locally caught 'throw' exceptions
    async fetchInitialSystemData() {
        try {
            const [
                studentsRes, programsRes, coursesRes, progCoursesRes,
                standingsRes, remarksRes, recordsRes, termsRes, prereqsRes
            ] = await Promise.all([
                supabase.from('STUDENT').select(`*, STUDENT_PROGRAM ( programCode )`).eq('accountStatus', 'Active'),
                supabase.from('DEGREE_PROGRAM').select('*'),
                supabase.from('COURSE').select('*'),
                supabase.from('PROGRAM_COURSE').select('*'),
                supabase.from('TERM_STANDING').select('*'),
                supabase.from('ADVISING_REMARK').select('*'),
                supabase.from('ACADEMIC_RECORD').select('*'),
                supabase.from('ACADEMIC_TERM').select('*'),
                supabase.from('COURSE_PREREQUISITE').select('*')
            ]);

            if (studentsRes.error) return { data: null, error: studentsRes.error.message };

            type SupabaseStudent = STUDENT & { STUDENT_PROGRAM?: { programCode: string }[] };

            const enrichedStudents: EnrichedStudent[] = (studentsRes.data as SupabaseStudent[]).map((student) => ({
                ...student,
                programCode: student.STUDENT_PROGRAM?.[0]?.programCode || "UNASSIGNED"
            }));

            return {
                data: {
                    students: enrichedStudents,
                    programs: programsRes.data as DEGREE_PROGRAM[],
                    courses: coursesRes.data as COURSE[],
                    programCourses: progCoursesRes.data as PROGRAM_COURSE[],
                    standings: standingsRes.data as TERM_STANDING[],
                    remarks: remarksRes.data as ADVISING_REMARK[],
                    records: recordsRes.data as ACADEMIC_RECORD[],
                    terms: termsRes.data as ACADEMIC_TERM[],
                    coursePrerequisites: prereqsRes.data as COURSE_PREREQUISITE[]
                },
                error: null
            };
        } catch (error) {
            const err = error as Error;
            return { data: null, error: err.message };
        }
    },

    async pushAuditLog(logID: string, userID: string, action: string, target: string) {
        const { error } = await supabase
            .from('AUDIT_LOG')
            .insert([{ logID, timestamp: new Date().toISOString(), userID, action, target }]);
        if (error) console.error("Audit Logging Failed:", error.message);
    },

    async getEnrichedGrades(
        student: EnrichedStudent | null, activeTerm: string, termDetails: ACADEMIC_TERM | undefined,
        programCourses: PROGRAM_COURSE[], courses: COURSE[], records: ACADEMIC_RECORD[],
        prereqs: COURSE_PREREQUISITE[], dismissedCourses: string[]
    ) {
        if (!student || !termDetails) return [];
        const studentRecords = records.filter(r => r.studentID === student.studentID && r.termID === activeTerm);
        const curriculum = programCourses.filter(pc => pc.programCode === student.programCode && pc.yearLevel === student.yearLevel && pc.termSem === termDetails.termSem);

        const displayRows: EnrichedGradeRow[] = [];

        curriculum.forEach(pc => {
            const baseCourse = courses.find(c => c.courseCode === pc.courseCode);
            if (!baseCourse || dismissedCourses.includes(pc.courseCode)) return;

            const existingRecord = studentRecords.find(r => r.programCourseID === pc.programCourseID);
            const coursePrereqs = prereqs.filter(pr => pr.programCourseID === pc.programCourseID);
            let isMissingPrereq = false;

            if (coursePrereqs.length > 0) {
                const historicalRecords = records.filter(r => r.studentID === student.studentID && r.termID < activeTerm);
                coursePrereqs.forEach(pr => {
                    const passed = historicalRecords.find(hr => hr.programCourseID === pr.prereqProgramCourseID && !hr.isFailed && hr.finalGrade !== null);
                    if (!passed) isMissingPrereq = true;
                });
            }

            displayRows.push({
                courseCode: pc.courseCode,
                courseTitle: baseCourse.courseTitle,
                courseUnits: baseCourse.courseUnits,
                isMissingPrereq,
                finalGrade: existingRecord ? (existingRecord.gradeRemarks || (existingRecord.finalGrade?.toString() || "")) : "",
                isBlank: !existingRecord || (existingRecord.finalGrade === null && !existingRecord.gradeRemarks),
                recordID: existingRecord?.recordID
            });
        });

        studentRecords.forEach(record => {
            const pc = programCourses.find(p => p.programCourseID === record.programCourseID);
            if (pc && !displayRows.some(row => row.courseCode === pc.courseCode)) {
                const baseCourse = courses.find(c => c.courseCode === pc.courseCode);
                displayRows.push({
                    courseCode: pc.courseCode,
                    courseTitle: baseCourse?.courseTitle || "Unknown",
                    courseUnits: baseCourse?.courseUnits || 0,
                    isMissingPrereq: false,
                    finalGrade: record.gradeRemarks || (record.finalGrade?.toString() || ""),
                    isBlank: record.finalGrade === null && !record.gradeRemarks,
                    recordID: record.recordID
                });
            }
        });

        return displayRows;
    },

    async getCurriculumProgress(
        student: EnrichedStudent | null, activeTerm: string, programCourses: PROGRAM_COURSE[], records: ACADEMIC_RECORD[]
    ) {
        if (!student) return { completed: [], enrolled: [], remaining: [] };
        const curriculum = programCourses.filter(pc => pc.programCode === student.programCode);
        const studentRecords = records.filter(r => r.studentID === student.studentID);

        const completed: PROGRAM_COURSE[] = [];
        const enrolled: PROGRAM_COURSE[] = [];
        const remaining: PROGRAM_COURSE[] = [];

        curriculum.forEach(pc => {
            const history = studentRecords.filter(r => r.programCourseID === pc.programCourseID);
            const passed = history.find(r => r.finalGrade !== null && !r.isFailed);
            const active = history.find(r => r.termID === activeTerm && r.finalGrade === null && !r.gradeRemarks);

            if (passed) completed.push(pc);
            else if (active) enrolled.push(pc);
            else remaining.push(pc);
        });

        return { completed, enrolled, remaining };
    },

    async generateAutoPopulateRecords(
        student: EnrichedStudent, activeTerm: string, termDetails: ACADEMIC_TERM,
        programCourses: PROGRAM_COURSE[], records: ACADEMIC_RECORD[], userID: string
    ) {
        const curriculum = programCourses.filter(pc => pc.programCode === student.programCode && pc.yearLevel === student.yearLevel && pc.termSem === termDetails.termSem);
        const existingRecords = records.filter(r => r.studentID === student.studentID && r.termID === activeTerm);

        const newRecords: ACADEMIC_RECORD[] = [];

        for (const pc of curriculum) {
            if (!existingRecords.some(r => r.programCourseID === pc.programCourseID)) {
                const newRec: ACADEMIC_RECORD = {
                    recordID: `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    finalGrade: null,
                    isFailed: false,
                    dateEncoded: new Date().toISOString().split('T')[0],
                    programCourseID: pc.programCourseID,
                    termID: activeTerm,
                    studentID: student.studentID,
                    userID
                };
                newRecords.push(newRec);
            }
        }

        if (newRecords.length > 0) {
            await supabase.from('ACADEMIC_RECORD').insert(newRecords);
        }
        return newRecords;
    },

    async upsertGrade(
        courseCode: string, val: string, recordID: string | undefined, student: EnrichedStudent, activeTerm: string,
        currentRecords: ACADEMIC_RECORD[], programCourses: PROGRAM_COURSE[], courses: COURSE[], program: DEGREE_PROGRAM,
        currentStandings: TERM_STANDING[], userID: string
    ) {
        let finalGrade: number | null = null;
        let isFailed = false;
        let gradeRemarks: string | undefined = undefined;
        const upperVal = val.trim().toUpperCase();

        if (["INC", "NG", "W", "D", "F"].includes(upperVal)) {
            gradeRemarks = upperVal;
            if (["F", "NG", "D"].includes(upperVal)) isFailed = true;
            if (upperVal === "F") finalGrade = 0.0;
        } else if (val.trim() !== "") {
            finalGrade = Number(val);
            if (isNaN(finalGrade)) return { recordsData: null, standingsData: null, error: "Invalid grade input." };
            if (finalGrade === 0.0 || finalGrade > 3.0) isFailed = true;
        }

        let updatedRecord: ACADEMIC_RECORD;
        const updatedRecordsArray = [...currentRecords];

        if (recordID) {
            updatedRecord = { ...currentRecords.find(r => r.recordID === recordID)!, finalGrade, isFailed, gradeRemarks };
            const { error } = await supabase.from('ACADEMIC_RECORD').update({ finalGrade, isFailed, gradeRemarks }).eq('recordID', recordID);
            if (error) return { recordsData: null, standingsData: null, error: error.message };
            const index = updatedRecordsArray.findIndex(r => r.recordID === recordID);
            updatedRecordsArray[index] = updatedRecord;
        } else {
            const pc = programCourses.find(p => p.programCode === student.programCode && p.courseCode === courseCode);
            if (!pc) return { recordsData: null, standingsData: null, error: "Course not found in curriculum." };
            updatedRecord = {
                recordID: `REC-${Date.now()}`, finalGrade, isFailed, gradeRemarks, dateEncoded: new Date().toISOString().split('T')[0],
                programCourseID: pc.programCourseID, termID: activeTerm, studentID: student.studentID, userID
            };
            const { error } = await supabase.from('ACADEMIC_RECORD').insert([updatedRecord]);
            if (error) return { recordsData: null, standingsData: null, error: error.message };
            updatedRecordsArray.push(updatedRecord);
        }

        const { newStanding, updatedStandingsArray } = evaluateAndApplyStanding(student.studentID, activeTerm, updatedRecordsArray, programCourses, courses, program, currentStandings);
        const { error: standError } = await supabase.from('TERM_STANDING').upsert([newStanding], { onConflict: 'standingID' });
        if (standError) return { recordsData: null, standingsData: null, error: standError.message };

        return { recordsData: updatedRecordsArray, standingsData: updatedStandingsArray, error: null };
    },

    async deleteGradeRow(
        recordID: string, currentRecords: ACADEMIC_RECORD[], studentID: string, activeTerm: string,
        programCourses: PROGRAM_COURSE[], courses: COURSE[], program: DEGREE_PROGRAM, currentStandings: TERM_STANDING[]
    ) {
        const { error } = await supabase.from('ACADEMIC_RECORD').delete().eq('recordID', recordID);
        if (error) return { recordsData: null, standingsData: null, error: error.message };

        const updatedRecordsArray = currentRecords.filter(r => r.recordID !== recordID);

        const { newStanding, updatedStandingsArray } = evaluateAndApplyStanding(studentID, activeTerm, updatedRecordsArray, programCourses, courses, program, currentStandings);
        await supabase.from('TERM_STANDING').upsert([newStanding], { onConflict: 'standingID' });

        return { recordsData: updatedRecordsArray, standingsData: updatedStandingsArray, error: null };
    },

    async createStudent(newStudent: EnrichedStudent, currentStudents: EnrichedStudent[]) {
        const baseStudent = {
            studentID: newStudent.studentID,
            studFirstName: newStudent.studFirstName,
            studMiddleName: newStudent.studMiddleName,
            studLastName: newStudent.studLastName,
            shsTrack: newStudent.shsTrack,
            yearLevel: newStudent.yearLevel,
            accountStatus: newStudent.accountStatus
        };

        const { error: studentError } = await supabase.from('STUDENT').insert([baseStudent]);
        if (studentError) return { data: null, error: studentError.message };

        const progLink = {
            studProgID: `SP-${Date.now()}`,
            programCode: newStudent.programCode,
            studentID: newStudent.studentID
        };

        const { error: progError } = await supabase.from('STUDENT_PROGRAM').insert([progLink]);
        if (progError) return { data: null, error: progError.message };

        const updatedArray = [...currentStudents, newStudent];
        return { data: updatedArray, error: null };
    },

    async updateStudent(updatedData: EnrichedStudent, currentStudents: EnrichedStudent[]) {
        const baseStudent = {
            studFirstName: updatedData.studFirstName,
            studMiddleName: updatedData.studMiddleName,
            studLastName: updatedData.studLastName,
            shsTrack: updatedData.shsTrack,
            yearLevel: updatedData.yearLevel,
            accountStatus: updatedData.accountStatus
        };

        const { error: studentError } = await supabase.from('STUDENT').update(baseStudent).eq('studentID', updatedData.studentID);
        if (studentError) return { data: null, error: studentError.message };

        const existingStudent = currentStudents.find(s => s.studentID === updatedData.studentID);
        if (existingStudent && existingStudent.programCode !== updatedData.programCode) {
            const progLink = { studProgID: `SP-${Date.now()}`, programCode: updatedData.programCode, studentID: updatedData.studentID };
            await supabase.from('STUDENT_PROGRAM').insert([progLink]);
        }

        const updatedArray = currentStudents.map(s => s.studentID === updatedData.studentID ? updatedData : s);
        return { data: updatedArray, error: null };
    },

    async deleteStudent(studentID: string, students: EnrichedStudent[], records: ACADEMIC_RECORD[], standings: TERM_STANDING[], remarks: ADVISING_REMARK[]) {
        await supabase.from('ACADEMIC_RECORD').delete().eq('studentID', studentID);
        await supabase.from('TERM_STANDING').delete().eq('studentID', studentID);
        const relatedStandings = standings.filter(ts => ts.studentID === studentID).map(ts => ts.standingID);
        if (relatedStandings.length > 0) {
            await supabase.from('ADVISING_REMARK').delete().in('standingID', relatedStandings);
        }
        await supabase.from('STUDENT_PROGRAM').delete().eq('studentID', studentID);
        const { error } = await supabase.from('STUDENT').delete().eq('studentID', studentID);

        if (error) return { data: null, error: error.message };

        return {
            data: {
                students: students.filter(s => s.studentID !== studentID),
                records: records.filter(r => r.studentID !== studentID),
                standings: standings.filter(ts => ts.studentID !== studentID),
                remarks: remarks.filter(r => !relatedStandings.includes(r.standingID))
            }, error: null
        };
    },

    async upsertRemark(
        remarkForm: { category: string, content: string }, remarkID: string | null, studentID: string,
        activeTerm: string, userID: string, remarks: ADVISING_REMARK[], standings: TERM_STANDING[]
    ) {
        const targetStanding = standings.find(ts => ts.studentID === studentID && ts.termID === activeTerm);
        if (!targetStanding) return { data: null, error: "Academic standing record missing for active term." };

        let updatedRemark: ADVISING_REMARK;
        const updatedRemarks = [...remarks];

        if (remarkID) {
            updatedRemark = { ...remarks.find(r => r.remarkID === remarkID)!, category: remarkForm.category, content: remarkForm.content };
            const { error } = await supabase.from('ADVISING_REMARK').update({ category: remarkForm.category, content: remarkForm.content }).eq('remarkID', remarkID);
            if (error) return { data: null, error: error.message };
            const index = updatedRemarks.findIndex(r => r.remarkID === remarkID);
            updatedRemarks[index] = updatedRemark;
        } else {
            updatedRemark = { remarkID: `REM-${Date.now()}`, content: remarkForm.content, timestamp: new Date().toISOString(), userID, standingID: targetStanding.standingID, category: remarkForm.category };
            const { error } = await supabase.from('ADVISING_REMARK').insert([updatedRemark]);
            if (error) return { data: null, error: error.message };
            updatedRemarks.push(updatedRemark);
        }

        return { data: updatedRemarks, error: null };
    },

    async deleteRemark(remarkID: string, remarks: ADVISING_REMARK[]) {
        const { error } = await supabase.from('ADVISING_REMARK').delete().eq('remarkID', remarkID);
        if (error) return { data: null, error: error.message };
        return { data: remarks.filter(r => r.remarkID !== remarkID), error: null };
    },

    async validateCurriculum(programCode: string, curriculumYear: string, editingProgCode: string | null, programs: DEGREE_PROGRAM[]) {
        const exists = programs.some(p => p.programCode === programCode && p.curriculumYear === curriculumYear && p.programCode !== editingProgCode);
        if (exists) return "A curriculum for this program and effective year already exists.";

        if (editingProgCode) {
            await supabase.from('DEGREE_PROGRAM').update({ programCode, curriculumYear }).eq('programCode', editingProgCode);
        } else {
            await supabase.from('DEGREE_PROGRAM').insert([{ programCode, curriculumYear, programTitle: "New Program" }]);
        }
        return null;
    },

    async saveCourseToCurriculum(
        payload: { courseCode: string; title: string; units: string; yearLevel: string; semester: string; classification: string; isCQPAIncluded: boolean; },
        program: DEGREE_PROGRAM, editingCourseCode: string | null, courses: COURSE[], programCourses: PROGRAM_COURSE[]
    ) {
        const baseCourse: COURSE = { courseCode: payload.courseCode, courseTitle: payload.title, courseUnits: Number(payload.units) };
        const progCourse: PROGRAM_COURSE = {
            programCourseID: editingCourseCode ? programCourses.find(pc => pc.courseCode === editingCourseCode && pc.programCode === program.programCode)!.programCourseID : `PC-${Date.now()}`,
            programCode: program.programCode,
            courseCode: payload.courseCode,
            majorMinorClassif: payload.classification as "Major" | "Minor",
            isCQPAIncluded: payload.isCQPAIncluded,
            yearLevel: Number(payload.yearLevel),
            termSem: payload.semester as "1st Semester" | "2nd Semester" | "Midyear"
        };

        const existingCourse = courses.find(c => c.courseCode === payload.courseCode);
        if (!existingCourse) await supabase.from('COURSE').insert([baseCourse]);
        else await supabase.from('COURSE').update(baseCourse).eq('courseCode', payload.courseCode);

        if (editingCourseCode) await supabase.from('PROGRAM_COURSE').update(progCourse).eq('programCourseID', progCourse.programCourseID);
        else await supabase.from('PROGRAM_COURSE').insert([progCourse]);

        const newCourses = existingCourse ? courses.map(c => c.courseCode === payload.courseCode ? baseCourse : c) : [...courses, baseCourse];
        const newProgCourses = editingCourseCode ? programCourses.map(pc => pc.programCourseID === progCourse.programCourseID ? progCourse : pc) : [...programCourses, progCourse];

        return { coursesData: newCourses, programCoursesData: newProgCourses, error: null };
    },

    async generateReport(
        statusFilter: string, programFilter: string, yearFilter: string, accountFilter: string,
        students: EnrichedStudent[], activeStandings: TERM_STANDING[]
    ) {
        const data = activeStandings.map(ts => {
            const student = students.find(s => s.studentID === ts.studentID);
            return { ...ts, student: student! };
        }).filter(record => record.student !== undefined);

        const filtered = data.filter(record => {
            const matchStatus = statusFilter === "All Students" ||
                (statusFilter === "All Flagged" && (record.termAcademicStatus === "On-Probation" || record.termAcademicStatus === "Advised to Shift")) ||
                record.termAcademicStatus === statusFilter;
            const matchProgram = programFilter === "All" || record.student.programCode === programFilter;
            const matchYear = yearFilter === "All" || record.student.yearLevel.toString() === yearFilter;
            const matchAccount = accountFilter === "All" || record.student.accountStatus === accountFilter;
            return matchStatus && matchProgram && matchYear && matchAccount;
        });

        return { data: filtered, error: null };
    }
};