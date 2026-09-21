// src/backend/mockBackend.ts
import type {
    STUDENT, ACADEMIC_RECORD, PROGRAM_COURSE, COURSE,
    DEGREE_PROGRAM, ACADEMIC_TERM, USER, TERM_STANDING, COURSE_PREREQUISITE, ADVISING_REMARK
} from "../store/types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface EnrichedGradeRow {
    courseCode: string;
    courseTitle: string;
    courseUnits: number;
    isMajor: boolean;
    isCQPAIncluded: boolean;
    prerequisites: string[];
    recordID?: string;
    finalGrade: string;
    isMissingPrereq: boolean;
    isBlank: boolean;
}

export interface RemarkForm { category: string; content: string; }
export interface CourseForm { courseCode: string; title: string; units: string | number; yearLevel: string | number; semester: string | number; classification: string; isCQPAIncluded: boolean; }

// ==========================================
// INTERNAL ACADEMIC COMPUTATION ENGINE
// ==========================================
const AcademicEngine = {
    calculateQPA(records: ACADEMIC_RECORD[], programCourses: PROGRAM_COURSE[], courses: COURSE[]): number {
        let totalQualityPoints = 0;
        let totalUnits = 0;

        for (const record of records) {
            if (record.finalGrade === null) continue; // Skips INC, W, D, etc.

            const pc = programCourses.find(p => p.programCourseID === record.programCourseID);
            if (!pc || !pc.isCQPAIncluded) continue;

            const course = courses.find(c => c.courseCode === pc.courseCode);
            if (!course) continue;

            totalQualityPoints += (record.finalGrade * course.courseUnits);
            totalUnits += course.courseUnits;
        }

        return totalUnits === 0 ? 0.000 : Number((totalQualityPoints / totalUnits).toFixed(3));
    },

    evaluateAcademicStanding(
        studentID: string, activeTermID: string, allStudentRecords: ACADEMIC_RECORD[],
        programCourses: PROGRAM_COURSE[], courses: COURSE[], program: DEGREE_PROGRAM, historicalStandings: TERM_STANDING[]
    ): TERM_STANDING {
        const termRecords = allStudentRecords.filter(r => r.termID === activeTermID);
        const semCQPA = this.calculateQPA(termRecords, programCourses, courses);
        const runningCQPA = this.calculateQPA(allStudentRecords, programCourses, courses);

        const threshold = program.passingGradeThreshold || 2.0;
        let status: "Regular" | "On-Probation" | "Advised to Shift" = semCQPA < threshold ? "On-Probation" : "Regular";
        let isConsecutive = false;

        // Policy A: Check for failure of the same major subject twice
        const failedMajorCounts: Record<string, number> = {};
        const failedRecords = allStudentRecords.filter(r => r.isFailed);

        for (const fail of failedRecords) {
            const pc = programCourses.find(p => p.programCourseID === fail.programCourseID);
            if (pc && pc.majorMinorClassif === "Major") {
                failedMajorCounts[pc.courseCode] = (failedMajorCounts[pc.courseCode] || 0) + 1;
                if (failedMajorCounts[pc.courseCode] >= 2) status = "Advised to Shift";
            }
        }

        // Policy B: Check for consecutive probations
        if (status === "On-Probation") {
            const previousStandings = historicalStandings.filter(ts => ts.studentID === studentID && ts.termID !== activeTermID);
            if (previousStandings.length > 0) {
                const lastStanding = previousStandings[previousStandings.length - 1];
                if (lastStanding.termAcademicStatus === "On-Probation") {
                    status = "Advised to Shift";
                    isConsecutive = true;
                }
            }
        }

        return { standingID: `TS-${activeTermID}-${studentID}`, semCQPA, runningCQPA, termAcademicStatus: status, isConsecutiveOP: isConsecutive, studentID, termID: activeTermID };
    }
};

const updateStandingAfterGradeChange = (studentID: string, activeTerm: string, updatedRecords: ACADEMIC_RECORD[], programCourses: PROGRAM_COURSE[], courses: COURSE[], program: DEGREE_PROGRAM, currentStandings: TERM_STANDING[]) => {
    const studentRecords = updatedRecords.filter(r => r.studentID === studentID);
    const newStanding = AcademicEngine.evaluateAcademicStanding(studentID, activeTerm, studentRecords, programCourses, courses, program, currentStandings);

    // FIXED: Changed let to const
    const updatedStandingsArray = [...currentStandings];
    const standingIndex = updatedStandingsArray.findIndex(ts => ts.standingID === newStanding.standingID);

    if (standingIndex >= 0) {
        updatedStandingsArray[standingIndex] = newStanding;
    } else {
        updatedStandingsArray.push(newStanding);
    }

    return updatedStandingsArray;
};

export const mockBackend = {

    async authenticateUser(userID: string, users: USER[]) {
        await delay(300);
        const user = users.find(u => u.userID === userID);
        if (!user) return { data: null, error: "Invalid credentials provided." };
        return { data: user, error: null };
    },

    async getEnrichedGrades(
        student: STUDENT | null, activeTerm: string, termDetails: ACADEMIC_TERM | undefined,
        programCourses: PROGRAM_COURSE[], courses: COURSE[], records: ACADEMIC_RECORD[],
        coursePrerequisites: COURSE_PREREQUISITE[], dismissedCourses: string[]
    ): Promise<EnrichedGradeRow[]> {
        if (!student || !termDetails) return [];
        await delay(150);

        const encodedRecords = records.filter(r => r.studentID === student.studentID && r.termID === activeTerm);
        const expectedPCs = programCourses.filter(pc => pc.programCode === student.programCode && pc.yearLevel === student.yearLevel && pc.termSem === termDetails.termSem);

        const encodedCourseCodes = encodedRecords.map(r => {
            const pc = programCourses.find(p => p.programCourseID === r.programCourseID);
            return pc ? pc.courseCode : null;
        }).filter(Boolean) as string[];

        const activeCourseCodes = Array.from(new Set([...expectedPCs.map(c => c.courseCode), ...encodedCourseCodes]))
            .filter(code => !dismissedCourses.includes(code));

        return activeCourseCodes.map(code => {
            const pc = programCourses.find(p => p.programCode === student.programCode && p.courseCode === code);
            const baseCourse = courses.find(c => c.courseCode === code);
            const rec = encodedRecords.find(r => r.programCourseID === pc?.programCourseID);

            let isMissingPrereq = false;
            const prereqCourseCodes: string[] = [];

            if (pc) {
                const prereqs = coursePrerequisites.filter(cp => cp.programCourseID === pc.programCourseID);
                for (const prereq of prereqs) {
                    const prereqPC = programCourses.find(p => p.programCourseID === prereq.prereqProgramCourseID);
                    if (prereqPC) prereqCourseCodes.push(prereqPC.courseCode);
                    const passed = records.some(r => r.studentID === student.studentID && r.programCourseID === prereq.prereqProgramCourseID && !r.isFailed && r.finalGrade !== null);
                    if (!passed) isMissingPrereq = true;
                }
            }

            // Map either the parsed numeric grade OR the letter grade remark to the frontend UI
            const displayGrade = rec?.gradeRemarks ? rec.gradeRemarks : (rec?.finalGrade?.toString() || "");

            return {
                courseCode: code, courseTitle: baseCourse?.courseTitle || "Unknown", courseUnits: baseCourse?.courseUnits || 0,
                isMajor: pc?.majorMinorClassif === "Major", isCQPAIncluded: pc?.isCQPAIncluded || false, prerequisites: prereqCourseCodes,
                recordID: rec?.recordID, finalGrade: displayGrade, isMissingPrereq,
                isBlank: rec?.finalGrade === null && !rec?.gradeRemarks
            };
        });
    },

    async getCurriculumProgress(student: STUDENT | null, activeTerm: string, programCourses: PROGRAM_COURSE[], records: ACADEMIC_RECORD[]) {
        if (!student) return { completed: [], enrolled: [], remaining: [] };
        await delay(150);
        const curProgCourses = programCourses.filter(pc => pc.programCode === student.programCode);
        const completed = curProgCourses.filter(pc => records.some(r => r.programCourseID === pc.programCourseID && r.studentID === student.studentID && !r.isFailed && r.finalGrade !== null));
        const enrolled = curProgCourses.filter(pc => records.some(r => r.programCourseID === pc.programCourseID && r.studentID === student.studentID && r.termID === activeTerm && (r.finalGrade === null && !r.gradeRemarks)));
        const remaining = curProgCourses.filter(pc => !completed.includes(pc) && !enrolled.includes(pc));
        return { completed, enrolled, remaining };
    },

    async createStudent(newStudentData: STUDENT, currentStudents: STUDENT[]) {
        await delay(200);
        if (currentStudents.some(s => s.studentID === newStudentData.studentID)) return { data: null, error: "A student with this ID already exists." };
        return { data: [newStudentData, ...currentStudents], error: null };
    },

    // REPLACE updateStudent AND ADD deleteStudent
    async updateStudent(updatedStudentData: STUDENT, currentStudents: STUDENT[]) {
        await delay(200);
        const updatedArray = currentStudents.map(s => s.studentID === updatedStudentData.studentID ? updatedStudentData : s);
        return { data: updatedArray, error: null };
    },

    async deleteStudent(studentID: string, currentStudents: STUDENT[], records: ACADEMIC_RECORD[], standings: TERM_STANDING[], remarks: ADVISING_REMARK[]) {
        await delay(300);
        // Mimics a cascading SQL delete
        const newStudents = currentStudents.filter(s => s.studentID !== studentID);
        const newRecords = records.filter(r => r.studentID !== studentID);
        const newStandings = standings.filter(ts => ts.studentID !== studentID);

        // Extract standing IDs that were deleted to delete associated remarks
        const deletedStandingIDs = standings.filter(ts => ts.studentID === studentID).map(ts => ts.standingID);
        const newRemarks = remarks.filter(rem => !deletedStandingIDs.includes(rem.standingID));

        return {
            data: { students: newStudents, records: newRecords, standings: newStandings, remarks: newRemarks },
            error: null
        };
    },

    async upsertGrade(
        courseCode: string, val: string, recordID: string | undefined, student: STUDENT, activeTerm: string,
        currentRecords: ACADEMIC_RECORD[], programCourses: PROGRAM_COURSE[], courses: COURSE[], program: DEGREE_PROGRAM,
        currentStandings: TERM_STANDING[], userID: string
    ) {
        await delay(100);

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

        let updatedRecordsArray = [...currentRecords];

        if (recordID) {
            updatedRecordsArray = currentRecords.map(r => r.recordID === recordID ? { ...r, finalGrade, isFailed, gradeRemarks } : r);
        } else {
            const pc = programCourses.find(p => p.programCode === student.programCode && p.courseCode === courseCode);
            if (!pc) return { recordsData: null, standingsData: null, error: "System Error: Course not found in curriculum." };
            const newRec: ACADEMIC_RECORD = {
                recordID: `REC-${Date.now()}`, finalGrade, isFailed, gradeRemarks, dateEncoded: new Date().toISOString(),
                programCourseID: pc.programCourseID, termID: activeTerm, studentID: student.studentID, userID
            };
            updatedRecordsArray.push(newRec);
        }

        // FIXED: Replaced duplicated logic with helper function
        const updatedStandingsArray = updateStandingAfterGradeChange(student.studentID, activeTerm, updatedRecordsArray, programCourses, courses, program, currentStandings);

        return { recordsData: updatedRecordsArray, standingsData: updatedStandingsArray, error: null };
    },

    async deleteGradeRow(recordID: string, currentRecords: ACADEMIC_RECORD[], studentID: string, activeTerm: string, programCourses: PROGRAM_COURSE[], courses: COURSE[], program: DEGREE_PROGRAM, currentStandings: TERM_STANDING[]) {
        await delay(100);
        const updatedRecordsArray = currentRecords.filter(r => r.recordID !== recordID);

        // FIXED: Replaced duplicated logic with helper function
        const updatedStandingsArray = updateStandingAfterGradeChange(studentID, activeTerm, updatedRecordsArray, programCourses, courses, program, currentStandings);

        return { recordsData: updatedRecordsArray, standingsData: updatedStandingsArray, error: null };
    },

    async upsertRemark(remarkForm: RemarkForm, editingRemarkID: string | null, studentID: string, activeTerm: string, authorID: string, currentRemarks: ADVISING_REMARK[], termStandings: TERM_STANDING[]) {
        await delay(200);
        const standing = termStandings.find(ts => ts.studentID === studentID && ts.termID === activeTerm);
        if (!standing) return { data: null, error: "Cannot add remarks: Student has no active standing record for this term." };

        if (editingRemarkID) {
            const newArray = currentRemarks.map(r => r.remarkID === editingRemarkID ? { ...r, category: remarkForm.category, content: remarkForm.content } : r);
            return { data: newArray, error: null };
        } else {
            const newRem: ADVISING_REMARK = {
                remarkID: `REM-${Date.now()}`, content: remarkForm.content, timestamp: new Date().toISOString(),
                userID: authorID, standingID: standing.standingID, category: remarkForm.category
            };
            return { data: [...currentRemarks, newRem], error: null };
        }
    },

    async deleteRemark(remarkID: string, currentRemarks: ADVISING_REMARK[]) {
        await delay(100);
        return { data: currentRemarks.filter(r => r.remarkID !== remarkID), error: null };
    },

    async generateAutoPopulateRecords(student: STUDENT, activeTerm: string, termDetails: ACADEMIC_TERM, programCourses: PROGRAM_COURSE[], records: ACADEMIC_RECORD[], userID: string) {
        await delay(100);
        const encodedRecords = records.filter(r => r.studentID === student.studentID && r.termID === activeTerm);
        const coursesToInject = programCourses.filter(pc => pc.programCode === student.programCode && pc.yearLevel === student.yearLevel && pc.termSem === termDetails.termSem);

        return coursesToInject
            .filter(ec => !encodedRecords.some(sr => sr.programCourseID === ec.programCourseID))
            .map(ec => ({
                recordID: `REC-${activeTerm}-${ec.programCourseID}-${student.studentID}`,
                finalGrade: null, isFailed: false, dateEncoded: new Date().toISOString(),
                programCourseID: ec.programCourseID, termID: activeTerm, studentID: student.studentID, userID
            }));
    },

    async validateCurriculum(newProgCode: string, newProgYear: string, editingProgCode: string | null, programs: DEGREE_PROGRAM[]) {
        await delay(100);
        const isDuplicate = programs.some(p => p.programCode === newProgCode && p.curriculumYear === newProgYear && p.programCode !== editingProgCode);
        return isDuplicate ? `A curriculum for ${newProgCode} already exists for the effective year ${newProgYear}.` : null;
    },

    async saveCourseToCurriculum(courseForm: CourseForm, selectedProgram: DEGREE_PROGRAM, editingCourseCode: string | null, currentCourses: COURSE[], currentProgramCourses: PROGRAM_COURSE[]) {
        await delay(200);
        const code = courseForm.courseCode.trim().toUpperCase();

        let newCoursesArray = [...currentCourses];
        if (!currentCourses.some(c => c.courseCode === code)) {
            newCoursesArray.push({ courseCode: code, courseTitle: courseForm.title, courseUnits: Number(courseForm.units) });
        } else {
            newCoursesArray = currentCourses.map(c => c.courseCode === code ? { ...c, courseTitle: courseForm.title, courseUnits: Number(courseForm.units) } : c);
        }

        const newPC: PROGRAM_COURSE = {
            programCourseID: `PC-${Date.now()}`,
            programCode: selectedProgram.programCode,
            courseCode: code,
            majorMinorClassif: courseForm.classification as "Major" | "Minor",
            isCQPAIncluded: courseForm.isCQPAIncluded,
            yearLevel: Number(courseForm.yearLevel),
            termSem: courseForm.semester as "1st Semester" | "2nd Semester" | "Midyear"
        };

        let newProgramCoursesArray = [...currentProgramCourses];
        if (editingCourseCode) {
            newProgramCoursesArray = currentProgramCourses.map(pc => (pc.programCode === selectedProgram.programCode && pc.courseCode === editingCourseCode) ? { ...pc, ...newPC, programCourseID: pc.programCourseID } : pc);
        } else {
            newProgramCoursesArray.push(newPC);
        }

        return { coursesData: newCoursesArray, programCoursesData: newProgramCoursesArray, error: null };
    },

    async generateReport(statusFilter: string, programFilter: string, yearFilter: string, accountFilter: string, students: STUDENT[], activeStandings: TERM_STANDING[]) {
        await delay(350);
        let reportData = activeStandings.map(ts => {
            const student = students.find(s => s.studentID === ts.studentID);
            return { ...ts, student };
        }).filter(record => record.student);

        // Filter by Account Status (Active / Inactive)
        if (accountFilter !== "All") {
            reportData = reportData.filter(r => r.student?.accountStatus === accountFilter);
        }

        if (statusFilter !== "All Students") {
            if (statusFilter === "All Flagged") {
                reportData = reportData.filter(r => r.termAcademicStatus === "On-Probation" || r.termAcademicStatus === "Advised to Shift");
            } else {
                reportData = reportData.filter(r => r.termAcademicStatus === statusFilter);
            }
        }

        if (programFilter !== "All") reportData = reportData.filter(r => r.student?.programCode === programFilter);
        if (yearFilter !== "All") reportData = reportData.filter(r => r.student?.yearLevel.toString() === yearFilter);

        return { data: reportData, error: null };
    }
};