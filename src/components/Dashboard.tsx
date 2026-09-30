// src/components/Dashboard.tsx
import { useEffect, useState, useRef } from "react";
import { useStore } from "../store/store";
import { backendAPI } from "../backend/api";
import ShiftingFormModal from "./ShiftingFormModal";
import * as I from "./icons";

export default function Dashboard() {
    const { activeTerm, students, standings, remarks, activeUser, setActiveView, setPendingReportFilter, setFocusedStudentID, setPendingEvaluatorAction, highlightReviewTable, setHighlightReviewTable, records, terms, can, setPendingLocalTerm, programCourses } = useStore();
    const [showShiftingModal, setShowShiftingModal] = useState(false);

    const reviewTableRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (highlightReviewTable) {
            if (reviewTableRef.current) {
                reviewTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            const timer = setTimeout(() => setHighlightReviewTable(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [highlightReviewTable, setHighlightReviewTable]);

    const currentTermStandings = standings.filter(ts => ts.termID === activeTerm);
    const activeStudentsCount = students.filter(s => s.accountStatus === 'Active').length;
    const onProbationCount = currentTermStandings.filter(ts => ts.termAcademicStatus === 'On-Probation').length;

    // TARGETED FIX: Dashboard metric matches Reports by including current and historical unresolved ATS
    const activeTermObj = terms.find(t => t.termID === activeTerm);
    const activeTermStartYear = activeTermObj ? parseInt(activeTermObj.termSY.split('-')[0]) : 9999;
    const semWeights: Record<string, number> = { "1st Semester": 1, "2nd Semester": 2, "Midyear": 3 };
    const activeSemWeight = activeTermObj ? semWeights[activeTermObj.termSem] : 0;

    const advisedToShiftCount = students.filter(s => s.accountStatus === 'Active').filter(student => {
        return standings.some(ts => {
            if (ts.studentID !== student.studentID) return false;
            if (ts.termAcademicStatus !== 'Advised to Shift') return false;
            const t = terms.find(term => term.termID === ts.termID);
            if (!t) return false;
            const tStart = parseInt(t.termSY.split('-')[0]);
            return tStart < activeTermStartYear || (tStart === activeTermStartYear && semWeights[t.termSem] <= activeSemWeight);
        });
    }).length;

    const manualReviewList = backendAPI.getManualReviewList(standings, remarks, activeTerm, activeUser, records, terms, students, programCourses);

    const navigateToReport = (filter: string) => {
        setPendingReportFilter(filter);
        setActiveView("reports");
    };

    const navigateToEvaluator = (studentID?: string, targetTermID?: string, isNew: boolean = false) => {
        if (isNew) setPendingEvaluatorAction("new");
        else if (studentID) {
            setFocusedStudentID(studentID);
            if (targetTermID) setPendingLocalTerm(targetTermID);
        }
        setActiveView("evaluator");
    };

    return (
        <div className="flex w-full flex-col gap-6 p-6 lg:p-8">
            <div className="flex flex-col gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 px-1">For {activeTermObj ? `${activeTermObj.termSem}, SY ${activeTermObj.termSY}` : activeTerm},</h2>
                <div className="flex flex-col md:flex-row gap-4 lg:gap-6">
                    <div className="flex-1 w-full flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors">
                        <div className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><I.Users className="h-5 w-5" /></div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Active Students</h3>
                        </div>
                        <div className="mt-4 text-4xl font-black text-slate-800">{activeStudentsCount}</div>
                    </div>
                    <button onClick={() => navigateToReport("All Students")} className="border-t border-slate-100 bg-slate-50 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 transition hover:bg-slate-100 hover:text-sky-700">View Active Roster</button>
                </div>

                <div className="flex-1 w-full flex flex-col justify-between overflow-hidden rounded-xl border border-blue-200 bg-blue-50/50 shadow-sm transition-colors">
                    <div className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><I.Warning className="h-5 w-5" /></div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-blue-800">On Probation</h3>
                        </div>
                        <div className="mt-4 text-4xl font-black text-blue-700">{onProbationCount}</div>
                    </div>
                    <button onClick={() => navigateToReport("On-Probation")} className="border-t border-blue-200/50 bg-blue-100/30 py-3 text-xs font-bold uppercase tracking-wider text-blue-700 transition hover:bg-blue-200/50">View Flagged Records</button>
                </div>

                <div className="flex-1 w-full flex flex-col justify-between overflow-hidden rounded-xl border border-slate-300 bg-slate-100/50 shadow-sm transition-colors">
                    <div className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-slate-700"><I.ShieldAlert className="h-5 w-5" /></div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Advised to Shift</h3>
                        </div>
                        <div className="mt-4 text-4xl font-black text-slate-700">{advisedToShiftCount}</div>
                    </div>
                    <button onClick={() => navigateToReport("Advised to Shift")} className="border-t border-slate-300/50 bg-slate-200/30 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 transition hover:bg-slate-300/50">View Mandatory Shifts</button>
                </div>
            </div>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div ref={reviewTableRef} className={`flex-1 flex flex-col overflow-hidden rounded-xl border transition-all duration-500 ${highlightReviewTable ? 'border-blue-500 ring-4 ring-blue-500/50 shadow-blue-500/20 shadow-lg scale-[1.01]' : 'border-slate-200 bg-white shadow-sm'}`}>
                    <div className={`border-b border-slate-100 px-5 py-3 transition-colors duration-500 ${highlightReviewTable ? 'bg-blue-50' : 'bg-slate-50'}`}>
                        <h2 className="font-bold text-slate-800">Pending Automated Reviews</h2>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Records dynamically flag and clear as system dependencies are met.</p>
                    </div>
                    <div className={`max-h-[400px] overflow-auto transition-colors duration-500 ${highlightReviewTable ? 'bg-blue-50/30' : 'bg-white'}`}>
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="border-b border-slate-100 text-xs uppercase text-slate-400">
                            <tr>
                                <th className="px-5 py-4 font-semibold">Student ID</th>
                                <th className="px-5 py-4 font-semibold">Cumulative CQPA</th>
                                <th className="px-5 py-4 font-semibold">Current Standing</th>
                                <th className="px-5 py-4 font-semibold">Issue / Concern</th>
                                <th className="px-5 py-4 text-right font-semibold">Action</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                            {manualReviewList.map(ts => {
                                return (
                                    <tr key={`${ts.standingID}-${ts.targetTermID}`} className="transition hover:bg-slate-50">
                                        <td className="px-5 py-4 font-mono font-bold text-slate-800">{ts.studentID}</td>
                                        <td className="px-5 py-4 font-mono font-bold text-slate-800">
                                            {ts.semCQPA.toFixed(2)}
                                            <span className="block text-[11px] font-normal text-slate-400">Term: {ts.termQPA.toFixed(2)}</span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ts.termAcademicStatus === 'Advised to Shift' ? 'bg-slate-200 text-slate-800' : 'bg-blue-100 text-blue-800'}`}>
                                              {ts.termAcademicStatus}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-xs font-semibold text-coral">{ts.issueDescription}</td>
                                        <td className="px-5 py-4 text-right">
                                            <button onClick={() => navigateToEvaluator(ts.studentID, ts.targetTermID)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition hover:border-blue-700 hover:text-blue-700 disabled:opacity-50">
                                                Resolve Profile
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {manualReviewList.length === 0 && (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400">All clear. System detected no active compliance violations.</td></tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {can('manage_records') && (
                    <div className="flex w-full shrink-0 flex-col gap-3 lg:w-64">
                        <h2 className="font-bold text-slate-800">Quick Actions</h2>
                        <button onClick={() => navigateToEvaluator(undefined, undefined, true)} className="flex items-center justify-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-slate-600 shadow-sm transition hover:border-sky-600 hover:text-sky-600">
                            <I.UserSearch className="h-5 w-5 shrink-0" />
                            <span className="text-sm font-bold">Add New Student</span>
                        </button>
                        <button onClick={() => navigateToReport("On-Probation")} className="flex items-center justify-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-700 shadow-sm transition hover:bg-blue-100">
                            <I.FileChart className="h-5 w-5 shrink-0" />
                            <span className="text-sm font-bold">Generate OP Report</span>
                        </button>
                        <button onClick={() => navigateToReport("Advised to Shift")} className="flex items-center justify-start gap-3 rounded-lg border border-slate-300 bg-slate-100 p-3 text-slate-700 shadow-sm transition hover:bg-slate-200">
                            <I.FileChart className="h-5 w-5 shrink-0" />
                            <span className="text-sm font-bold">Generate ATS Report</span>
                        </button>
                        {can('generate_forms') && (
                            <button onClick={() => setShowShiftingModal(true)} className="flex items-center justify-start gap-3 rounded-lg border border-blue-900 bg-blue-900 p-3 text-white shadow-sm transition hover:bg-blue-800">
                                <I.Printer className="h-5 w-5 shrink-0" />
                                <span className="text-sm font-bold">Generate Shifting Form</span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            <ShiftingFormModal isOpen={showShiftingModal} onClose={() => setShowShiftingModal(false)} />
        </div>
    );
}