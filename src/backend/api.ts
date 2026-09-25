// src/backend/api.ts
import { supabase } from './supabaseClient';
import type {
    STUDENT, DEGREE_PROGRAM, COURSE, COMPASS_USER,
    PROGRAM_COURSE, TERM_STANDING, ADVISING_REMARK, ACADEMIC_RECORD,
    COURSE_PREREQUISITE, ACADEMIC_TERM, AUDIT_LOG, RETENTION_POLICY, SYSTEM_SETTINGS
} from '../store/types';

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

const generateID = (prefix: string) => {
    return `${prefix}${Math.random().toString(36).substring(2, 9).toUpperCase()}`.substring(0, 10);
};

const compareTerms = (termA: ACADEMIC_TERM, termB: ACADEMIC_TERM) => {
    if (termA.termSY !== termB.termSY) return termA.termSY.localeCompare(termB.termSY);
    const semWeights: Record<string, number> = { "1st Semester": 1, "2nd Semester": 2, "Midyear": 3 };
    return semWeights[termA.termSem] - semWeights[termB.termSem];
};

const cascadeStandings = (
    student: EnrichedStudent,
    updatedRecords: ACADEMIC_RECORD[],
    programCourses: PROGRAM_COURSE[],
    courses: COURSE[],
    retentionPolicies: RETENTION_POLICY[],
    systemSettings: { probationThreshold: number, atsThreshold: number },
    currentStandings: TERM_STANDING[],
    terms: ACADEMIC_TERM[],
    modifiedTermID: string
) => {
    const studentTermIDs = new Set(updatedRecords.filter(r => r.studentID === student.studentID).map(r => r.termID));
    studentTermIDs.add(modifiedTermID);
    const studentTerms = terms.filter(t => studentTermIDs.has(t.termID)).sort(compareTerms);

    const newStandings: TERM_STANDING[] = [];
    const unaffectedStandings = currentStandings.filter(ts => ts.studentID !== student.studentID);

    const sanitizeRecords = (rawRecords: ACADEMIC_RECORD[]) => {
        const map = new Map<string, ACADEMIC_RECORD>();
        rawRecords.forEach(r => {
            const existing = map.get(r.programCourseID);
            if (!existing || (existing.finalGrade === null && r.finalGrade !== null) || (!existing.gradeRemarks && r.gradeRemarks)) {
                map.set(r.programCourseID, r);
            }
        });
        return Array.from(map.values());
    };

    const cohortPolicy = retentionPolicies.find(p => p.programCode === student.programCode && p.effectiveYear === student.yearEnrolled);
    const majorThreshold = cohortPolicy ? cohortPolicy.majorPassingGrade : 2.0;

    for (const activeTermObj of studentTerms) {
        const activeTerm = activeTermObj.termID;

        const rawTermRecords = updatedRecords.filter(r => r.studentID === student.studentID && r.termID === activeTerm);
        const termRecords = sanitizeRecords(rawTermRecords);

        const rawHistRecords = updatedRecords.filter(r => {
            if (r.studentID !== student.studentID) return false;
            const rTerm = terms.find(t => t.termID === r.termID);
            return rTerm && compareTerms(rTerm, activeTermObj) <= 0;
        });
        const historicalRecords = sanitizeRecords(rawHistRecords);

        // Term QPA: Strict average of the active term
        let termPoints = 0; let termUnits = 0;
        termRecords.forEach(record => {
            const pc = programCourses.find(p => p.programCourseID === record.programCourseID);
            if (pc && pc.isCQPAIncluded && record.finalGrade !== null) {
                const baseCourse = courses.find(c => c.courseCode === pc.courseCode);
                const units = baseCourse ? baseCourse.courseUnits : 3;
                termPoints += (record.finalGrade * units);
                termUnits += units;
            }
        });
        const termQPA = termUnits > 0 ? (termPoints / termUnits) : 0.0;

        // CQPA: Implements Highest-Grade Replacement for Retakes
        const highestGradeMap = new Map<string, number>();
        historicalRecords.forEach(record => {
            const pc = programCourses.find(p => p.programCourseID === record.programCourseID);
            if (pc && pc.isCQPAIncluded && record.finalGrade !== null) {
                const existingGrade = highestGradeMap.get(pc.courseCode);
                if (existingGrade === undefined || record.finalGrade > existingGrade) {
                    highestGradeMap.set(pc.courseCode, record.finalGrade);
                }
            }
        });

        let cqpaPoints = 0; let cqpaUnits = 0;
        highestGradeMap.forEach((highestGrade, courseCode) => {
            const baseCourse = courses.find(c => c.courseCode === courseCode);
            const units = baseCourse ? baseCourse.courseUnits : 3;
            cqpaPoints += (highestGrade * units);
            cqpaUnits += units;
        });
        const semCQPA = cqpaUnits > 0 ? (cqpaPoints / cqpaUnits) : 0.0;

        // Major 2-Strike Counter
        let majorStrikeTriggered = false;
        const majorFailures = new Map<string, number>();
        historicalRecords.forEach(r => {
            const pc = programCourses.find(p => p.programCourseID === r.programCourseID);
            if (pc && pc.majorMinorClassif === 'Major' && r.finalGrade !== null) {
                if (r.finalGrade < majorThreshold) {
                    majorFailures.set(pc.courseCode, (majorFailures.get(pc.courseCode) || 0) + 1);
                    if (majorFailures.get(pc.courseCode)! >= 2) {
                        majorStrikeTriggered = true;
                    }
                }
            }
        });

        const validGradesCount = termRecords.filter(r => r.finalGrade !== null || r.gradeRemarks !== null).length;
        const isTermIncomplete = validGradesCount === 0;

        const pastStandings = newStandings.filter(ts => {
            const tsTerm = terms.find(t => t.termID === ts.termID);
            return tsTerm && compareTerms(tsTerm, activeTermObj) < 0;
        });
        const pastOPCount = pastStandings.filter(ts => ts.termAcademicStatus === "On-Probation" || ts.termAcademicStatus === "Advised to Shift").length;

        let status: "Regular" | "On-Probation" | "Advised to Shift" | "Unencoded";
        let isConsecutiveOP = false;

        if (isTermIncomplete) {
            status = "Unencoded";
        } else if (majorStrikeTriggered) {
            status = "Advised to Shift";
        } else {
            // FIXED: Standing evaluates CQPA against global boundaries, ignoring TQPA
            if (semCQPA < systemSettings.atsThreshold) {
                status = "Advised to Shift";
            } else if (semCQPA < systemSettings.probationThreshold) {
                status = "On-Probation";
                if (pastOPCount >= 1) {
                    status = "Advised to Shift";
                    isConsecutiveOP = true;
                }
            } else {
                status = "Regular";
            }
        }

        const existingStanding = currentStandings.find(ts => ts.studentID === student.studentID && ts.termID === activeTerm);
        const standingID = existingStanding ? existingStanding.standingID : generateID('ST-');

        newStandings.push({
            standingID, termQPA, semCQPA, termAcademicStatus: status,
            isConsecutiveOP, studentID: student.studentID, termID: activeTerm
        });
    }

    return { newStandings, updatedStandingsArray: [...unaffectedStandings, ...newStandings] };
};

export const backendAPI = {
    // FIXED: Added optional records and terms parameters to support expired INC scanning
    getManualReviewList(
        standings: TERM_STANDING[], remarks: ADVISING_REMARK[], activeTerm: string,
        activeUser: COMPASS_USER | null, records?: ACADEMIC_RECORD[], terms?: ACADEMIC_TERM[]
    ) {
        const safeStandings = standings || [];
        const safeRemarks = remarks || [];

        const baseList = safeStandings.filter(ts => {
            if (ts.termID !== activeTerm) return false;
            if (ts.termAcademicStatus === 'On-Probation') return false;

            if (ts.termAcademicStatus === 'Advised to Shift') {
                const isAddressed = safeRemarks.some(r => r.standingID === ts.standingID && r.content && r.content.includes('[Shifting Recommended]'));
                return !isAddressed;
            }
            return ts.termAcademicStatus === 'Unencoded' && activeUser?.userType !== 'Deans_Office_Staff';
        });

        // Scan for unresolved INCs from strictly older semesters
        if (records && terms) {
            const activeTermObj = terms.find(t => t.termID === activeTerm);
            if (activeTermObj) {
                const expiredIncs = records.filter(r => {
                    if (r.gradeRemarks !== 'INC') return false;
                    const rTerm = terms.find(t => t.termID === r.termID);
                    return rTerm && compareTerms(rTerm, activeTermObj) < 0;
                });

                expiredIncs.forEach(inc => {
                    const activeTs = safeStandings.find(ts => ts.studentID === inc.studentID && ts.termID === activeTerm);
                    if (activeTs && !baseList.some(r => r.standingID === activeTs.standingID)) {
                        baseList.push(activeTs);
                    }
                });
            }
        }
        return baseList;
    },

    async fetchInitialSystemData() {
        const [stuRes, spRes, progRes, courRes, pcRes, recRes, remRes, standRes, termRes, preRes, polRes, logRes, sysRes] = await Promise.all([
            supabase.from('STUDENT').select('*'),
            supabase.from('STUDENT_PROGRAM').select('*'),
            supabase.from('DEGREE_PROGRAM').select('*'),
            supabase.from('COURSE').select('*'),
            supabase.from('PROGRAM_COURSE').select('*'),
            supabase.from('ACADEMIC_RECORD').select('*'),
            supabase.from('ADVISING_REMARK').select('*'),
            supabase.from('TERM_STANDING').select('*'),
            supabase.from('ACADEMIC_TERM').select('*'),
            supabase.from('COURSE_PREREQUISITE').select('*'),
            supabase.from('RETENTION_POLICY').select('*'),
            supabase.from('AUDIT_LOG').select('*').order('timestamp', { ascending: false }).limit(200),
            supabase.from('SYSTEM_SETTINGS').select('*')
        ]);

        if (stuRes.error) return { data: null, error: stuRes.error.message };

        const rawStudents = stuRes.data as STUDENT[];
        const studentPrograms = (spRes.data || []) as { studentID: string; programCode: string }[];

        const enrichedStudents: EnrichedStudent[] = rawStudents.map(student => {
            const sp = studentPrograms.find(sp => sp.studentID === student.studentID);
            return {
                ...student,
                programCode: sp ? sp.programCode : "Unassigned"
            };
        });

        const sysData = sysRes.data && sysRes.data.length > 0
            ? sysRes.data[0]
            : { id: 'global', probationThreshold: 2.0, atsThreshold: 1.0 };

        // FIXED: Foundational map to cure the yrLevel vs yearLevel database collision globally
        const rawProgramCourses = (pcRes.data || []) as any[];
        const mappedProgramCourses: PROGRAM_COURSE[] = rawProgramCourses.map(pc => ({
            ...pc,
            yearLevel: pc.yrLevel !== undefined ? Number(pc.yrLevel) : Number(pc.yearLevel)
        }));

        return {
            data: {
                students: enrichedStudents,
                programs: progRes.data as DEGREE_PROGRAM[],
                courses: courRes.data as COURSE[],
                programCourses: mappedProgramCourses, // Replaced with the mapped array
                records: recRes.data as ACADEMIC_RECORD[],
                remarks: remRes.data as ADVISING_REMARK[],
                standings: standRes.data as TERM_STANDING[],
                terms: termRes.data as ACADEMIC_TERM[],
                coursePrerequisites: preRes.data as COURSE_PREREQUISITE[],
                retentionPolicies: (polRes.data || []) as RETENTION_POLICY[],
                auditLogs: (logRes.data || []) as AUDIT_LOG[],
                systemSettings: sysData as SYSTEM_SETTINGS
            },
            error: null
        };
    },

    async pushAuditLog(logID: string, userID: string, action: string, target: string) {
        const { error } = await supabase
            .from('AUDIT_LOG')
            .insert([{ logID, timestamp: new Date().toISOString(), userID, action, target }]);
        if (error) console.error("Audit Logging Failed:", error.message);
    },

    async createTerm(
        newTerm: ACADEMIC_TERM, startYear: number, isNewCohort: boolean,
        customPolicies: { programCode: string; majorPassingGrade: number; minorPassingGrade: number; }[] | null,
        currentPolicies: RETENTION_POLICY[], programs: DEGREE_PROGRAM[]
    ) {
        const { error: termError } = await supabase.from('ACADEMIC_TERM').insert([newTerm]);
        if (termError) return { error: termError.message, newPolicies: null };

        let newInsertedPolicies: RETENTION_POLICY[] = [];

        // Automated Cohort Inheritance Engine
        if (isNewCohort) {
            if (customPolicies && customPolicies.length > 0) {
                // User opted to override: Insert their custom tabular data
                const mappedToInsert: RETENTION_POLICY[] = customPolicies.map(cp => ({
                    policyID: generateID('RP-'),
                    programCode: cp.programCode,
                    effectiveYear: startYear,
                    majorPassingGrade: cp.majorPassingGrade,
                    minorPassingGrade: cp.minorPassingGrade
                }));
                const { error: polError } = await supabase.from('RETENTION_POLICY').insert(mappedToInsert);
                if (polError) return { error: polError.message, newPolicies: null };
                newInsertedPolicies = mappedToInsert;
            } else {
                // User ignored the button: Auto-clone the latest previous policies
                const priorPolicies = currentPolicies.filter(p => p.effectiveYear < startYear);
                const maxYear = priorPolicies.length > 0 ? Math.max(...priorPolicies.map(p => p.effectiveYear)) : null;

                let fallbackInsert: RETENTION_POLICY[] = [];

                if (maxYear !== null) {
                    const latestPolicies = currentPolicies.filter(p => p.effectiveYear === maxYear);
                    fallbackInsert = latestPolicies.map(p => ({
                        policyID: generateID('RP-'), programCode: p.programCode,
                        effectiveYear: startYear, majorPassingGrade: p.majorPassingGrade, minorPassingGrade: p.minorPassingGrade
                    }));
                } else {
                    // Failsafe if the database was completely empty
                    fallbackInsert = programs.map(prog => ({
                        policyID: generateID('RP-'), programCode: prog.programCode,
                        effectiveYear: startYear, majorPassingGrade: 2.0, minorPassingGrade: 2.0
                    }));
                }

                if (fallbackInsert.length > 0) {
                    const { error: polError } = await supabase.from('RETENTION_POLICY').insert(fallbackInsert);
                    if (polError) return { error: polError.message, newPolicies: null };
                    newInsertedPolicies = fallbackInsert;
                }
            }
        }

        return { error: null, newPolicies: newInsertedPolicies };
    },

    async updateActiveTerm(newActiveTermID: string) {
        const { error: resetError } = await supabase
            .from('ACADEMIC_TERM')
            .update({ isCurrent: false })
            .eq('isCurrent', true);

        if (resetError) return { error: resetError.message };

        const { error: setActiveError } = await supabase
            .from('ACADEMIC_TERM')
            .update({ isCurrent: true })
            .eq('termID', newActiveTermID);

        if (setActiveError) return { error: setActiveError.message };

        return { error: null };
    },

    async getEnrichedGrades(
        student: EnrichedStudent | null, activeTerm: string, termDetails: ACADEMIC_TERM | undefined,
        programCourses: PROGRAM_COURSE[], courses: COURSE[], records: ACADEMIC_RECORD[],
        prereqs: COURSE_PREREQUISITE[], dismissedCourses: string[], globalActiveTermID: string,
        retentionPolicies: RETENTION_POLICY[] // FIXED: Added policy integration
    ) {
        if (!student || !termDetails) return [];
        const studentRecords = records.filter(r => r.studentID === student.studentID && r.termID === activeTerm);
        const displayRows: EnrichedGradeRow[] = [];

        const cohortPolicy = retentionPolicies.find(p => p.programCode === student.programCode && p.effectiveYear === student.yearEnrolled);

        // FIXED: Universal prerequisite evaluator that checks grades against cohort-specific thresholds
        const checkPassed = (prereqID: string) => {
            return records.find(hr => {
                if (hr.studentID !== student.studentID || hr.termID >= activeTerm) return false;
                if (hr.programCourseID !== prereqID) return false;
                if (hr.isFailed) return false;
                if (hr.finalGrade === null) return false;

                const prereqPc = programCourses.find(p => p.programCourseID === hr.programCourseID);
                const passMark = cohortPolicy ? (prereqPc?.majorMinorClassif === 'Major' ? cohortPolicy.majorPassingGrade : cohortPolicy.minorPassingGrade) : 1.0;
                return hr.finalGrade >= passMark;
            });
        };

        studentRecords.forEach(record => {
            const pc = programCourses.find(p => p.programCourseID === record.programCourseID);
            if (pc && !displayRows.some(row => row.courseCode === pc.courseCode)) {
                const baseCourse = courses.find(c => c.courseCode === pc.courseCode);
                let isMissingPrereq = false;
                const coursePrereqs = prereqs.filter(pr => pr.programCourseID === pc.programCourseID);

                if (coursePrereqs.length > 0) {
                    coursePrereqs.forEach(pr => { if (!checkPassed(pr.prereqProgramCourseID)) isMissingPrereq = true; });
                }

                displayRows.push({
                    courseCode: pc.courseCode, courseTitle: baseCourse?.courseTitle || "Unknown", courseUnits: baseCourse?.courseUnits || 0,
                    isMissingPrereq, finalGrade: record.finalGrade !== null ? (record.finalGrade === 0 ? "F" : record.finalGrade.toString()) : (record.gradeRemarks || ""),
                    isBlank: record.finalGrade === null && !record.gradeRemarks, recordID: record.recordID
                });
            }
        });

        if (termDetails.termID === globalActiveTermID) {
            const curriculum = programCourses.filter(pc => pc.programCode === student.programCode && pc.yearLevel === student.yearLevel && pc.termSem === termDetails.termSem);

            curriculum.forEach(pc => {
                if (!displayRows.some(row => row.courseCode === pc.courseCode) && !dismissedCourses.includes(pc.courseCode)) {
                    const baseCourse = courses.find(c => c.courseCode === pc.courseCode);
                    let isMissingPrereq = false;
                    const coursePrereqs = prereqs.filter(pr => pr.programCourseID === pc.programCourseID);

                    if (coursePrereqs.length > 0) {
                        coursePrereqs.forEach(pr => { if (!checkPassed(pr.prereqProgramCourseID)) isMissingPrereq = true; });
                    }

                    displayRows.push({
                        courseCode: pc.courseCode, courseTitle: baseCourse?.courseTitle || "Unknown", courseUnits: baseCourse?.courseUnits || 0,
                        isMissingPrereq, finalGrade: "", isBlank: true, recordID: undefined
                    });
                }
            });
        }
        return displayRows;
    },

    async getCurriculumProgress(
        student: EnrichedStudent | null, activeTerm: string, programCourses: PROGRAM_COURSE[],
        records: ACADEMIC_RECORD[], retentionPolicies: RETENTION_POLICY[] // FIXED: Added
    ) {
        if (!student) return { completed: [], enrolled: [], remaining: [] };
        const curriculum = programCourses.filter(pc => pc.programCode === student.programCode);
        const studentRecords = records.filter(r => r.studentID === student.studentID);
        const policy = retentionPolicies.find(p => p.programCode === student.programCode && p.effectiveYear === student.yearEnrolled);

        const completed: PROGRAM_COURSE[] = []; const enrolled: PROGRAM_COURSE[] = []; const remaining: PROGRAM_COURSE[] = [];

        curriculum.forEach(pc => {
            const history = studentRecords.filter(r => r.programCourseID === pc.programCourseID);
            const passMark = policy ? (pc.majorMinorClassif === 'Major' ? policy.majorPassingGrade : policy.minorPassingGrade) : 1.0;

            const passed = history.find(r => r.finalGrade !== null && r.finalGrade >= passMark && !r.isFailed);
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
        const curriculum = programCourses.filter(pc => {
            const pcYear = Number(pc.yearLevel) || Number((pc as any).yrLevel);
            const studentYear = Number(student.yearLevel);
            return pc.programCode === student.programCode &&
                pcYear === studentYear &&
                pc.termSem === termDetails.termSem;
        });

        if (curriculum.length === 0) {
            return { data: [], newStanding: null, error: `No courses found in the curriculum template for ${student.programCode}, Year ${student.yearLevel}, ${termDetails.termSem}. Please map these subjects in the Curriculum Manager.` };
        }

        const existingRecords = records.filter(r => r.studentID === student.studentID && r.termID === activeTerm);
        const newRecords: ACADEMIC_RECORD[] = [];

        for (const pc of curriculum) {
            if (!existingRecords.some(r => r.programCourseID === pc.programCourseID)) {
                const newRec: ACADEMIC_RECORD = {
                    recordID: generateID('RC-'), finalGrade: null, isFailed: false,
                    dateEncoded: new Date().toISOString().split('T')[0],
                    programCourseID: pc.programCourseID, termID: activeTerm,
                    studentID: student.studentID, userID, gradeRemarks: null
                };
                newRecords.push(newRec);
            }
        }

        if (newRecords.length > 0) {
            const { error } = await supabase.from('ACADEMIC_RECORD').insert(newRecords);
            if (error) return { data: [], newStanding: null, error: error.message };

            // FIXED: Generates an immediate standing so the term doesn't disappear from Academic History
            const basicStanding: TERM_STANDING = {
                standingID: generateID('ST-'), termQPA: 0, semCQPA: 0,
                termAcademicStatus: 'Unencoded', isConsecutiveOP: false,
                studentID: student.studentID, termID: activeTerm
            };

            const { data: exist } = await supabase.from('TERM_STANDING').select('*').eq('studentID', student.studentID).eq('termID', activeTerm);
            if (!exist || exist.length === 0) {
                await supabase.from('TERM_STANDING').insert([basicStanding]);
                return { data: newRecords, newStanding: basicStanding, error: null };
            }

            return { data: newRecords, newStanding: null, error: null };
        }

        return { data: [], newStanding: null, error: "All curriculum subjects for this term are already populated on the screen." };
    },

    async upsertGrade(
        courseCode: string, val: string, recordID: string | undefined, student: EnrichedStudent, activeTerm: string,
        currentRecords: ACADEMIC_RECORD[], programCourses: PROGRAM_COURSE[], courses: COURSE[], program: DEGREE_PROGRAM,
        currentStandings: TERM_STANDING[], userID: string, terms: ACADEMIC_TERM[], retentionPolicies: RETENTION_POLICY[]
    ) {
        let finalGrade: number | null = null; let gradeRemarks: string | null = null; let isFailed = false;

        const upperVal = val.trim().toUpperCase();

        const pc = programCourses.find(p => p.programCode === student.programCode && p.courseCode === courseCode);
        const cohortPolicy = retentionPolicies.find(p => p.programCode === student.programCode && p.effectiveYear === student.yearEnrolled);
        const threshold = cohortPolicy ? (pc?.majorMinorClassif === 'Major' ? cohortPolicy.majorPassingGrade : cohortPolicy.minorPassingGrade) : 1.0;

        if (upperVal === "") {
            finalGrade = null; gradeRemarks = null;
        } else if (upperVal === "F") {
            finalGrade = 0.0; isFailed = true;
        } else if (["INC", "NG", "W", "D"].includes(upperVal)) {
            gradeRemarks = upperVal;
            if (["NG", "D"].includes(upperVal)) isFailed = true;
        } else {
            const parsedGrade = Number(upperVal);
            if (isNaN(parsedGrade) || parsedGrade < 0.0 || parsedGrade > 4.0) {
                return { recordsData: null, standingsData: null, error: "Invalid input. Please enter a numerical grade between 0.0 and 4.0, or a valid remark." };
            }
            finalGrade = parsedGrade;
            // FIXED: Dynamically triggers failure in DB if grade is below the cohort policy threshold
            if (finalGrade < threshold) isFailed = true;
        }

        let updatedRecord: ACADEMIC_RECORD;
        const updatedRecordsArray = [...currentRecords];

        if (recordID) {
            updatedRecord = { ...currentRecords.find(r => r.recordID === recordID)!, finalGrade, isFailed, gradeRemarks: gradeRemarks || null };
            const { error } = await supabase.from('ACADEMIC_RECORD').update({ finalGrade, isFailed, gradeRemarks }).eq('recordID', recordID);
            if (error) return { recordsData: null, standingsData: null, error: error.message };
            const index = updatedRecordsArray.findIndex(r => r.recordID === recordID);
            updatedRecordsArray[index] = updatedRecord;
        } else {
            const pc = programCourses.find(p => p.programCode === student.programCode && p.courseCode === courseCode);
            if (!pc) return { recordsData: null, standingsData: null, error: "Course not found in curriculum." };
            updatedRecord = {
                recordID: generateID('RC-'), finalGrade, isFailed, gradeRemarks: gradeRemarks || null, dateEncoded: new Date().toISOString().split('T')[0],
                programCourseID: pc.programCourseID, termID: activeTerm, studentID: student.studentID, userID
            };
            const { error } = await supabase.from('ACADEMIC_RECORD').insert([{ ...updatedRecord, gradeRemarks }]);
            if (error) return { recordsData: null, standingsData: null, error: error.message };
            updatedRecordsArray.push(updatedRecord);
        }

        // FIXED: Dynamically fetch global settings to prevent Evaluator crashes, then cascade.
        const { data: sysRes } = await supabase.from('SYSTEM_SETTINGS').select('*').eq('id', 'global').single();
        const systemSettings = sysRes || { probationThreshold: 2.0, atsThreshold: 1.0 };

        const { newStandings, updatedStandingsArray } = cascadeStandings(student, updatedRecordsArray, programCourses, courses, retentionPolicies, systemSettings, currentStandings, terms, activeTerm);

        const dbStandings = newStandings.map(ns => ({
            ...ns,
            termAcademicStatus: (ns.termAcademicStatus as string) === 'Advised to Shift' ? 'Advised-to-Shift' : ns.termAcademicStatus
        }));

        const { error: standError } = await supabase.from('TERM_STANDING').upsert(dbStandings, { onConflict: 'standingID' });
        if (standError) return { recordsData: null, standingsData: null, error: standError.message };

        return { recordsData: updatedRecordsArray, standingsData: updatedStandingsArray, error: null };
    },

    async deleteGradeRow(
        recordID: string, currentRecords: ACADEMIC_RECORD[], student: EnrichedStudent, activeTerm: string, // CHANGED TO EnrichedStudent
        programCourses: PROGRAM_COURSE[], courses: COURSE[], program: DEGREE_PROGRAM,
        currentStandings: TERM_STANDING[], terms: ACADEMIC_TERM[], retentionPolicies: RETENTION_POLICY[] // ADDED PARAMETER
    ) {
        const { error } = await supabase.from('ACADEMIC_RECORD').delete().eq('recordID', recordID);
        if (error) return { recordsData: null, standingsData: null, error: error.message };

        const updatedRecordsArray = currentRecords.filter(r => r.recordID !== recordID);

        // FIXED: Dynamically fetch global settings prior to cascading deletions.
        const { data: sysRes } = await supabase.from('SYSTEM_SETTINGS').select('*').eq('id', 'global').single();
        const systemSettings = sysRes || { probationThreshold: 2.0, atsThreshold: 1.0 };

        const { newStandings, updatedStandingsArray } = cascadeStandings(student, updatedRecordsArray, programCourses, courses, retentionPolicies, systemSettings, currentStandings, terms, activeTerm);

        const dbStandings = newStandings.map(ns => ({
            ...ns,
            termAcademicStatus: (ns.termAcademicStatus as string) === 'Advised to Shift' ? 'Advised-to-Shift' : ns.termAcademicStatus
        }));
        await supabase.from('TERM_STANDING').upsert(dbStandings, { onConflict: 'standingID' });

        return { recordsData: updatedRecordsArray, standingsData: updatedStandingsArray, error: null };
    },

    async createStudent(newStudent: EnrichedStudent, currentStudents: EnrichedStudent[]) {
        const baseStudent = {
            studentID: newStudent.studentID,
            studFirstName: newStudent.studFirstName,
            studMiddleName: newStudent.studMiddleName || null,
            studLastName: newStudent.studLastName,
            shsTrack: newStudent.shsTrack,
            yearLevel: newStudent.yearLevel,
            accountStatus: newStudent.accountStatus,
            yearEnrolled: newStudent.yearEnrolled // ADDED THIS LINE
        };
        // ... rest of function remains identical

        const { error: studentError } = await supabase.from('STUDENT').insert([baseStudent]);
        if (studentError) return { data: null, error: studentError.message };

        const progLink = {
            studProgID: generateID('SP-'),
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
            studMiddleName: updatedData.studMiddleName || null,
            studLastName: updatedData.studLastName,
            shsTrack: updatedData.shsTrack,
            yearLevel: updatedData.yearLevel,
            accountStatus: updatedData.accountStatus,
            yearEnrolled: updatedData.yearEnrolled // ADDED THIS LINE
        };
        // ... rest of function remains identical

        const { error: studentError } = await supabase.from('STUDENT').update(baseStudent).eq('studentID', updatedData.studentID);
        if (studentError) return { data: null, error: studentError.message };

        const existingStudent = currentStudents.find(s => s.studentID === updatedData.studentID);
        if (existingStudent && existingStudent.programCode !== updatedData.programCode) {
            const progLink = { studProgID: generateID('SP-'), programCode: updatedData.programCode, studentID: updatedData.studentID };
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
            updatedRemark = { ...remarks.find(r => r.remarkID === remarkID)!, content: remarkForm.content };
            const { error } = await supabase.from('ADVISING_REMARK').update({ content: remarkForm.content }).eq('remarkID', remarkID);
            if (error) return { data: null, error: error.message };
            const index = updatedRemarks.findIndex(r => r.remarkID === remarkID);
            updatedRemarks[index] = updatedRemark;
        } else {
            const finalContent = `[${remarkForm.category}] ${remarkForm.content}`;
            updatedRemark = { remarkID: generateID('RM-'), content: finalContent, timestamp: new Date().toISOString(), userID, standingID: targetStanding.standingID };
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

    // REVISION 1 (Prerequisite Validation): Strictly splits arrays, validates existence, and wipes old data to prevent duplication.
    async saveCourseToCurriculum(
        payload: { courseCode: string; title: string; units: string; yearLevel: string; semester: string; classification: string; isCQPAIncluded: boolean; prerequisites: string; },
        program: DEGREE_PROGRAM, editingCourseCode: string | null, courses: COURSE[], programCourses: PROGRAM_COURSE[], currentPrereqs: COURSE_PREREQUISITE[]
    ) {
        // 1. Prepare raw inputs by splitting commas and trimming
        const rawPrereqs = payload.prerequisites.split(',').map(s => s.trim()).filter(s => s !== "");

        // 2. Global DB Check: Strip spaces and uppercase BOTH sides for perfect format-agnostic matching
        for (const rawCode of rawPrereqs) {
            const normRaw = rawCode.replace(/\s+/g, "").toUpperCase();
            const existsGlobally = courses.some(c => c.courseCode.replace(/\s+/g, "").toUpperCase() === normRaw);
            if (!existsGlobally) {
                return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: `Invalid Prerequisite: Course '${rawCode}' does not exist in the institutional database.` };
            }
        }

        const baseCourse: COURSE = { courseCode: payload.courseCode, courseTitle: payload.title, courseUnits: Number(payload.units) };

        const progCourseDB = {
            programCourseID: editingCourseCode ? programCourses.find(pc => pc.courseCode === editingCourseCode && pc.programCode === program.programCode)!.programCourseID : generateID('PC-'),
            programCode: program.programCode,
            courseCode: payload.courseCode,
            majorMinorClassif: payload.classification as "Major" | "Minor",
            isCQPAIncluded: payload.isCQPAIncluded,
            yrLevel: Number(payload.yearLevel),
            termSem: payload.semester as "1st Semester" | "2nd Semester" | "Midyear"
        };

        const existingCourse = courses.find(c => c.courseCode === payload.courseCode);
        if (!existingCourse) await supabase.from('COURSE').insert([baseCourse]);
        else await supabase.from('COURSE').update(baseCourse).eq('courseCode', payload.courseCode);

        if (editingCourseCode) await supabase.from('PROGRAM_COURSE').update(progCourseDB).eq('programCourseID', progCourseDB.programCourseID);
        else await supabase.from('PROGRAM_COURSE').insert([progCourseDB]);

        const newCourses = existingCourse ? courses.map(c => c.courseCode === payload.courseCode ? baseCourse : c) : [...courses, baseCourse];

        const { yrLevel, ...rest } = progCourseDB;
        const progCourseFrontend: PROGRAM_COURSE = {
            ...rest,
            yearLevel: yrLevel,
            majorMinorClassif: rest.majorMinorClassif as "Major" | "Minor",
        };

        const newProgCourses = editingCourseCode ? programCourses.map(pc => pc.programCourseID === progCourseFrontend.programCourseID ? progCourseFrontend : pc) : [...programCourses, progCourseFrontend];

        const finalProgCourseID = progCourseDB.programCourseID;

        const normalizedProgCourses = newProgCourses.filter(pc => pc.programCode === program.programCode).map(pc => ({
            ...pc,
            normalizedCode: pc.courseCode.replace(/\s+/g, "").toUpperCase()
        }));

        const newPrereqs: COURSE_PREREQUISITE[] = [];

        for (const rawCode of rawPrereqs) {
            const normRaw = rawCode.replace(/\s+/g, "").toUpperCase();
            const match = normalizedProgCourses.find(pc => pc.normalizedCode === normRaw);

            if (!match) {
                return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: `Invalid Prerequisite: '${rawCode}' is not mapped to this program's curriculum. Please add it to the program first.` };
            }
            if (match.programCourseID === finalProgCourseID) {
                return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: `Invalid Prerequisite: A course cannot be a prerequisite for itself.` };
            }

            newPrereqs.push({ prereqID: generateID('PR-'), programCourseID: finalProgCourseID, prereqProgramCourseID: match.programCourseID });
        }

        // 4. Wipe old prerequisite relationships & save new matches
        await supabase.from('COURSE_PREREQUISITE').delete().eq('programCourseID', finalProgCourseID);

        if (newPrereqs.length > 0) {
            const { error: prError } = await supabase.from('COURSE_PREREQUISITE').insert(newPrereqs);
            if (prError) return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: prError.message };
        }

        const filteredPrereqs = currentPrereqs.filter(pr => pr.programCourseID !== finalProgCourseID);
        const updatedPrereqs = [...filteredPrereqs, ...newPrereqs];

        return { coursesData: newCourses, programCoursesData: newProgCourses, coursePrerequisitesData: updatedPrereqs, error: null };
    },

    // INSIDE export const backendAPI = { ... }

    async deleteCourseFromCurriculum(
        programCode: string, courseCode: string, programCourses: PROGRAM_COURSE[], currentPrereqs: COURSE_PREREQUISITE[]
    ) {
        const targetPC = programCourses.find(pc => pc.programCode === programCode && pc.courseCode === courseCode);
        if (!targetPC) return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: "Curriculum mapping not found in database." };

        // 1. Wipe associated prerequisites first to prevent Foreign Key constraint violations
        await supabase.from('COURSE_PREREQUISITE').delete().eq('programCourseID', targetPC.programCourseID);
        await supabase.from('COURSE_PREREQUISITE').delete().eq('prereqProgramCourseID', targetPC.programCourseID);

        // 2. Delete the actual program course mapping
        const { error } = await supabase.from('PROGRAM_COURSE').delete().eq('programCourseID', targetPC.programCourseID);

        if (error) {
            if (error.code === '23503') return { programCoursesData: null, coursePrerequisitesData: null, error: "Cannot delete this course because student academic records are actively tied to it." };
            return { programCoursesData: null, coursePrerequisitesData: null, error: error.message };
        }

        const updatedProgramCourses = programCourses.filter(pc => pc.programCourseID !== targetPC.programCourseID);
        const updatedPrereqs = currentPrereqs.filter(pr => pr.programCourseID !== targetPC.programCourseID && pr.prereqProgramCourseID !== targetPC.programCourseID);

        return { programCoursesData: updatedProgramCourses, coursePrerequisitesData: updatedPrereqs, error: null };
    },

    async generateReport(
        statusFilter: string, programFilter: string, yearFilter: string, accountFilter: string,
        students: EnrichedStudent[], activeStandings: TERM_STANDING[]
    ) {
        const data = students.map(student => {
            const ts = activeStandings.find(t => t.studentID === student.studentID);
            return {
                standingID: ts?.standingID || `TEMP-${student.studentID}`,
                termQPA: ts?.termQPA || 0,
                semCQPA: ts?.semCQPA || 0,
                termAcademicStatus: ts?.termAcademicStatus || "Unencoded",
                isConsecutiveOP: ts?.isConsecutiveOP || false,
                studentID: student.studentID,
                termID: ts?.termID || "N/A",
                student: student
            };
        });

        const filtered = data.filter(record => {
            const matchStatus = statusFilter === "All Students" ||
                (statusFilter === "All Flagged" && (record.termAcademicStatus === "On-Probation" || record.termAcademicStatus === "Advised to Shift")) ||
                record.termAcademicStatus === statusFilter;
            const matchProgram = programFilter === "All" || record.student.programCode === programFilter;
            const matchYear = yearFilter === "All" || record.student.yearLevel.toString() === yearFilter;
            const matchAccount = accountFilter === "All" || record.student.accountStatus === accountFilter;
            return matchStatus && matchProgram && matchYear && matchAccount;
        });

        return { data: filtered as (TERM_STANDING & { student: EnrichedStudent })[], error: null };
    },

    async updateSystemSettings(newSettings: SYSTEM_SETTINGS) {
        const { error } = await supabase.from('SYSTEM_SETTINGS').update(newSettings).eq('id', 'global');
        return { error: error ? error.message : null };
    },

    // FIXED: Added missing SQL execution block for updating user profiles from Settings
    async updateUserProfile(userID: string, firstName: string, middleName: string | null, lastName: string) {
        const { error } = await supabase
            .from('COMPASS_USER')
            .update({
                userFirstName: firstName,
                userMiddleName: middleName,
                userLastName: lastName
            })
            .eq('userID', userID);
        return { error: error ? error.message : null };
    }
};