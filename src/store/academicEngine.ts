// src/backend/academicEngine.ts
import type {
    ACADEMIC_RECORD, PROGRAM_COURSE, COURSE,
    TERM_STANDING, DEGREE_PROGRAM
} from "../store/types";

export const AcademicEngine = {

    // Computes the numeric average for a given set of records (Term QPA or Running CQPA)
    calculateQPA(records: ACADEMIC_RECORD[], programCourses: PROGRAM_COURSE[], courses: COURSE[]): number {
        let totalQualityPoints = 0;
        let totalUnits = 0;

        for (const record of records) {
            if (record.finalGrade === null) continue;

            const pc = programCourses.find(p => p.programCourseID === record.programCourseID);
            // POLICY: Skip calculation if course is excluded from CQPA (e.g., NSTP, PathFit)
            if (!pc || !pc.isCQPAIncluded) continue;

            const course = courses.find(c => c.courseCode === pc.courseCode);
            if (!course) continue;

            totalQualityPoints += (record.finalGrade * course.courseUnits);
            totalUnits += course.courseUnits;
        }

        // Rounds to 3 decimal places as per Data Dictionary DEC(4,3)
        return totalUnits === 0 ? 0.000 : Number((totalQualityPoints / totalUnits).toFixed(3));
    },

    // Evaluates policies to determine if a student is On-Probation or Advised to Shift
    evaluateAcademicStanding(
        studentID: string,
        activeTermID: string,
        allStudentRecords: ACADEMIC_RECORD[],
        programCourses: PROGRAM_COURSE[],
        courses: COURSE[],
        program: DEGREE_PROGRAM,
        historicalStandings: TERM_STANDING[]
    ): TERM_STANDING {

        // 1. Mathematical Calculations
        const termRecords = allStudentRecords.filter(r => r.termID === activeTermID);
        const semCQPA = this.calculateQPA(termRecords, programCourses, courses);
        const runningCQPA = this.calculateQPA(allStudentRecords, programCourses, courses);

        // 2. Base Evaluation (Assuming higher grades are better based on Table 9 samples)
        const threshold = program.passingGradeThreshold || 2.0;
        let status: "Regular" | "On-Probation" | "Advised to Shift" = semCQPA < threshold ? "On-Probation" : "Regular";
        let isConsecutive = false;

        // 3. Advised-to-Shift Policy Verification

        // Policy A: Check for failure of the same major subject twice
        const failedMajorCounts: Record<string, number> = {};
        const failedRecords = allStudentRecords.filter(r => r.isFailed);

        for (const fail of failedRecords) {
            const pc = programCourses.find(p => p.programCourseID === fail.programCourseID);
            if (pc && pc.majorMinorClassif === "Major") {
                failedMajorCounts[pc.courseCode] = (failedMajorCounts[pc.courseCode] || 0) + 1;
                if (failedMajorCounts[pc.courseCode] >= 2) {
                    status = "Advised to Shift";
                }
            }
        }

        // Policy B: Check for consecutive probations
        if (status === "On-Probation") {
            // Find the student's standing in the immediately preceding term
            const previousStandings = historicalStandings.filter(ts => ts.studentID === studentID && ts.termID !== activeTermID);
            if (previousStandings.length > 0) {
                // Assuming the last entry in the array is the most recent historical term
                const lastStanding = previousStandings[previousStandings.length - 1];
                if (lastStanding.termAcademicStatus === "On-Probation") {
                    status = "Advised to Shift";
                    isConsecutive = true;
                }
            }
        }

        return {
            standingID: `TS-${activeTermID}-${studentID}`,
            semCQPA,
            runningCQPA,
            termAcademicStatus: status,
            isConsecutiveOP: isConsecutive,
            studentID,
            termID: activeTermID
        };
    }
};