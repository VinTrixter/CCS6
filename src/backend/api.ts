// src/backend/api.ts
import { supabase } from './supabaseClient';
import type {
    STUDENT, DEGREE_PROGRAM, COURSE, COMPASS_USER,
    PROGRAM_COURSE, TERM_STANDING, ADVISING_REMARK, ACADEMIC_RECORD,
    COURSE_PREREQUISITE, ACADEMIC_TERM, AUDIT_LOG, RETENTION_POLICY, SYSTEM_SETTINGS,
    MANUAL_REVIEW_ITEM
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

const generateID = (prefix: string, maxLength: number = 10) => {
    return `${prefix}${Math.random().toString(36).substring(2, 9).toUpperCase()}`.substring(0, maxLength);
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
    systemSettings: { probationThreshold: number },
    currentStandings: TERM_STANDING[],
    terms: ACADEMIC_TERM[],
    modifiedTermID: string,
    skipYearLevelAutoCalc: boolean = false
) => {
    const modifiedTermObj = terms.find(t => t.termID === modifiedTermID);
    const studentTermIDs = new Set<string>();
    studentTermIDs.add(modifiedTermID);

    if (modifiedTermObj) {
        updatedRecords.filter(r => r.studentID === student.studentID).forEach(r => {
            const rTerm = terms.find(t => t.termID === r.termID);
            if (rTerm && compareTerms(rTerm, modifiedTermObj) >= 0) {
                studentTermIDs.add(r.termID);
            }
        });

        currentStandings.filter(ts => ts.studentID === student.studentID).forEach(ts => {
            const tsTerm = terms.find(t => t.termID === ts.termID);
            if (tsTerm && compareTerms(tsTerm, modifiedTermObj) >= 0) {
                studentTermIDs.add(ts.termID);
            }
        });
    }

    const studentTerms = terms.filter(t => studentTermIDs.has(t.termID)).sort(compareTerms);

    const newStandings: TERM_STANDING[] = [];
    // TARGETED FIX: Only exclude the specific terms being recalculated for this student, retaining their history.
    const unaffectedStandings = currentStandings.filter(ts => ts.studentID !== student.studentID || !studentTermIDs.has(ts.termID));

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
        const existingStanding = currentStandings.find(ts => ts.studentID === student.studentID && ts.termID === activeTerm);

        const getDynamicMaxYear = (progCode: string) => {
            const progYearLevels = programCourses.filter(pc => pc.programCode === progCode).map(pc => Number(pc.yearLevel) || Number((pc as any).yrLevel));
            return progYearLevels.length > 0 ? Math.max(...progYearLevels) : 4;
        };
        const dynamicMax = getDynamicMaxYear(student.programCode);

        const getFallbackYearLevel = () => {
            const curriculumMajors = programCourses.filter(pc => pc.programCode === student.programCode && pc.majorMinorClassif === 'Major');
            const unpassedMajors = curriculumMajors.filter(pc => {
                const attempts = rawHistRecords.filter(r => r.programCourseID === pc.programCourseID);
                if (attempts.length === 0) return false;

                const passMark = cohortPolicy ? cohortPolicy.majorPassingGrade : 2.0;
                const hasFailed = attempts.some(r => r.isFailed || (r.finalGrade !== null && r.finalGrade < passMark));
                const hasPassed = attempts.some(r => r.finalGrade !== null && r.finalGrade >= passMark && !r.isFailed);

                return hasFailed && !hasPassed;
            });

            if (unpassedMajors.length > 0) {
                const unpassedYearLevels = unpassedMajors.map(pc => Number(pc.yearLevel) || Number((pc as any).yrLevel));
                return Math.min(dynamicMax, Math.min(...unpassedYearLevels));
            } else {
                let effectiveYearEnrolled = student.yearEnrolled;
                const pastStandings = [...unaffectedStandings, ...newStandings].filter(ts => {
                    if (ts.studentID !== student.studentID) return false;
                    const tsTerm = terms.find(t => t.termID === ts.termID);
                    return tsTerm && compareTerms(tsTerm, activeTermObj) < 0;
                }).sort((a, b) => {
                    const termA = terms.find(t => t.termID === a.termID);
                    const termB = terms.find(t => t.termID === b.termID);
                    if (termA && termB) return compareTerms(termB, termA);
                    return 0;
                });

                if (pastStandings.length > 0) {
                    const mostRecentStanding = pastStandings[0];
                    if (mostRecentStanding && mostRecentStanding.yearLevel) {
                        const pastTerm = terms.find(t => t.termID === mostRecentStanding.termID);
                        if (pastTerm) {
                            effectiveYearEnrolled = parseInt(pastTerm.termSY.split('-')[0]) - mostRecentStanding.yearLevel + 1;
                        }
                    }
                } else {
                    // TARGETED FIX: Use immutable enrollment year as baseline to prevent compounding mathematical errors.
                    effectiveYearEnrolled = student.yearEnrolled;
                }

                const termStartYear = parseInt(activeTermObj.termSY.split('-')[0]);
                const calculatedChronologicalYear = Math.max(1, termStartYear - effectiveYearEnrolled + 1);

                return Math.min(dynamicMax, calculatedChronologicalYear);
            }
        };

        let evaluatedYearLevel = existingStanding?.yearLevel;
        if (!evaluatedYearLevel) {
            evaluatedYearLevel = getFallbackYearLevel();
        }
        if (!skipYearLevelAutoCalc && activeTerm === modifiedTermID) {
            const majorYearLevels = termRecords
                .map(r => programCourses.find(pc => pc.programCourseID === r.programCourseID))
                .filter(pc => pc && pc.majorMinorClassif === 'Major')
                .map(pc => pc!.yearLevel);
            if (majorYearLevels.length > 0) {
                evaluatedYearLevel = Math.min(...majorYearLevels);
            } else {
                evaluatedYearLevel = getFallbackYearLevel();
            }
        }

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
        const rawTermQPA = termUnits > 0 ? (termPoints / termUnits) : 0.0;
        const termQPA = Math.round(rawTermQPA * 100) / 100;

        const highestGradeMap = new Map<string, number>();
        rawHistRecords.forEach(record => {
            const pc = programCourses.find(p => p.programCourseID === record.programCourseID);
            if (pc && pc.isCQPAIncluded && record.finalGrade !== null) {
                const normalizedCode = pc.courseCode.replace(/\s+/g, "").toUpperCase();
                const existingGrade = highestGradeMap.get(normalizedCode);
                if (existingGrade === undefined || record.finalGrade > existingGrade) {
                    highestGradeMap.set(normalizedCode, record.finalGrade);
                }
            }
        });

        let cqpaPoints = 0; let cqpaUnits = 0;
        highestGradeMap.forEach((highestGrade, normalizedCode) => {
            const baseCourse = courses.find(c => c.courseCode.replace(/\s+/g, "").toUpperCase() === normalizedCode);
            const units = baseCourse ? baseCourse.courseUnits : 3;
            cqpaPoints += (highestGrade * units);
            cqpaUnits += units;
        });
        const rawSemCQPA = cqpaUnits > 0 ? (cqpaPoints / cqpaUnits) : 0.0;
        const semCQPA = Math.round(rawSemCQPA * 100) / 100;

        let majorStrikeTriggered = false;
        const majorFailures = new Map<string, number>();
        rawHistRecords.forEach(r => {
            const pc = programCourses.find(p => p.programCourseID === r.programCourseID);
            if (pc && pc.majorMinorClassif === 'Major') {
                const isNumericalFail = r.finalGrade !== null && r.finalGrade < majorThreshold;
                const isRemarkFail = r.finalGrade === null && r.isFailed;
                if (isNumericalFail || isRemarkFail) {
                    const normalizedCode = pc.courseCode.replace(/\s+/g, "").toUpperCase();
                    majorFailures.set(normalizedCode, (majorFailures.get(normalizedCode) || 0) + 1);
                    if (majorFailures.get(normalizedCode)! >= 2) {
                        majorStrikeTriggered = true;
                    }
                }
            }
        });

        const validGradesCount = termRecords.filter(r => r.finalGrade !== null || r.gradeRemarks !== null).length;
        const isTermIncomplete = validGradesCount === 0;

        const pastStandings = [...unaffectedStandings, ...newStandings].filter(ts => {
            if (ts.studentID !== student.studentID) return false;
            const tsTerm = terms.find(t => t.termID === ts.termID);
            return tsTerm && compareTerms(tsTerm, activeTermObj) < 0;
        }).sort((a, b) => {
            const termA = terms.find(t => t.termID === a.termID);
            const termB = terms.find(t => t.termID === b.termID);
            if (termA && termB) return compareTerms(termB, termA);
            return 0;
        });

        const validPastStandings = pastStandings.filter(ts => ts.termAcademicStatus !== 'Unencoded');
        let isConsecutiveOP = false;
        if (validPastStandings.length > 0) {
            const rawStatus = (validPastStandings[0].termAcademicStatus as string).replace(/-/g, ' ');
            if (rawStatus === "On Probation" || rawStatus === "Advised to Shift") {
                isConsecutiveOP = true;
            }
        }

        let status: "Regular" | "On-Probation" | "Advised to Shift" | "Unencoded";
        const isFullyWithdrawn = !isTermIncomplete && termUnits === 0 && termRecords.length > 0;

        // TARGETED FIX: Removed database ATS lock for empty terms so they remain 'Unencoded' and hidden from Academic History.
        if (isTermIncomplete) {
            status = "Unencoded";
        } else if (isFullyWithdrawn) {
            status = validPastStandings.length > 0 ? (validPastStandings[0].termAcademicStatus as "Regular" | "On-Probation" | "Advised to Shift") : "Regular";
            isConsecutiveOP = false;
        } else if (majorStrikeTriggered) {
            status = "Advised to Shift";
        } else {
            // PHASE 1 FIX: Removed numerical ATS Threshold block entirely. ATS is now strictly earned via consecutive OP or Major Strikes.
            if (semCQPA < systemSettings.probationThreshold) {
                status = "On-Probation";
                if (isConsecutiveOP) {
                    status = "Advised to Shift";
                }
            } else {
                status = "Regular";
            }
        }

        // AFTER
        const standingID = existingStanding ? existingStanding.standingID : generateID('ST-', 10);
        newStandings.push({
            standingID, termQPA, semCQPA, termAcademicStatus: status,
            isConsecutiveOP, yearLevel: evaluatedYearLevel, studentID: student.studentID, termID: activeTerm
        });
    }
    return { newStandings, updatedStandingsArray: [...unaffectedStandings, ...newStandings] };
};

export const backendAPI = {
    getManualReviewList(
        standings: TERM_STANDING[], remarks: ADVISING_REMARK[], activeTerm: string,
        activeUser: COMPASS_USER | null, records?: ACADEMIC_RECORD[], terms?: ACADEMIC_TERM[],
        students?: EnrichedStudent[], programCourses?: PROGRAM_COURSE[]
    ): MANUAL_REVIEW_ITEM[] {
        const safeStandings = standings || [];
        const safeRemarks = remarks || [];
        const reviewItems: MANUAL_REVIEW_ITEM[] = [];

        safeStandings.forEach(ts => {
            if (students) {
                const stu = students.find(s => s.studentID === ts.studentID);
                if (stu && stu.accountStatus !== 'Active') return;
            }
            if (ts.termID !== activeTerm) return;
            if (ts.termAcademicStatus === 'On-Probation') return;
            if (ts.termAcademicStatus === 'Advised to Shift') {
                const isAddressed = safeRemarks.some(r => r.standingID === ts.standingID && r.content && r.content.includes('[Shifting Recommended]'));
                if (!isAddressed) {
                    const desc = ts.isConsecutiveOP ? "Consecutive Probation" : "Major Subject Failed Twice";
                    reviewItems.push({ ...ts, issueDescription: desc, targetTermID: activeTerm });
                }
            } else if (ts.termAcademicStatus === 'Unencoded' && activeUser?.userType === 'Deans_Office_Staff') {
                reviewItems.push({ ...ts, issueDescription: "Missing Final Grades", targetTermID: activeTerm });
            }
        });

        if (records && terms) {
            const activeTermObj = terms.find(t => t.termID === activeTerm);
            if (activeTermObj) {
                const expiredIncs = records.filter(r => {
                    if (r.gradeRemarks !== 'INC') return false;
                    const rTerm = terms.find(t => t.termID === r.termID);
                    return rTerm && compareTerms(rTerm, activeTermObj) < 0;
                });
                expiredIncs.forEach(inc => {
                    if (students) {
                        const stu = students.find(s => s.studentID === inc.studentID);
                        if (stu && stu.accountStatus !== 'Active') return;
                    }
                    const incTermObj = terms.find(t => t.termID === inc.termID);
                    const termLabel = incTermObj ? `${incTermObj.termSem} AY ${incTermObj.termSY}` : 'Prior Term';
                    const existingIndex = reviewItems.findIndex(r => r.studentID === inc.studentID);
                    let baseTs = safeStandings.find(ts => ts.studentID === inc.studentID && ts.termID === activeTerm);
                    if (!baseTs) {
                        baseTs = safeStandings.find(ts => ts.studentID === inc.studentID && ts.termID === inc.termID);
                    }
                    if (baseTs) {
                        if (existingIndex === -1) {
                            reviewItems.push({ ...baseTs, issueDescription: `Unresolved INC (${termLabel})`, targetTermID: inc.termID });
                        } else {
                            if (!reviewItems[existingIndex].issueDescription.includes('Unresolved INC')) {
                                reviewItems[existingIndex].issueDescription += ` | Unresolved INC (${termLabel})`;
                            }
                        }
                    }
                });
            }
        }

        if (students) {
            students.forEach(student => {
                if (student.accountStatus === 'Active' && student.programCode === "Unassigned") {
                    const existingIndex = reviewItems.findIndex(r => r.studentID === student.studentID && r.issueDescription === "Curriculum Missing / Unassigned");
                    if (existingIndex === -1) {
                        reviewItems.push({
                            standingID: `ORPHAN-${student.studentID}`,
                            termQPA: 0,
                            semCQPA: 0,
                            termAcademicStatus: 'Unencoded',
                            isConsecutiveOP: false,
                            yearLevel: student.yearLevel,
                            studentID: student.studentID,
                            termID: activeTerm,
                            issueDescription: "Curriculum Missing / Unassigned",
                            targetTermID: activeTerm
                        } as MANUAL_REVIEW_ITEM);
                    }
                }
            });
        }

        if (students && programCourses && records && terms) {
            students.forEach(student => {
                if (student.accountStatus === 'Active' && student.programCode !== "Unassigned") {
                    const progYearLevels = programCourses.filter(pc => pc.programCode === student.programCode).map(pc => Number(pc.yearLevel) || Number((pc as any).yrLevel));
                    const dynamicMax = progYearLevels.length > 0 ? Math.max(...progYearLevels) : 4;
                    if (student.yearLevel >= dynamicMax) {
                        const curriculum = programCourses.filter(pc => pc.programCode === student.programCode);
                        const studentRecords = records.filter(r => r.studentID === student.studentID);
                        let hasRemaining = false;
                        for (const pc of curriculum) {
                            const passed = studentRecords.find(r => r.programCourseID === pc.programCourseID && r.finalGrade !== null && !r.isFailed);
                            if (!passed) {
                                hasRemaining = true;
                                break;
                            }
                        }
                        if (!hasRemaining && curriculum.length > 0) {
                            const currentStanding = safeStandings.find(ts => ts.studentID === student.studentID && ts.termID === activeTerm);
                            if (!currentStanding || currentStanding.termAcademicStatus !== 'Advised to Shift') {
                                const standingIdToUse = currentStanding ? currentStanding.standingID : `GRAD-${student.studentID}`;
                                const existingIndex = reviewItems.findIndex(r => r.studentID === student.studentID && r.issueDescription === "Pending Graduation Status");
                                if (existingIndex === -1) {
                                    reviewItems.push({
                                        standingID: standingIdToUse,
                                        termQPA: currentStanding?.termQPA || 0,
                                        semCQPA: currentStanding?.semCQPA || 0,
                                        termAcademicStatus: currentStanding?.termAcademicStatus || 'Regular',
                                        isConsecutiveOP: currentStanding?.isConsecutiveOP || false,
                                        yearLevel: student.yearLevel,
                                        studentID: student.studentID,
                                        termID: activeTerm,
                                        issueDescription: "Pending Graduation Status",
                                        targetTermID: activeTerm
                                    } as MANUAL_REVIEW_ITEM);
                                }
                            }
                        }
                    }
                }
            });
        }

        if (students && terms) {
            const activeTermObj = terms.find(t => t.termID === activeTerm);
            if (activeTermObj) {
                students.forEach(student => {
                    if (student.accountStatus !== 'Active') return;
                    const historicalATS = safeStandings.find(ts => {
                        if (ts.studentID !== student.studentID) return false;
                        if (ts.termAcademicStatus !== 'Advised to Shift') return false;
                        const tsTerm = terms.find(t => t.termID === ts.termID);
                        return tsTerm && compareTerms(tsTerm, activeTermObj) < 0;
                    });
                    if (historicalATS) {
                        const existingIndex = reviewItems.findIndex(r => r.studentID === student.studentID && r.issueDescription === "Pending Status Update (Unresolved ATS)");
                        if (existingIndex === -1) {
                            reviewItems.push({
                                standingID: historicalATS.standingID,
                                termQPA: historicalATS.termQPA,
                                semCQPA: historicalATS.semCQPA,
                                termAcademicStatus: historicalATS.termAcademicStatus,
                                isConsecutiveOP: historicalATS.isConsecutiveOP,
                                yearLevel: historicalATS.yearLevel || student.yearLevel,
                                studentID: student.studentID,
                                termID: activeTerm,
                                issueDescription: "Pending Status Update (Unresolved ATS)",
                                targetTermID: activeTerm
                            } as MANUAL_REVIEW_ITEM);
                        }
                    }
                });
            }
        }
        return reviewItems;
    },

    async fetchInitialSystemData() {
        const [stuRes, spRes, progRes, courRes, pcRes, recRes, remRes, standRes, termRes, preRes, polRes, logRes, sysRes] = await Promise.all([
            supabase.from('STUDENT').select('*').limit(10000),
            supabase.from('STUDENT_PROGRAM').select('*').limit(10000),
            supabase.from('DEGREE_PROGRAM').select('*'),
            supabase.from('COURSE').select('*').limit(10000),
            supabase.from('PROGRAM_COURSE').select('*').limit(10000),
            supabase.from('ACADEMIC_RECORD').select('*').limit(10000),
            supabase.from('ADVISING_REMARK').select('*, COMPASS_USER(userFirstName, userLastName)').limit(10000),
            supabase.from('TERM_STANDING').select('*').limit(10000),
            supabase.from('ACADEMIC_TERM').select('*'),
            supabase.from('COURSE_PREREQUISITE').select('*').limit(10000),
            supabase.from('RETENTION_POLICY').select('*').limit(10000),
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
            : { id: 'global', probationThreshold: 2.0 };

        const rawProgramCourses = (pcRes.data || []) as any[];
        const mappedProgramCourses: PROGRAM_COURSE[] = rawProgramCourses.map(pc => ({
            ...pc,
            yearLevel: pc.yrLevel !== undefined ? Number(pc.yrLevel) : Number(pc.yearLevel)
        }));

        const rawStandings = standRes.data as TERM_STANDING[];
        const uniqueStandingsMap = new Map<string, TERM_STANDING>();
        const standingsToDelete: string[] = [];

        rawStandings.forEach(ts => {
            const key = `${ts.studentID}-${ts.termID}`;
            if (uniqueStandingsMap.has(key)) {
                const existing = uniqueStandingsMap.get(key)!;
                if (ts.semCQPA > existing.semCQPA || ts.termQPA > existing.termQPA || (ts.termAcademicStatus !== 'Unencoded' && existing.termAcademicStatus === 'Unencoded')) {
                    standingsToDelete.push(existing.standingID);
                    uniqueStandingsMap.set(key, ts);
                } else {
                    standingsToDelete.push(ts.standingID);
                }
            } else {
                uniqueStandingsMap.set(key, ts);
            }
        });

        if (standingsToDelete.length > 0) {
            supabase.from('ADVISING_REMARK').delete().in('standingID', standingsToDelete).then(() => {
                supabase.from('TERM_STANDING').delete().in('standingID', standingsToDelete).then();
            });
        }

        const mappedStandings: TERM_STANDING[] = Array.from(uniqueStandingsMap.values()).map(ts => ({
            ...ts,
            termAcademicStatus: (ts.termAcademicStatus as string) === 'Advised-to-Shift' ? 'Advised to Shift' : ts.termAcademicStatus
        }));

        return {
            data: {
                students: enrichedStudents,
                programs: progRes.data as DEGREE_PROGRAM[],
                courses: courRes.data as COURSE[],
                programCourses: mappedProgramCourses,
                records: recRes.data as ACADEMIC_RECORD[],
                remarks: remRes.data as ADVISING_REMARK[],
                standings: mappedStandings,
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
        if (isNewCohort) {
            if (customPolicies && customPolicies.length > 0) {
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

    async deleteTerm(termID: string, isCurrent: boolean, records: ACADEMIC_RECORD[], standings: TERM_STANDING[]) {
        if (isCurrent) return { error: "You cannot delete the active academic term. Please set another term as active first." };
        const hasRecords = records.some(r => r.termID === termID);
        const hasStandings = standings.some(ts => ts.termID === termID);
        if (hasRecords || hasStandings) {
            return { error: "Cannot delete this term because it contains immutable academic records or standings." };
        }
        const { error } = await supabase.from('ACADEMIC_TERM').delete().eq('termID', termID);
        return { error: error ? error.message : null };
    },

    async updateRetentionPolicies(policies: RETENTION_POLICY[]) {
        const { error } = await supabase.from('RETENTION_POLICY').upsert(policies, { onConflict: 'policyID' });
        return { error: error ? error.message : null };
    },

    async getEnrichedGrades(
        student: EnrichedStudent | null, activeTerm: string, termDetails: ACADEMIC_TERM | undefined,
        programCourses: PROGRAM_COURSE[], courses: COURSE[], records: ACADEMIC_RECORD[],
        prereqs: COURSE_PREREQUISITE[], dismissedCourses: string[], _globalActiveTermID: string,
        retentionPolicies: RETENTION_POLICY[], targetYearLevel: number
    ) {
        if (!student || !termDetails) return [];
        const studentRecords = records.filter(r => r.studentID === student.studentID && r.termID === activeTerm);
        const displayRows: EnrichedGradeRow[] = [];
        const cohortPolicy = retentionPolicies.find(p => p.programCode === student.programCode && p.effectiveYear === student.yearEnrolled);

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
                    isMissingPrereq, finalGrade: record.finalGrade !== null ? (record.finalGrade === 0 ? "F" : record.finalGrade.toFixed(2)) : (record.gradeRemarks || ""),
                    isBlank: record.finalGrade === null && !record.gradeRemarks, recordID: record.recordID
                });
            }
        });

        const curriculum = programCourses.filter(pc => {
            const pcYear = Number(pc.yearLevel) || Number((pc as any).yrLevel);
            return pc.programCode === student.programCode && pcYear === targetYearLevel && pc.termSem === termDetails.termSem;
        });
        curriculum.forEach(pc => {
            const hasPassed = records.some(r => {
                if (r.studentID !== student.studentID) return false;
                if (r.programCourseID !== pc.programCourseID) return false;
                if (r.finalGrade === null || r.isFailed) return false;
                const passMark = cohortPolicy ? (pc.majorMinorClassif === 'Major' ? cohortPolicy.majorPassingGrade : cohortPolicy.minorPassingGrade) : 1.0;
                return r.finalGrade >= passMark;
            });

            if (!displayRows.some(row => row.courseCode === pc.courseCode) && !dismissedCourses.includes(pc.courseCode) && !hasPassed) {
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
        return displayRows;
    },

    async getCurriculumProgress(
        student: EnrichedStudent | null, activeTerm: string, programCourses: PROGRAM_COURSE[],
        records: ACADEMIC_RECORD[], retentionPolicies: RETENTION_POLICY[]
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
        programCourses: PROGRAM_COURSE[], records: ACADEMIC_RECORD[], userID: string,
        globalActiveTerm: string, _standings: TERM_STANDING[], retentionPolicies: RETENTION_POLICY[] = [],
        _terms: ACADEMIC_TERM[] = [], targetYearLevel: number
    ) {
        const curriculum = programCourses.filter(pc => {
            const pcYear = Number(pc.yearLevel) || Number((pc as any).yrLevel);
            return pc.programCode === student.programCode &&
                pcYear === targetYearLevel &&
                pc.termSem === termDetails.termSem;
        });

        if (curriculum.length === 0) {
            return { data: [], newStanding: null, updatedStudentYearLevel: undefined, error: `No courses found in the curriculum template for ${student.programCode}, Year ${targetYearLevel}, ${termDetails.termSem}. Please map these subjects in the Curriculum Manager.` };
        }

        const existingRecords = records.filter(r => r.studentID === student.studentID && r.termID === activeTerm);
        const newRecords: ACADEMIC_RECORD[] = [];
        const cohortPolicy = retentionPolicies.find(p => p.programCode === student.programCode && p.effectiveYear === student.yearEnrolled);
        const studentRecords = records.filter(r => r.studentID === student.studentID);

        for (const pc of curriculum) {
            const hasPassed = studentRecords.some(r => {
                if (r.programCourseID !== pc.programCourseID) return false;
                if (r.finalGrade === null || r.isFailed) return false;
                const passMark = cohortPolicy ? (pc.majorMinorClassif === 'Major' ? cohortPolicy.majorPassingGrade : cohortPolicy.minorPassingGrade) : 1.0;
                return r.finalGrade >= passMark;
            });
            if (!existingRecords.some(r => r.programCourseID === pc.programCourseID) && !hasPassed) {
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
            if (error) return { data: [], newStanding: null, updatedStudentYearLevel: undefined, error: error.message };

            const majorYearLevels = curriculum.filter(pc => pc.majorMinorClassif === 'Major').map(pc => pc.yearLevel);
            const calculatedYearLevel = majorYearLevels.length > 0 ? Math.min(...majorYearLevels) : targetYearLevel;

            // TARGETED FIX: Apply ATS lock to newly generated auto-populated standings
            const pastStandings = _standings.filter(ts => {
                if (ts.studentID !== student.studentID) return false;
                const tsTerm = _terms.find(t => t.termID === ts.termID);
                return tsTerm && compareTerms(tsTerm, termDetails) < 0;
            });
            const hasUnresolvedATS = student.accountStatus === 'Active' && pastStandings.some(ts => ts.termAcademicStatus === 'Advised to Shift' || (ts.termAcademicStatus as string) === 'Advised-to-Shift');

            const basicStanding: TERM_STANDING = {
                standingID: generateID('ST-', 10),
                termQPA: 0, semCQPA: 0,
                termAcademicStatus: hasUnresolvedATS ? 'Advised to Shift' : 'Unencoded',
                isConsecutiveOP: false,
                yearLevel: calculatedYearLevel,
                studentID: student.studentID, termID: activeTerm
            };

            let updatedStudentYearLevel = undefined;
            if (activeTerm === globalActiveTerm && calculatedYearLevel !== student.yearLevel) {
                await supabase.from('STUDENT').update({ yearLevel: calculatedYearLevel }).eq('studentID', student.studentID);
                updatedStudentYearLevel = calculatedYearLevel;
            }

            const { data: exist } = await supabase.from('TERM_STANDING').select('*').eq('studentID', student.studentID).eq('termID', activeTerm);
            if (!exist || exist.length === 0) {
                await supabase.from('TERM_STANDING').insert([basicStanding]);
                return { data: newRecords, newStanding: basicStanding, updatedStudentYearLevel, error: null };
            }
            return { data: newRecords, newStanding: null, updatedStudentYearLevel, error: null };
        }
        return { data: [], newStanding: null, updatedStudentYearLevel: undefined, error: "All curriculum subjects for this term are already populated on the screen." };
    },

    async upsertGrade(
        courseCode: string, val: string, recordID: string | undefined, student: EnrichedStudent, activeTerm: string,
        currentRecords: ACADEMIC_RECORD[], programCourses: PROGRAM_COURSE[], courses: COURSE[],
        currentStandings: TERM_STANDING[], userID: string, terms: ACADEMIC_TERM[], retentionPolicies: RETENTION_POLICY[]
    ) {
        let finalGrade: number | null = null; let gradeRemarks: string | null = null; let isFailed = false;
        const upperVal = val.trim().toUpperCase();

        if (upperVal === "") {
            finalGrade = null;
            gradeRemarks = null;
            isFailed = false;
        } else {
            const pc = programCourses.find(p => p.programCode === student.programCode && p.courseCode === courseCode);
            const cohortPolicy = retentionPolicies.find(p => p.programCode === student.programCode && p.effectiveYear === student.yearEnrolled);
            const threshold = cohortPolicy ? (pc?.majorMinorClassif === 'Major' ? cohortPolicy.majorPassingGrade : cohortPolicy.minorPassingGrade) : 1.0;

            if (upperVal === "F") {
                finalGrade = 0.0; isFailed = true;
            } else if (["INC", "NG", "W", "D"].includes(upperVal)) {
                gradeRemarks = upperVal;
                if (["NG"].includes(upperVal)) isFailed = true;
            } else {
                const parsedGrade = Number(upperVal);
                if (isNaN(parsedGrade) || parsedGrade < 0.0 || parsedGrade > 4.0) {
                    return { recordsData: null, standingsData: null, updatedYearLevel: undefined, error: "Invalid input. Please enter a numerical grade between 0.0 and 4.0, or a valid remark." };
                }
                finalGrade = parsedGrade;
                if (finalGrade < threshold) isFailed = true;
            }
        }

        let updatedRecord: ACADEMIC_RECORD;
        const updatedRecordsArray = [...currentRecords];
        const skipYearLevelAutoCalc = false;

        if (recordID) {
            updatedRecord = { ...currentRecords.find(r => r.recordID === recordID)!, finalGrade, isFailed, gradeRemarks: gradeRemarks || null };
            const { error } = await supabase.from('ACADEMIC_RECORD').update({ finalGrade, isFailed, gradeRemarks }).eq('recordID', recordID);
            if (error) return { recordsData: null, standingsData: null, updatedYearLevel: undefined, error: error.message };
            const index = updatedRecordsArray.findIndex(r => r.recordID === recordID);
            updatedRecordsArray[index] = updatedRecord;
        } else {
            const pc = programCourses.find(p => p.programCode === student.programCode && p.courseCode === courseCode);
            if (!pc) return { recordsData: null, standingsData: null, updatedYearLevel: undefined, error: "Course not found in curriculum." };
            updatedRecord = {
                recordID: generateID('RC-'), finalGrade, isFailed, gradeRemarks: gradeRemarks || null, dateEncoded: new Date().toISOString().split('T')[0],
                programCourseID: pc.programCourseID, termID: activeTerm, studentID: student.studentID, userID
            };
            const { error } = await supabase.from('ACADEMIC_RECORD').insert([{ ...updatedRecord, gradeRemarks }]);
            if (error) return { recordsData: null, standingsData: null, updatedYearLevel: undefined, error: error.message };
            updatedRecordsArray.push(updatedRecord);
        }

        const { data: sysRes } = await supabase.from('SYSTEM_SETTINGS').select('*').eq('id', 'global').single();
        const systemSettings = sysRes || { probationThreshold: 2.0 };

        const { newStandings, updatedStandingsArray } = cascadeStandings(student, updatedRecordsArray, programCourses, courses, retentionPolicies, systemSettings, currentStandings, terms, activeTerm, skipYearLevelAutoCalc);

        const dbStandings = newStandings.map(ns => ({
            ...ns,
            termAcademicStatus: (ns.termAcademicStatus as string) === 'Advised to Shift' ? 'Advised-to-Shift' : ns.termAcademicStatus
        }));
        const { error: standError } = await supabase.from('TERM_STANDING').upsert(dbStandings, { onConflict: 'standingID' });
        if (standError) return { recordsData: null, standingsData: null, updatedYearLevel: undefined, error: standError.message };

        let syncedYearLevel = undefined;
        const currentTermObj = terms.find(t => t.isCurrent);
        if (!skipYearLevelAutoCalc && currentTermObj && activeTerm === currentTermObj.termID) {
            const activeStanding = newStandings.find(ns => ns.termID === activeTerm);
            // TARGETED FIX: Added explicit undefined check for TypeScript safety
            if (activeStanding && activeStanding.yearLevel !== undefined && activeStanding.yearLevel > student.yearLevel) {
                await supabase.from('STUDENT').update({ yearLevel: activeStanding.yearLevel }).eq('studentID', student.studentID);
                syncedYearLevel = activeStanding.yearLevel;
            }
        }
        return { recordsData: updatedRecordsArray, standingsData: updatedStandingsArray, updatedYearLevel: syncedYearLevel, error: null };
    },

    async deleteGradeRow(
        recordID: string, currentRecords: ACADEMIC_RECORD[], student: EnrichedStudent, activeTerm: string,
        programCourses: PROGRAM_COURSE[], courses: COURSE[],
        currentStandings: TERM_STANDING[], terms: ACADEMIC_TERM[], retentionPolicies: RETENTION_POLICY[]
    ) {
        const { error } = await supabase.from('ACADEMIC_RECORD').delete().eq('recordID', recordID);
        if (error) return { recordsData: null, standingsData: null, updatedYearLevel: undefined, error: error.message };

        const updatedRecordsArray = currentRecords.filter(r => r.recordID !== recordID);
        const { data: sysRes } = await supabase.from('SYSTEM_SETTINGS').select('*').eq('id', 'global').single();
        const systemSettings = sysRes || { probationThreshold: 2.0 };

        const { newStandings, updatedStandingsArray } = cascadeStandings(student, updatedRecordsArray, programCourses, courses, retentionPolicies, systemSettings, currentStandings, terms, activeTerm, false);

        const dbStandings = newStandings.map(ns => ({
            ...ns,
            termAcademicStatus: (ns.termAcademicStatus as string) === 'Advised to Shift' ? 'Advised-to-Shift' : ns.termAcademicStatus
        }));
        await supabase.from('TERM_STANDING').upsert(dbStandings, { onConflict: 'standingID' });

        let syncedYearLevel = undefined;
        const currentTermObj = terms.find(t => t.isCurrent);
        if (currentTermObj && activeTerm === currentTermObj.termID) {
            const activeStanding = newStandings.find(ns => ns.termID === activeTerm);
            if (activeStanding && activeStanding.yearLevel !== student.yearLevel) {
                await supabase.from('STUDENT').update({ yearLevel: activeStanding.yearLevel }).eq('studentID', student.studentID);
                syncedYearLevel = activeStanding.yearLevel;
            }
        }
        return { recordsData: updatedRecordsArray, standingsData: updatedStandingsArray, updatedYearLevel: syncedYearLevel, error: null };
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
            yearEnrolled: newStudent.yearEnrolled
        };

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

    async updateStudent(updatedData: EnrichedStudent, currentStudents: EnrichedStudent[], activeTerm: string, currentStandings: TERM_STANDING[], terms: ACADEMIC_TERM[]) {
        let updatedStandings = [...currentStandings];
        if (activeTerm) {
            const activeTermObj = terms.find(t => t.termID === activeTerm);
            if (activeTermObj) {
                const existingActiveStanding = currentStandings.find(ts => ts.termID === activeTerm && ts.studentID === updatedData.studentID);
                if (!existingActiveStanding) {
                    const newStanding: TERM_STANDING = {
                        standingID: generateID('TS-'),
                        studentID: updatedData.studentID,
                        termID: activeTerm,
                        yearLevel: updatedData.yearLevel,
                        termQPA: 0,
                        semCQPA: 0,
                        isConsecutiveOP: false,
                        termAcademicStatus: 'Unencoded'
                    };
                    const { error: insertError } = await supabase.from('TERM_STANDING').insert([newStanding]);
                    if (!insertError) {
                        updatedStandings.push(newStanding);
                    }
                }

                const futureStandingsToUpdate = updatedStandings.filter(ts => {
                    if (ts.studentID !== updatedData.studentID) return false;
                    const tsTerm = terms.find(t => t.termID === ts.termID);
                    return tsTerm && compareTerms(tsTerm, activeTermObj) >= 0;
                });

                const activeStartYear = parseInt(activeTermObj.termSY.split('-')[0]);

                const dbUpdates = futureStandingsToUpdate.map(ts => {
                    const tsTerm = terms.find(t => t.termID === ts.termID)!;
                    const tsStartYear = parseInt(tsTerm.termSY.split('-')[0]);
                    const yearDiff = tsStartYear - activeStartYear;
                    const chronYearLevel = updatedData.yearLevel + yearDiff;
                    return { standingID: ts.standingID, yearLevel: chronYearLevel };
                });

                if (dbUpdates.length > 0) {
                    for (const update of dbUpdates) {
                        const { error: tsError } = await supabase.from('TERM_STANDING')
                            .update({ yearLevel: update.yearLevel })
                            .eq('standingID', update.standingID);
                        if (tsError) {
                            console.error("Failed to sync year level for standing:", update.standingID, tsError.message);
                        }
                    }

                    updatedStandings = updatedStandings.map(ts => {
                        const match = dbUpdates.find(u => u.standingID === ts.standingID);
                        if (match) return { ...ts, yearLevel: match.yearLevel };
                        return ts;
                    });
                }
            }
        }

        let finalGlobalYearLevel = updatedData.yearLevel;
        const studentStandings = updatedStandings.filter(ts => ts.studentID === updatedData.studentID);
        if (studentStandings.length > 0) {
            const mostRecent = studentStandings.sort((a, b) => {
                const termA = terms.find(t => t.termID === a.termID);
                const termB = terms.find(t => t.termID === b.termID);
                if (termA && termB) return compareTerms(termB, termA);
                return 0;
            })[0];
            if (mostRecent && mostRecent.yearLevel) {
                finalGlobalYearLevel = mostRecent.yearLevel;
            }
        }

        const baseStudent = {
            studFirstName: updatedData.studFirstName,
            studMiddleName: updatedData.studMiddleName || null,
            studLastName: updatedData.studLastName,
            shsTrack: updatedData.shsTrack,
            yearLevel: finalGlobalYearLevel,
            accountStatus: updatedData.accountStatus,
            yearEnrolled: updatedData.yearEnrolled
        };
        const { error: studentError } = await supabase.from('STUDENT').update(baseStudent).eq('studentID', updatedData.studentID);
        if (studentError) return { data: null, standingsData: null, error: studentError.message };

        const existingStudent = currentStudents.find(s => s.studentID === updatedData.studentID);
        if (existingStudent && existingStudent.programCode !== updatedData.programCode) {
            const progLink = { studProgID: generateID('SP-'), programCode: updatedData.programCode, studentID: updatedData.studentID };
            await supabase.from('STUDENT_PROGRAM').insert([progLink]);
        }

        const updatedArray = currentStudents.map(s => s.studentID === updatedData.studentID ? { ...updatedData, yearLevel: finalGlobalYearLevel } : s);
        return { data: updatedArray, standingsData: updatedStandings, error: null };
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
        activeTerm: string, activeUser: COMPASS_USER, remarks: ADVISING_REMARK[], standings: TERM_STANDING[]
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
            updatedRemark = {
                remarkID: generateID('RM-'),
                content: finalContent,
                timestamp: new Date().toISOString(),
                userID: activeUser.userID,
                standingID: targetStanding.standingID,
                COMPASS_USER: {
                    userFirstName: activeUser.userFirstName,
                    userLastName: activeUser.userLastName
                }
            };
            const { error } = await supabase.from('ADVISING_REMARK').insert([{
                remarkID: updatedRemark.remarkID,
                content: updatedRemark.content,
                timestamp: updatedRemark.timestamp,
                userID: updatedRemark.userID,
                standingID: updatedRemark.standingID
            }]);
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

    async saveCourseToCurriculum(
        payload: { courseCode: string; title: string; units: string; yearLevel: string; semester: string; classification: string; isCQPAIncluded: boolean; prerequisites: string; },
        program: DEGREE_PROGRAM, editingCourseCode: string | null, courses: COURSE[], programCourses: PROGRAM_COURSE[], currentPrereqs: COURSE_PREREQUISITE[]
    ) {
        const rawPrereqs = payload.prerequisites.split(',').map(s => s.trim()).filter(s => s !== "");
        const newPrereqs: COURSE_PREREQUISITE[] = [];
        const progCourseDB = {
            programCourseID: editingCourseCode ? programCourses.find(pc => pc.courseCode === editingCourseCode && pc.programCode === program.programCode)!.programCourseID : generateID('PC-', 7),
            programCode: program.programCode,
            courseCode: payload.courseCode,
            majorMinorClassif: payload.classification as "Major" | "Minor",
            isCQPAIncluded: payload.isCQPAIncluded,
            yrLevel: Number(payload.yearLevel),
            termSem: payload.semester as "1st Semester" | "2nd Semester" | "Midyear"
        };

        const newProgCourses = editingCourseCode ? programCourses.map(pc => pc.programCourseID === progCourseDB.programCourseID ? { ...progCourseDB, yearLevel: progCourseDB.yrLevel, majorMinorClassif: progCourseDB.majorMinorClassif as "Major" | "Minor" } : pc) : [...programCourses, { ...progCourseDB, yearLevel: progCourseDB.yrLevel, majorMinorClassif: progCourseDB.majorMinorClassif as "Major" | "Minor" }];
        const normalizedProgCourses = newProgCourses.filter(pc => pc.programCode === program.programCode).map(pc => ({
            ...pc,
            normalizedCode: pc.courseCode.replace(/\s+/g, "").toUpperCase()
        }));

        for (const rawCode of rawPrereqs) {
            const normRaw = rawCode.replace(/\s+/g, "").toUpperCase();
            const existsGlobally = courses.some(c => c.courseCode.replace(/\s+/g, "").toUpperCase() === normRaw);
            if (!existsGlobally) {
                return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: `Invalid Prerequisite: Course '${rawCode}' does not exist in the institutional database.` };
            }
            const match = normalizedProgCourses.find(pc => pc.normalizedCode === normRaw);
            if (!match) {
                return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: `Invalid Prerequisite: '${rawCode}' is not mapped to this program's curriculum. Please add it to the program first.` };
            }
            if (match.programCourseID === progCourseDB.programCourseID) {
                return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: `Invalid Prerequisite: A course cannot be a prerequisite for itself.` };
            }
            const targetYear = Number(payload.yearLevel);
            const targetSemWeight = payload.semester === "1st Semester" ? 1 : payload.semester === "2nd Semester" ? 2 : 3;
            const prereqYear = Number(match.yearLevel);
            const prereqSemWeight = match.termSem === "1st Semester" ? 1 : match.termSem === "2nd Semester" ? 2 : 3;

            if (prereqYear > targetYear || (prereqYear === targetYear && prereqSemWeight >= targetSemWeight)) {
                return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: `Invalid Prerequisite: ${rawCode} is scheduled in Year ${prereqYear}, ${match.termSem}. Prerequisites must logically precede the target course.` };
            }
            newPrereqs.push({ prereqID: generateID('PR-', 7), programCourseID: progCourseDB.programCourseID, prereqProgramCourseID: match.programCourseID });
        }

        const baseCourse: COURSE = { courseCode: payload.courseCode, courseTitle: payload.title, courseUnits: Number(payload.units) };
        const existingCourse = courses.find(c => c.courseCode === payload.courseCode);

        if (!existingCourse) {
            const { error } = await supabase.from('COURSE').insert([baseCourse]);
            if (error) return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: error.message };
        } else {
            const { error } = await supabase.from('COURSE').update(baseCourse).eq('courseCode', payload.courseCode);
            if (error) return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: error.message };
        }

        if (editingCourseCode) {
            const { error } = await supabase.from('PROGRAM_COURSE').update(progCourseDB).eq('programCourseID', progCourseDB.programCourseID);
            if (error) return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: error.message };
        } else {
            const { error } = await supabase.from('PROGRAM_COURSE').insert([progCourseDB]);
            if (error) return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: error.message };
        }

        const newCourses = existingCourse ? courses.map(c => c.courseCode === payload.courseCode ? baseCourse : c) : [...courses, baseCourse];
        const { yrLevel, ...rest } = progCourseDB;
        const progCourseFrontend: PROGRAM_COURSE = {
            ...rest,
            yearLevel: yrLevel,
            majorMinorClassif: rest.majorMinorClassif as "Major" | "Minor",
        };
        const finalProgCourses = editingCourseCode ? programCourses.map(pc => pc.programCourseID === progCourseFrontend.programCourseID ? progCourseFrontend : pc) : [...programCourses, progCourseFrontend];
        const finalProgCourseID = progCourseDB.programCourseID;

        await supabase.from('COURSE_PREREQUISITE').delete().eq('programCourseID', finalProgCourseID);
        if (newPrereqs.length > 0) {
            const { error: prError } = await supabase.from('COURSE_PREREQUISITE').insert(newPrereqs);
            if (prError) return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: prError.message };
        }
        const filteredPrereqs = currentPrereqs.filter(pr => pr.programCourseID !== finalProgCourseID);
        const updatedPrereqs = [...filteredPrereqs, ...newPrereqs];
        return { coursesData: newCourses, programCoursesData: finalProgCourses, coursePrerequisitesData: updatedPrereqs, error: null };
    },

    async deleteCourseFromCurriculum(
        programCode: string, courseCode: string, programCourses: PROGRAM_COURSE[], currentPrereqs: COURSE_PREREQUISITE[]
    ) {
        const targetPC = programCourses.find(pc => pc.programCode === programCode && pc.courseCode === courseCode);
        if (!targetPC) return { coursesData: null, programCoursesData: null, coursePrerequisitesData: null, error: "Curriculum mapping not found in database." };

        await supabase.from('COURSE_PREREQUISITE').delete().eq('programCourseID', targetPC.programCourseID);
        await supabase.from('COURSE_PREREQUISITE').delete().eq('prereqProgramCourseID', targetPC.programCourseID);

        const { error } = await supabase.from('PROGRAM_COURSE').delete().eq('programCourseID', targetPC.programCourseID);
        if (error) {
            if (error.code === '23503') return { programCoursesData: null, coursePrerequisitesData: null, error: "Cannot delete this course because student academic records are actively tied to it." };
            return { programCoursesData: null, coursePrerequisitesData: null, error: error.message };
        }
        const updatedProgramCourses = programCourses.filter(pc => pc.programCourseID !== targetPC.programCourseID);
        const updatedPrereqs = currentPrereqs.filter(pr => pr.programCourseID !== targetPC.programCourseID && pr.prereqProgramCourseID !== targetPC.programCourseID);
        return { programCoursesData: updatedProgramCourses, coursePrerequisitesData: updatedPrereqs, error: null };
    },

    async validateCurriculum(
        programCode: string,
        curriculumYear: string,
        editingProgCode: string | null,
        programs: DEGREE_PROGRAM[]
    ) {
        const exists = programs.some(p =>
            p.programCode === programCode &&
            p.curriculumYear === curriculumYear &&
            p.programCode !== editingProgCode
        );
        if (exists) return "A curriculum for this program and effective year already exists.";
        return null;
    },

    async saveProgram(
        program: DEGREE_PROGRAM,
        editingProgCode: string | null,
        programs: DEGREE_PROGRAM[]
    ) {
        const normalizedCode = program.programCode.trim().toUpperCase();
        const normalizedTitle = program.programTitle.trim();

        if (!normalizedCode || !normalizedTitle) {
            return { data: null, error: "Program code and title are required." };
        }

        const validationError = await this.validateCurriculum(
            normalizedCode,
            program.curriculumYear,
            editingProgCode,
            programs
        );
        if (validationError) {
            return { data: null, error: validationError };
        }

        if (editingProgCode) {
            const { error } = await supabase
                .from("DEGREE_PROGRAM")
                .update({
                    programCode: normalizedCode,
                    programTitle: normalizedTitle,
                    curriculumYear: program.curriculumYear
                })
                .eq("programCode", editingProgCode);
            if (error) return { data: null, error: error.message };

            return {
                data: programs.map(p =>
                    p.programCode === editingProgCode
                        ? {
                            ...p,
                            programCode: normalizedCode,
                            programTitle: normalizedTitle,
                            curriculumYear: program.curriculumYear
                        }
                        : p
                ),
                error: null
            };
        }

        const { error } = await supabase
            .from("DEGREE_PROGRAM")
            .insert([{
                programCode: normalizedCode,
                programTitle: normalizedTitle,
                curriculumYear: program.curriculumYear
            }]);
        if (error) return { data: null, error: error.message };

        return {
            data: [...programs, { ...program, programCode: normalizedCode, programTitle: normalizedTitle }],
            error: null
        };
    },

    async deleteProgramAndUniqueCourses(
        programCode: string,
        programs: DEGREE_PROGRAM[],
        programCourses: PROGRAM_COURSE[],
        currentPrereqs: COURSE_PREREQUISITE[],
        courses: COURSE[]
    ) {

        const { error: programError } = await supabase
            .from("DEGREE_PROGRAM")
            .update({ isArchived: true })
            .eq("programCode", programCode);

        if (programError) {
            return {
                programsData: null, programCoursesData: null, coursePrerequisitesData: null, coursesData: null,
                error: programError.message
            };
        }

        return {
            programsData: programs.map(p => p.programCode === programCode ? { ...p, isArchived: true } : p),
            programCoursesData: programCourses,
            coursePrerequisitesData: currentPrereqs,
            coursesData: courses,
            error: null
        };
    },

    async restoreProgram(programCode: string, programs: DEGREE_PROGRAM[]) {
        const { error: programError } = await supabase
            .from("DEGREE_PROGRAM")
            .update({ isArchived: false })
            .eq("programCode", programCode);

        if (programError) {
            return { programsData: null, error: programError.message };
        }

        return {
            programsData: programs.map(p => p.programCode === programCode ? { ...p, isArchived: false } : p),
            error: null
        };
    },

    async generateReport(
        statusFilter: string, programFilter: string, yearFilter: string, accountFilter: string,
        students: EnrichedStudent[], activeStandings: TERM_STANDING[], targetTermDetails?: ACADEMIC_TERM,
        allStandings: TERM_STANDING[] = [], allTerms: ACADEMIC_TERM[] = [], programCourses: PROGRAM_COURSE[] = []
    ) {
        if (!targetTermDetails) return { data: [], error: "No historical term context selected." };

        const targetYear = parseInt(targetTermDetails.termSY.split('-')[0]);

        const getDynamicMaxYear = (progCode: string, progCourses: PROGRAM_COURSE[]) => {
            const levels = progCourses.filter(pc => pc.programCode === progCode).map(pc => Number(pc.yearLevel) || Number((pc as any).yrLevel));
            return levels.length > 0 ? Math.max(...levels) : 4;
        };

        const data = students.filter(s => s.yearEnrolled <= targetYear).map(student => {
            const ts = activeStandings.find(st => st.studentID === student.studentID);

            const dynamicMax = getDynamicMaxYear(student.programCode, programCourses);
            const rawChronological = Math.max(1, targetYear - student.yearEnrolled + 1);
            const chronologicalYearLevel = Math.min(dynamicMax, rawChronological);

            let effectiveStatus = ts ? ts.termAcademicStatus : "Unencoded";

            if (allStandings.length > 0 && allTerms.length > 0) {
                const hasHistoricalATS = allStandings.some(histTs => {
                    if (histTs.studentID !== student.studentID) return false;
                    if (histTs.termAcademicStatus !== 'Advised to Shift') return false;
                    const histTerm = allTerms.find(t => t.termID === histTs.termID);
                    if (!histTerm) return false;
                    return compareTerms(histTerm, targetTermDetails) <= 0;
                });
                if (hasHistoricalATS) {
                    effectiveStatus = "Advised to Shift";
                }
            }

            if (ts) {
                return {
                    standingID: ts.standingID,
                    termQPA: ts.termQPA,
                    semCQPA: ts.semCQPA,
                    termAcademicStatus: effectiveStatus,
                    isConsecutiveOP: ts.isConsecutiveOP,
                    yearLevel: ts.yearLevel || chronologicalYearLevel,
                    studentID: ts.studentID,
                    termID: ts.termID,
                    student: student
                };
            } else {
                return {
                    standingID: `SYN-${student.studentID}`,
                    termQPA: 0.0,
                    semCQPA: 0.0,
                    termAcademicStatus: effectiveStatus,
                    isConsecutiveOP: false,
                    yearLevel: chronologicalYearLevel,
                    studentID: student.studentID,
                    termID: targetTermDetails.termID,
                    student: student
                };
            }
        });

        const filtered = data.filter(record => {
            const matchStatus = statusFilter === "All Students" ||
                (statusFilter === "All Flagged" && (record.termAcademicStatus === "On-Probation" || record.termAcademicStatus === "Advised to Shift")) ||
                record.termAcademicStatus === statusFilter;
            const matchProgram = programFilter === "All" || record.student.programCode === programFilter;
            const matchYear = yearFilter === "All" || record.yearLevel.toString() === yearFilter;
            const matchAccount = accountFilter === "All" || record.student.accountStatus === accountFilter;

            return matchStatus && matchProgram && matchYear && matchAccount;
        });

        return { data: filtered, error: null };
    },

    async updateSystemSettings(newSettings: SYSTEM_SETTINGS) {
        const { error } = await supabase.from('SYSTEM_SETTINGS').update(newSettings).eq('id', 'global');
        return { error: error ? error.message : null };
    },

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