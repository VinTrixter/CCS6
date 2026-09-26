// src/components/Reports.tsx
import { useState, useEffect, useRef } from "react";
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

    const [selectedTermID, setSelectedTermID] = useState<string>(activeTerm);
    const [showTermDropdown, setShowTermDropdown] = useState(false);
    const [termSearchQuery, setTermSearchQuery] = useState("");
    const termDropdownRef = useRef<HTMLDivElement>(null);

    const [reportData, setReportData] = useState<ReportRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const targetStandings = standings.filter(ts => ts.termID === selectedTermID);
    const targetTermDetails = terms.find(t => t.termID === selectedTermID);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (termDropdownRef.current && !termDropdownRef.current.contains(event.target as Node)) {
                setShowTermDropdown(false);
            }
        };
        if (showTermDropdown) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showTermDropdown]);

    useEffect(() => {
        let isMounted = true;
        const fetchReport = async () => {
            setIsLoading(true);
            // FIXED: Passing targetTermDetails unlocks the new chronological mapping engine for unencoded students
            const { data, error } = await backendAPI.generateReport(statusFilter, programFilter, yearFilter, accountFilter, students, targetStandings, targetTermDetails);
            if (isMounted) {
                if (error) alert(error);
                if (data) setReportData(data as ReportRecord[]);
                setIsLoading(false);
            }
        };
        void fetchReport();
        return () => { isMounted = false; };
    }, [statusFilter, programFilter, yearFilter, accountFilter, students, selectedTermID, targetStandings, targetTermDetails]);

    return (
        <div className="flex w-full flex-col p-6 lg:p-8 print:p-0">
            <div className="mb-6 flex flex-col gap-4 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Reports & Archives</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Generate and print official academic standing rosters for any term.</p>
                </div>

                <div className="flex flex-col gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm transition-colors">
                    <div className="flex flex-wrap items-end gap-3">

                        <div className="flex-[2] min-w-[220px] relative" ref={termDropdownRef}>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Academic Term</label>
                            <button
                                onClick={() => { setShowTermDropdown(!showTermDropdown); setTermSearchQuery(""); }}
                                className="w-full flex items-center justify-between rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none transition-colors hover:border-blue-700 dark:hover:border-blue-500"
                            >
                                <span className="truncate font-semibold">{targetTermDetails ? `${targetTermDetails.termSem}, AY ${targetTermDetails.termSY}` : "Select Term..."}</span>
                                <svg className="h-4 w-4 opacity-50 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showTermDropdown && (
                                <div className="absolute left-0 top-full z-20 mt-1 max-h-[250px] w-full min-w-[280px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl">
                                    <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 shadow-sm">
                                        <input type="text" autoFocus value={termSearchQuery} onChange={e => setTermSearchQuery(e.target.value)} placeholder="Search semester or AY..." className="w-full border-b border-slate-200 dark:border-slate-700 bg-transparent px-4 py-2.5 text-xs text-slate-700 dark:text-slate-200 outline-none" onClick={e => e.stopPropagation()} />
                                    </div>
                                    {terms.filter(t => `${t.termSem} ${t.termSY}`.toLowerCase().includes(termSearchQuery.toLowerCase())).sort((a,b) => b.termSY.localeCompare(a.termSY) || b.termSem.localeCompare(a.termSem)).map(t => (
                                        <button key={t.termID} onClick={() => { setSelectedTermID(t.termID); setShowTermDropdown(false); setTermSearchQuery(""); }} className="flex w-full items-center justify-between border-b border-slate-50 dark:border-slate-700/50 px-4 py-2.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 transition">
                                            <span className="font-bold text-slate-800 dark:text-slate-200">{t.termSem} {t.termID === activeTerm && <span className="ml-2 rounded bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 text-[9px] uppercase text-blue-700 dark:text-blue-300">Active</span>}</span>
                                            <span className="text-xs text-slate-400 dark:text-slate-500">AY {t.termSY}</span>
                                        </button>
                                    ))}
                                    {terms.filter(t => `${t.termSem} ${t.termSY}`.toLowerCase().includes(termSearchQuery.toLowerCase())).length === 0 && (
                                        <div className="px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400">No terms match your search.</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex-[1.5] min-w-[160px]">
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Academic Status</label>
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="All Students">All Students</option><option value="All Flagged">All Flagged (OP + ATS)</option><option value="On-Probation">On-Probation</option><option value="Advised to Shift">Advised to Shift</option><option value="Regular">Regular (Good Standing)</option></select>
                        </div>

                        <div className="flex-1 min-w-[110px]">
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Account</label>
                            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="Active">Active</option><option value="Inactive">Inactive</option><option value="Graduated">Graduated</option><option value="All">All Accounts</option></select>
                        </div>

                        <div className="flex-[1.5] min-w-[140px]">
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Program</label>
                            <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="All">All Programs</option>{programs.map(p => <option key={p.programCode} value={p.programCode}>{p.programCode}</option>)}</select>
                        </div>

                        <div className="flex-1 min-w-[100px]">
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Year</label>
                            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors"><option value="All">All Years</option>{[1, 2, 3, 4].map(y => <option key={y} value={y.toString()}>Year {y}</option>)}</select>
                        </div>

                        <div className="shrink-0 w-full sm:w-auto">
                            <button onClick={() => window.print()} disabled={!can('generate_forms') || reportData.length === 0 || isLoading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 dark:bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 dark:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 h-[38px]">
                                <I.Printer className="h-4 w-4" /> Generate PDF
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="hidden pb-6 print:block">
                <div className="flex items-end justify-between border-b-2 border-slate-800 pb-4">
                    <div className="flex items-center gap-4">
                        <img src="/imgCCS.jpg" alt="CCS Logo" className="h-16 w-16 object-contain" />
                        <div>
                            <div className="font-display text-2xl font-bold uppercase tracking-tight text-slate-800">College of Computer Studies</div>
                            <div className="text-sm font-semibold text-slate-600">Official Academic Standing Report</div>
                            <div className="mt-1 text-xs text-slate-500">Generated via COMPASS System</div>
                        </div>
                    </div>
                    <div className="text-right text-sm font-medium text-slate-700">
                        <div>{targetTermDetails?.termSem}, AY {targetTermDetails?.termSY}</div>
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
                    {reportData.length === 0 && !isLoading && <tr><td colSpan={5} className="p-8 text-center text-slate-400 dark:text-slate-500">No records match the current filter criteria for the selected term.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}