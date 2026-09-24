// src/components/Dashboard.tsx
import { useEffect, useState } from "react";
import { useStore } from "../store/store";
import { backendAPI } from "../backend/api";
import ShiftingFormModal from "./ShiftingFormModal";
import * as I from "./icons";

export default function Dashboard() {
    const { activeTerm, students, standings, remarks, activeUser, setActiveView, setPendingReportFilter, setFocusedStudentID, setPendingEvaluatorAction, highlightReviewTable, setHighlightReviewTable, can } = useStore();
    const [showShiftingModal, setShowShiftingModal] = useState(false);

    useEffect(() => {
        if (highlightReviewTable) {
            const timer = setTimeout(() => setHighlightReviewTable(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [highlightReviewTable, setHighlightReviewTable]);

    const currentTermStandings = standings.filter(ts => ts.termID === activeTerm);
    const activeStudentsCount = students.filter(s => s.accountStatus === 'Active').length;
    const onProbationCount = currentTermStandings.filter(ts => ts.termAcademicStatus === 'On-Probation').length;
    const advisedToShiftCount = currentTermStandings.filter(ts => ts.termAcademicStatus === 'Advised to Shift').length;

    // FIXED: Implemented centralized filtering logic to permanently sync with Shell.tsx
    const manualReviewList = backendAPI.getManualReviewList(currentTermStandings, remarks, activeTerm, activeUser);

    const navigateToReport = (filter: string) => {
        setPendingReportFilter(filter);
        setActiveView("reports");
    };

    const navigateToEvaluator = (studentID?: string, isNew: boolean = false) => {
        if (isNew) setPendingEvaluatorAction("new");
        else if (studentID) setFocusedStudentID(studentID);
        setActiveView("evaluator");
    };

    return (
        <div className="flex w-full flex-col gap-6 p-6 lg:p-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm transition-colors">
                    <div className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400"><I.Users className="h-5 w-5" /></div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Students</h3>
                        </div>
                        <div className="mt-4 text-4xl font-black text-slate-800 dark:text-slate-100">{activeStudentsCount}</div>
                    </div>
                    <button onClick={() => navigateToReport("All Students")} className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-sky-700 dark:hover:text-sky-400">View Active Roster</button>
                </div>

                <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 shadow-sm transition-colors">
                    <div className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-500"><I.Warning className="h-5 w-5" /></div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-blue-800 dark:text-blue-500">On Probation</h3>
                        </div>
                        <div className="mt-4 text-4xl font-black text-blue-700 dark:text-blue-500">{onProbationCount}</div>
                    </div>
                    <button onClick={() => navigateToReport("On-Probation")} className="border-t border-blue-200/50 dark:border-blue-900/50 bg-blue-100/30 dark:bg-blue-900/30 py-3 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 transition hover:bg-blue-200/50 dark:hover:bg-blue-900/60">View Flagged Records</button>
                </div>

                <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800 shadow-sm transition-colors">
                    <div className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"><I.ShieldAlert className="h-5 w-5" /></div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">Advised to Shift</h3>
                        </div>
                        <div className="mt-4 text-4xl font-black text-slate-700 dark:text-slate-300">{advisedToShiftCount}</div>
                    </div>
                    <button onClick={() => navigateToReport("Advised to Shift")} className="border-t border-slate-300/50 dark:border-slate-700 bg-slate-200/30 dark:bg-slate-700/30 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 transition hover:bg-slate-300/50 dark:hover:bg-slate-700/60">View Mandatory Shifts</button>
                </div>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div className={`flex-1 flex flex-col overflow-hidden rounded-xl border transition-all duration-500 ${highlightReviewTable ? 'border-blue-500 ring-4 ring-blue-500/50 shadow-blue-500/20 shadow-lg scale-[1.01]' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm'}`}>
                    <div className={`border-b border-slate-100 dark:border-slate-700 px-5 py-3 transition-colors duration-500 ${highlightReviewTable ? 'bg-blue-50 dark:bg-blue-900/40' : 'bg-slate-50 dark:bg-slate-900/50'}`}>
                        <h2 className="font-bold text-slate-800 dark:text-slate-100">Pending Automated Reviews</h2>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Records dynamically flag and clear as system dependencies are met.</p>
                    </div>
                    <div className={`overflow-x-auto transition-colors duration-500 ${highlightReviewTable ? 'bg-blue-50/30 dark:bg-blue-900/20' : 'bg-white dark:bg-slate-800'}`}>
                        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                            <thead className="border-b border-slate-100 dark:border-slate-700 text-xs uppercase text-slate-400 dark:text-slate-500">
                            <tr>
                                <th className="px-5 py-4 font-semibold">Student ID</th>
                                <th className="px-5 py-4 font-semibold">Semestral QPA</th>
                                <th className="px-5 py-4 font-semibold">Current Standing</th>
                                <th className="px-5 py-4 text-right font-semibold">Action</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {manualReviewList.map(ts => {
                                return (
                                    <tr key={ts.standingID} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-5 py-4 font-mono font-bold text-slate-800 dark:text-slate-200">{ts.studentID}</td>
                                        <td className="px-5 py-4 font-mono">{ts.termQPA.toFixed(3)}</td>
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ts.termAcademicStatus === 'Advised to Shift' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300'}`}>
                                              {ts.termAcademicStatus}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <button onClick={() => navigateToEvaluator(ts.studentID)} className="rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm transition hover:border-blue-700 hover:text-blue-700 dark:hover:border-blue-400 dark:hover:text-blue-400 disabled:opacity-50">
                                                Resolve Profile
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {manualReviewList.length === 0 && (
                                <tr><td colSpan={4} className="p-8 text-center text-slate-400 dark:text-slate-500">All clear. System detected no active compliance violations.</td></tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {can('manage_records') && (
                    <div className="flex w-full shrink-0 flex-col gap-3 lg:w-64">
                        <h2 className="font-bold text-slate-800 dark:text-slate-100">Quick Actions</h2>
                        <button onClick={() => navigateToEvaluator(undefined, true)} className="flex items-center justify-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-slate-600 dark:text-slate-300 shadow-sm transition hover:border-sky-600 hover:text-sky-600 dark:hover:border-sky-400 dark:hover:text-sky-400">
                            <I.UserSearch className="h-5 w-5 shrink-0" />
                            <span className="text-sm font-bold">Add New Student</span>
                        </button>
                        <button onClick={() => navigateToReport("On-Probation")} className="flex items-center justify-start gap-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/10 p-3 text-blue-700 dark:text-blue-400 shadow-sm transition hover:bg-blue-100 dark:hover:bg-blue-900/30">
                            <I.FileChart className="h-5 w-5 shrink-0" />
                            <span className="text-sm font-bold">Generate OP Report</span>
                        </button>
                        <button onClick={() => navigateToReport("Advised to Shift")} className="flex items-center justify-start gap-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-3 text-slate-700 dark:text-slate-300 shadow-sm transition hover:bg-slate-200 dark:hover:bg-slate-700">
                            <I.FileChart className="h-5 w-5 shrink-0" />
                            <span className="text-sm font-bold">Generate ATS Report</span>
                        </button>
                        {can('generate_forms') && (
                            <button onClick={() => setShowShiftingModal(true)} className="flex items-center justify-start gap-3 rounded-lg border border-blue-900 dark:border-blue-600 bg-blue-900 dark:bg-blue-600 p-3 text-white shadow-sm transition hover:bg-blue-800 dark:hover:bg-blue-500">
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