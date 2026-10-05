import type { EnrichedStudent } from "../backend/api";
import type { ACADEMIC_RECORD, PROGRAM_COURSE, ACADEMIC_TERM, COURSE, TERM_STANDING } from "../store/types";

export const AcademicHistoryPrintable = ({ 
    student, 
    records, 
    programCourses, 
    terms, 
    courses, 
    standings 
}: { 
    student: EnrichedStudent, 
    records: ACADEMIC_RECORD[], 
    programCourses: PROGRAM_COURSE[], 
    terms: ACADEMIC_TERM[],
    courses: COURSE[],
    standings: TERM_STANDING[]
}) => {
    // Group records by term
    const studentRecords = records.filter(r => r.studentID === student.studentID);
    const termIDs = Array.from(new Set(studentRecords.map(r => r.termID)));
    const studentTerms = terms.filter(t => termIDs.includes(t.termID)).sort((a, b) => {
        if (a.termSY !== b.termSY) return a.termSY.localeCompare(b.termSY);
        const semWeights: Record<string, number> = { "1st Semester": 1, "2nd Semester": 2, "Midyear": 3 };
        return semWeights[a.termSem] - semWeights[b.termSem];
    });

    const getDisplayCQPA = (standing: TERM_STANDING | undefined, termObj: ACADEMIC_TERM) => {
        let displayCQPA = standing?.semCQPA || 0;
        if (displayCQPA === 0) {
            const pastStandings = standings.filter(s => s.studentID === student.studentID).filter(s => {
                const t = terms.find(term => term.termID === s.termID);
                if (!t) return false;
                if (parseInt(t.termSY.split('-')[0]) < parseInt(termObj.termSY.split('-')[0])) return true;
                if (t.termSY === termObj.termSY) {
                    const semWeights: Record<string, number> = { "1st Semester": 1, "2nd Semester": 2, "Midyear": 3 };
                    return semWeights[t.termSem] < semWeights[termObj.termSem];
                }
                return false;
            }).sort((a, b) => {
                const tA = terms.find(term => term.termID === a.termID);
                const tB = terms.find(term => term.termID === b.termID);
                if (!tA || !tB) return 0;
                if (tA.termSY !== tB.termSY) return tA.termSY.localeCompare(tB.termSY);
                const semWeights: Record<string, number> = { "1st Semester": 1, "2nd Semester": 2, "Midyear": 3 };
                return semWeights[tA.termSem] - semWeights[tB.termSem];
            });

            if (pastStandings.length > 0) {
                const lastWithCQPA = [...pastStandings].reverse().find(s => s.semCQPA > 0);
                if (lastWithCQPA) displayCQPA = lastWithCQPA.semCQPA;
            }
        }
        return displayCQPA;
    };

    return (
        <div className="hidden print:block w-full text-black font-sans bg-white print:break-before-page">
            <style type="text/css">{`@media print { @page { size: portrait; margin: 0.5in; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
            <div className="flex items-end justify-between border-b-2 border-black pb-4 mb-6">
                <div className="flex items-center gap-4">
                    <img src="/imgCCS.jpg" alt="CCS Logo" className="h-16 w-16 object-contain" />
                    <div>
                        <div className="font-display text-2xl font-bold uppercase tracking-tight">College of Computer Studies</div>
                        <div className="text-sm font-semibold">Official Academic History</div>
                        <div className="mt-1 text-xs">Generated via COMPASS System</div>
                    </div>
                </div>
                <div className="text-right text-sm font-medium">
                    <div>Date Printed: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 text-sm border-b pb-4">
                <div><span className="font-bold">Student Name:</span> {student.studLastName}, {student.studFirstName} {student.studMiddleName}</div>
                <div><span className="font-bold">Student ID:</span> {student.studentID}</div>
                <div><span className="font-bold">Program:</span> {student.programCode}</div>
                <div><span className="font-bold">Current Year Level:</span> Year {student.yearLevel}</div>
            </div>

            {studentTerms.length === 0 ? (
                <div className="text-center italic mt-10">No academic records found for this student.</div>
            ) : (
                <div className="space-y-8">
                    {studentTerms.map(term => {
                        const termRecs = studentRecords.filter(r => r.termID === term.termID);
                        const termStanding = standings.find(ts => ts.studentID === student.studentID && ts.termID === term.termID);
                        const displayCQPA = getDisplayCQPA(termStanding, term);

                        return (
                            <div key={term.termID}>
                                <div className="font-bold bg-gray-200 px-3 py-1 mb-2">
                                    {term.termSem}, AY {term.termSY}
                                </div>
                                <table className="w-full text-left text-sm mb-2 border-collapse">
                                    <thead>
                                        <tr className="border-b-2 border-black">
                                            <th className="py-1">Code</th>
                                            <th className="py-1">Descriptive Title</th>
                                            <th className="py-1 text-center">Units</th>
                                            <th className="py-1 text-center">Grade</th>
                                            <th className="py-1 text-center">Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {termRecs.map(rec => {
                                            const pc = programCourses.find(p => p.programCourseID === rec.programCourseID);
                                            const course = courses.find(c => pc && c.courseCode === pc.courseCode);
                                            if (!pc || !course) return null;
                                            return (
                                                <tr key={rec.recordID} className="border-b border-gray-300">
                                                    <td className="py-1">{pc.courseCode}</td>
                                                    <td className="py-1">{course.courseTitle}</td>
                                                    <td className="py-1 text-center">{course.courseUnits}</td>
                                                    <td className="py-1 text-center font-bold">{rec.finalGrade?.toFixed(1) || "-"}</td>
                                                    <td className="py-1 text-center">{rec.gradeRemarks || "-"}</td>
                                                </tr>
                                            );
                                        })}
                                        {termRecs.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="py-2 text-center italic text-gray-500">No subjects encoded for this term.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {termStanding && (
                                    <div className="flex justify-end gap-6 text-sm font-bold mt-2">
                                        <div>TQPA: {termStanding.termQPA.toFixed(2)}</div>
                                        <div>CQPA: {displayCQPA.toFixed(2)}</div>
                                        <div>Status: {termStanding.termAcademicStatus.toUpperCase().replace('-', ' ')}</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
