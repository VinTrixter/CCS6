// src/components/Reports.tsx
import { useState, useEffect } from "react";
import { useStore } from "../store/store";
import type { TERM_STANDING } from "../store/types";
import { backendAPI, type EnrichedStudent } from "../backend/api";
import * as I from "./icons";

type ReportRecord = TERM_STANDING & { student: EnrichedStudent };

export default function Reports() {
    const { students, programs, activeTerm, activeUser, standings, can, setActiveView, setFocusedStudentID, pendingReportFilter, setPendingReportFilter, terms } = useStore();
    const [printDate] = useState(() => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));

    const statusFilter = pendingReportFilter;
    const setStatusFilter = setPendingReportFilter;

    const [programFilter, setProgramFilter] = useState<string>("All");
    const [yearFilter, setYearFilter] = useState<string>("All");
    const [accountFilter, setAccountFilter] = useState<string>("Active");

    const [reportData, setReportData] = useState<ReportRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const activeStandings = standings.filter(ts => ts.termID === activeTerm);
    const activeTermDetails = terms.find(t => t.termID === activeTerm);

    useEffect(() => {
        let isMounted = true;
        const fetchReport = async () => {
            setIsLoading(true);
            const { data, error } = await backendAPI.generateReport(statusFilter, programFilter, yearFilter, accountFilter, students, activeStandings);
            if (isMounted) {
                if (error) alert(error);
                if (data) setReportData(data as ReportRecord[]);
                setIsLoading(false);
            }
        };
        void fetchReport();
        return () => { isMounted = false; };
    }, [statusFilter, programFilter, yearFilter, accountFilter, students, activeTerm, activeStandings]);

    return (
        <div className="flex w-full flex-col p-6 lg:p-8 print:p-0">
            <div className="mb-6 flex flex-col gap-4 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Reports & Archives</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Generate and print official academic standing rosters.</p>
                </div>
                <div className="flex flex-col gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between transition-colors">
                    <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                        <div className="flex-1">
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Academic Status</label>
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="All Students">All Students</option><option value="All Flagged">All Flagged (OP + ATS)</option><option value="On-Probation">On-Probation</option><option value="Advised to Shift">Advised to Shift</option><option value="Regular">Regular (Good Standing)</option></select>
                        </div>
                        <div className="flex-1">
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Account</label>
                            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="Active">Active</option><option value="Inactive">Inactive</option><option value="Graduated">Graduated</option><option value="All">All Accounts</option></select>
                        </div>
                        <div className="flex-1">
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Program</label>
                            <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="All">All Programs</option>{programs.map(p => <option key={p.programCode} value={p.programCode}>{p.programCode}</option>)}</select>
                        </div>
                        <div className="flex-1">
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Year</label>
                            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="All">All Years</option>{[1, 2, 3, 4].map(y => <option key={y} value={y.toString()}>Year {y}</option>)}</select>
                        </div>
                    </div>
                    <div className="shrink-0">
                        <button onClick={() => window.print()} disabled={!can('generate_forms') || reportData.length === 0 || isLoading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 dark:bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 dark:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                            <I.Printer className="h-4 w-4" /> Generate PDF
                        </button>
                    </div>
                </div>
            </div>

            <div className="hidden pb-6 print:block">
                <div className="flex items-end justify-between border-b-2 border-slate-800 pb-4">
                    {/* FIXED: Injected official CCS Logo layout for PDF */}
                    <div className="flex items-center gap-4">
                        <img src="/imgCCS.jpg" alt="CCS Logo" className="h-16 w-16 object-contain" />
                        <div>
                            <div className="font-display text-2xl font-bold uppercase tracking-tight text-slate-800">College of Computer Studies</div>
                            <div className="text-sm font-semibold text-slate-600">Official Academic Standing Report</div>
                            <div className="mt-1 text-xs text-slate-500">Generated via COMPASS System</div>
                        </div>
                    </div>
                    <div className="text-right text-sm font-medium text-slate-700">
                        <div>{activeTermDetails?.termSem}, AY {activeTermDetails?.termSY}</div>
                        <div>Date Printed: {printDate}</div>
                        <div className="text-xs text-slate-500">Prepared by: {activeUser?.userFirstName} {activeUser?.userLastName}</div>
                    </div>
                </div>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm print:rounded-none print:border-0 print:shadow-none transition-colors">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 print:border-b-2 print:border-slate-800 print:bg-white print:text-slate-800">
                    <tr>
                        <th className="px-5 py-4 font-bold">Student</th>
                        <th className="px-5 py-4 text-center font-bold">Program & Yr</th>
                        <th className="px-5 py-4 text-center font-bold">QPA</th>
                        <th className="px-5 py-4 text-center font-bold">CQPA</th>
                        <th className="px-5 py-4 text-right font-bold">Academic Status</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 print:divide-slate-300">
                    {reportData.map(record => {
                        let status = record.termAcademicStatus as string;
                        if (status.toUpperCase() === 'ADVISED-TO-SHIFT') status = 'Advised to Shift';
                        if (status.toUpperCase() === 'ON-PROBATION') status = 'On-Probation';
                        if (status.toUpperCase() === 'REGULAR') status = 'Regular';
                        if (status.toUpperCase() === 'UNENCODED') status = 'Unencoded';

                        return (
                            <tr
                                key={record.standingID}
                                onClick={() => { setFocusedStudentID(record.student.studentID); setActiveView("evaluator"); }}
                                className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-700/50 print:hover:bg-white"
                                title="Click to view student profile"
                            >
                                <td className="px-5 py-3">
                                    <div className="font-bold text-slate-800 dark:text-slate-200 print:text-black">
                                        {record.student?.studLastName}, {record.student?.studFirstName}
                                        {record.student?.accountStatus !== 'Active' && <span className="ml-2 rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400 print:hidden">{record.student?.accountStatus.toUpperCase()}</span>}
                                    </div>
                                    <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{record.student?.studentID}</div>
                                </td>
                                <td className="px-5 py-3 text-center"><div className="font-semibold text-slate-700 dark:text-slate-300 print:text-black">{record.student?.programCode}</div><div className="text-xs text-slate-500 dark:text-slate-400">Year {record.student?.yearLevel}</div></td>
                                <td className="px-5 py-3 text-center font-mono">{record.termQPA.toFixed(2)}</td>
                                <td className="px-5 py-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200 print:text-black">{record.semCQPA.toFixed(2)}</td>
                                <td className="px-5 py-3 text-right">
                                    <span className={`print:hidden inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status === 'Advised to Shift' ? 'bg-coral-tint dark:bg-red-900/30 text-coral dark:text-red-400' : status === 'On-Probation' ? 'bg-amber-tint dark:bg-amber-900/30 text-amber dark:text-amber-400' : status === 'Unencoded' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}`}>{status}</span>
                                    <span className="hidden text-xs font-bold uppercase print:inline">{status}</span>
                                </td>
                            </tr>
                        );
                    })}
                    {reportData.length === 0 && !isLoading && <tr><td colSpan={5} className="p-8 text-center text-slate-400 dark:text-slate-500">No records match the current filter criteria.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}