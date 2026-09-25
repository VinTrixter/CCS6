// src/components/Settings.tsx
import React, { useState, useEffect } from "react";
import { useStore } from "../store/store";
import { backendAPI } from "../backend/api";
import type { ACADEMIC_TERM, SYSTEM_SETTINGS } from "../store/types";
import * as I from "./icons";

type SettingsTab = "profile" | "system" | "audit";

export default function Settings() {
    const { activeUser, setActiveUser, activeTerm, setActiveTerm, auditLogs, can, pushAudit, pendingSettingsTab, setPendingSettingsTab, terms, setTerms, programs, retentionPolicies, setRetentionPolicies, systemSettings, setSystemSettings } = useStore();
    const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

    const [auditFilters, setAuditFilters] = useState({ start: "", end: "", user: "", action: "", target: "" });
    const [isSaving, setIsSaving] = useState(false);

    // Dynamic New Term & Retention Policy State
    const [startYear, setStartYear] = useState<string>("");
    const endYear = startYear.length === 4 ? (parseInt(startYear) + 1).toString() : "";
    const [sem, setSem] = useState<string>("1st Semester");

    // Global Boundaries State
    const [sysBounds, setSysBounds] = useState({
        op: systemSettings?.probationThreshold || 2.0,
        ats: systemSettings?.atsThreshold || 1.0
    });

    const isNewCohort = startYear.length === 4
        && !retentionPolicies.some(p => p.effectiveYear === parseInt(startYear))
        && !terms.some(t => t.termSY.startsWith(startYear));
    const [showCustomPolicy, setShowCustomPolicy] = useState(false);
    const [customPolicies, setCustomPolicies] = useState<Record<string, { major: string, minor: string }>>({});

    useEffect(() => {
        if (pendingSettingsTab) {
            const timer = setTimeout(() => {
                setActiveTab(pendingSettingsTab);
                setPendingSettingsTab(null);
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [pendingSettingsTab, setPendingSettingsTab]);

    // FIXED: Using a timeout correctly mimics the codebase's established pattern for safely updating state from effects
    useEffect(() => {
        if (systemSettings) {
            const timer = setTimeout(() => {
                setSysBounds({ op: systemSettings.probationThreshold, ats: systemSettings.atsThreshold });
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [systemSettings]);

    const handleStartYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
        setStartYear(val);

        if (val.length === 4) {
            setShowCustomPolicy(false);
            const syNum = parseInt(val);
            const prior = retentionPolicies.filter(p => p.effectiveYear < syNum);
            const maxPrior = prior.length > 0 ? Math.max(...prior.map(p => p.effectiveYear)) : null;

            const initPol: Record<string, { major: string, minor: string }> = {};
            programs.forEach(prog => {
                if (maxPrior !== null) {
                    const existing = retentionPolicies.find(p => p.effectiveYear === maxPrior && p.programCode === prog.programCode);
                    initPol[prog.programCode] = {
                        major: existing ? existing.majorPassingGrade.toString() : "2.0",
                        minor: existing ? existing.minorPassingGrade.toString() : "1.0"
                    };
                } else {
                    initPol[prog.programCode] = { major: "2.0", minor: "1.0" };
                }
            });
            setCustomPolicies(initPol);
        }
    };

    const handleProfileSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!activeUser) return;
        setIsSaving(true);

        const { error } = await backendAPI.updateUserProfile(
            activeUser.userID,
            activeUser.userFirstName,
            activeUser.userMiddleName || null,
            activeUser.userLastName
        );

        if (error) {
            alert("Database Error: Could not update profile. " + error);
        } else {
            pushAudit("UPDATED_OWN_PROFILE", activeUser.userID);
            alert("Profile updated successfully.");
        }
        setIsSaving(false);
    };

    const handleSystemSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setIsSaving(true);
        const { error } = await backendAPI.updateActiveTerm(activeTerm);
        if (error) {
            alert("Database Error: Could not update active term. " + error);
        } else {
            setTerms(terms.map(t => ({ ...t, isCurrent: t.termID === activeTerm })));
            pushAudit("UPDATED_ACTIVE_TERM", activeTerm);
            alert("System environment variables updated successfully.");
        }
        setIsSaving(false);
    };

    const handleBoundsSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setIsSaving(true);
        const newSettings: SYSTEM_SETTINGS = { id: 'global', probationThreshold: sysBounds.op, atsThreshold: sysBounds.ats };
        const { error } = await backendAPI.updateSystemSettings(newSettings);
        if (error) {
            alert("Database Error: Could not update boundaries. " + error);
        } else {
            setSystemSettings(newSettings);
            pushAudit("UPDATED_SYSTEM_BOUNDARIES", "Global Settings");
            alert("Academic standing boundaries updated successfully.");
        }
        setIsSaving(false);
    };

    const handleAddTerm = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (startYear.length !== 4) return alert("Please enter a valid 4-digit start year.");

        const semCode = sem === "1st Semester" ? "1" : sem === "2nd Semester" ? "2" : "3";
        const syStr = `${startYear}-${endYear}`;
        const newID = `T${startYear}-${semCode}`;

        if (terms.some(t => t.termID === newID)) return alert("This academic term already exists.");

        setIsSaving(true);
        const newTerm: ACADEMIC_TERM = {
            termID: newID, termSY: syStr, termSem: sem as "1st Semester" | "2nd Semester" | "Midyear", isCurrent: false
        };

        let payloadPolicies = null;
        if (isNewCohort && showCustomPolicy) {
            payloadPolicies = Object.entries(customPolicies).map(([prog, grades]) => ({
                programCode: prog, majorPassingGrade: Number(grades.major), minorPassingGrade: Number(grades.minor)
            }));
        }

        const { error, newPolicies } = await backendAPI.createTerm(newTerm, parseInt(startYear), isNewCohort, payloadPolicies, retentionPolicies, programs);

        if (error) {
            alert("Database Error: Could not create term. " + error);
        } else {
            setTerms([...terms, newTerm]);
            if (newPolicies && newPolicies.length > 0) {
                setRetentionPolicies([...retentionPolicies, ...newPolicies]);
            }
            pushAudit("CREATED_ACADEMIC_TERM", newID);
            alert("New academic term and cohort policies registered successfully.");
            setStartYear("");
            setSem("1st Semester");
            setShowCustomPolicy(false);
        }
        setIsSaving(false);
    };

    // FIXED: Parameterless catch block entirely bypasses unused variable linting rules
    const filteredLogs = auditLogs.filter(log => {
        try {
            if (!log.timestamp) return false;
            const logDate = new Date(log.timestamp).toISOString().split('T')[0];
            return !(
                (auditFilters.start && logDate < auditFilters.start) ||
                (auditFilters.end && logDate > auditFilters.end) ||
                (auditFilters.user && log.userID !== auditFilters.user) ||
                (auditFilters.action && !log.action.includes(auditFilters.action)) ||
                (auditFilters.target && !log.target.toLowerCase().includes(auditFilters.target.toLowerCase()))
            );
        } catch {
            return false;
        }
    });

    return (
        <div className="flex w-full flex-col p-6 lg:p-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">System Settings</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Manage your profile, system variables, and view security logs.</p>
            </div>

            <div className="flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm transition-colors">
                <div className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4">
                    <nav className="flex flex-col gap-2">
                        <button onClick={() => setActiveTab("profile")} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition-colors ${activeTab === "profile" ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-600" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"}`}><I.UserSearch className="h-4 w-4" /> My Profile</button>
                        {can('manage_records') && <button onClick={() => setActiveTab("system")} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition-colors ${activeTab === "system" ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-600" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"}`}><I.Settings className="h-4 w-4" /> Environment</button>}
                        {can('manage_records') && <button onClick={() => setActiveTab("audit")} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition-colors ${activeTab === "audit" ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-600" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"}`}><I.ShieldAlert className="h-4 w-4" /> Audit Ledger</button>}
                    </nav>
                </div>

                <div className="flex-1 p-8 overflow-y-auto">
                    {activeTab === "profile" && (
                        <div className="max-w-2xl">
                            <h2 className="mb-6 text-lg font-bold text-slate-800 dark:text-slate-100">Profile Information</h2>
                            <form onSubmit={handleProfileSave} className="flex flex-col gap-5">
                                <div className="grid grid-cols-2 gap-5">
                                    <div><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">First Name</label><input type="text" value={activeUser?.userFirstName || ""} onChange={(e) => activeUser && setActiveUser({...activeUser, userFirstName: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2.5 text-sm outline-none focus:border-blue-700 transition-colors" /></div>
                                    <div><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Last Name</label><input type="text" value={activeUser?.userLastName || ""} onChange={(e) => activeUser && setActiveUser({...activeUser, userLastName: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2.5 text-sm outline-none focus:border-blue-700 transition-colors" /></div>
                                </div>
                                <div><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Username handle</label><input type="text" value={activeUser?.userName || ""} disabled className="w-full cursor-not-allowed rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-sm text-slate-400 outline-none" /></div>
                                <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-5"><button type="submit" className="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800">Save Profile Details</button></div>
                            </form>
                        </div>
                    )}

                    {activeTab === "system" && can('manage_records') && (
                        <div className="max-w-5xl">
                            <h2 className="mb-6 text-lg font-bold text-slate-800 dark:text-slate-100">Global Environment Variables</h2>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                                {/* LEFT COLUMN */}
                                <div className="flex flex-col gap-6">
                                    <form onSubmit={handleSystemSave} className="flex flex-col gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-5 transition-colors">
                                        <label className="mb-1.5 block text-sm font-bold text-slate-800 dark:text-slate-200">Active Academic Term</label>
                                        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Sets the default term context for the Student Evaluator and Reports generation.</p>
                                        <select value={activeTerm} onChange={(e) => setActiveTerm(e.target.value)} disabled={isSaving} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-sm font-semibold outline-none focus:border-blue-700 disabled:opacity-50 transition-colors">
                                            {terms.map(t => <option key={t.termID} value={t.termID}>{t.termSem}, AY {t.termSY} {t.isCurrent ? "(Current)" : ""}</option>)}
                                        </select>
                                        <div className="mt-2 text-right"><button type="submit" disabled={isSaving} className="rounded-lg bg-slate-800 dark:bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50">Set Active Term</button></div>
                                    </form>

                                    <form onSubmit={handleAddTerm} className="flex flex-col rounded-xl border border-blue-100 dark:border-blue-900 bg-white dark:bg-slate-800 p-5 shadow-sm transition-colors">
                                        <label className="mb-1.5 block text-sm font-bold text-blue-800 dark:text-blue-400">Create New Academic Term</label>
                                        <p className="mb-6 text-xs text-slate-500 dark:text-slate-400">Initialize a new academic semester for the system. This action is permanent.</p>

                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Academic Year</label>
                                                <div className="flex items-center gap-2">
                                                    <input required maxLength={4} placeholder="Start" value={startYear} onChange={handleStartYearChange} disabled={isSaving} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm text-center outline-none focus:border-blue-700 disabled:opacity-50 transition-colors" />
                                                    <span className="text-slate-400 font-bold">-</span>
                                                    <input value={endYear} disabled placeholder="End" className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-2 text-sm text-center cursor-not-allowed text-slate-400 outline-none transition-colors" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Semester</label>
                                                <select required value={sem} onChange={e => setSem(e.target.value)} disabled={isSaving} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 disabled:opacity-50 transition-colors">
                                                    <option>1st Semester</option><option>2nd Semester</option><option>Midyear</option>
                                                </select>
                                            </div>
                                        </div>

                                        {isNewCohort && (
                                            <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10 p-5 transition-colors">
                                                <div className="flex items-start gap-3">
                                                    <I.Warning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
                                                    <div className="flex-1">
                                                        <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400">New Cohort Detected</h4>
                                                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-500/80">Retention policies for the {startYear} cohort will automatically inherit thresholds from the previous academic year.</p>

                                                        {!showCustomPolicy ? (
                                                            <button type="button" onClick={() => setShowCustomPolicy(true)} className="mt-3 rounded-md bg-amber-100 dark:bg-amber-900/40 px-4 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors">Define Custom Policy</button>
                                                        ) : (
                                                            <div className="mt-5 rounded-lg border border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
                                                                <div className="mb-3 flex items-center justify-between">
                                                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Custom Thresholds for {startYear}</h4>
                                                                    <button type="button" onClick={() => setShowCustomPolicy(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><I.X className="h-4 w-4" /></button>
                                                                </div>
                                                                <div className="grid grid-cols-3 gap-2 border-b border-slate-100 dark:border-slate-700 pb-2 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
                                                                    <div>Program</div><div className="text-center">Major Grade</div><div className="text-center">Minor Grade</div>
                                                                </div>
                                                                {programs.map(prog => (
                                                                    <div key={prog.programCode} className="grid grid-cols-3 gap-2 items-center border-b border-slate-50 dark:border-slate-700/50 py-2 last:border-0">
                                                                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{prog.programCode}</div>
                                                                        <input type="number" step="0.1" min="0" max="4" value={customPolicies[prog.programCode]?.major || "2.0"} onChange={e => setCustomPolicies({...customPolicies, [prog.programCode]: { ...customPolicies[prog.programCode], major: e.target.value }})} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent p-1 text-center text-sm outline-none focus:border-blue-700 dark:text-slate-200" />
                                                                        <input type="number" step="0.1" min="0" max="4" value={customPolicies[prog.programCode]?.minor || "1.0"} onChange={e => setCustomPolicies({...customPolicies, [prog.programCode]: { ...customPolicies[prog.programCode], minor: e.target.value }})} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-transparent p-1 text-center text-sm outline-none focus:border-blue-700 dark:text-slate-200" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-2 text-right border-t border-slate-100 dark:border-slate-700 pt-4">
                                            <button type="submit" disabled={isSaving || startYear.length !== 4} className="rounded-lg bg-blue-700 dark:bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 dark:hover:bg-blue-700 disabled:opacity-50">Register Term & Cohort</button>
                                        </div>
                                    </form>
                                </div>

                                {/* RIGHT COLUMN */}
                                <div className="flex flex-col gap-6">
                                    <form onSubmit={handleBoundsSave} className="flex flex-col gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-5 transition-colors">
                                        <label className="mb-1.5 block text-sm font-bold text-slate-800 dark:text-slate-200">Academic Standing Boundaries (CQPA)</label>
                                        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Set the cumulative threshold boundaries for academic standing evaluations.</p>
                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">On Probation (&lt;)</label>
                                                <input type="number" step="0.1" required value={sysBounds.op} onChange={e => setSysBounds({...sysBounds, op: Number(e.target.value)})} disabled={isSaving} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-sm font-semibold outline-none focus:border-blue-700 disabled:opacity-50 transition-colors" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Advised to Shift (&lt;)</label>
                                                <input type="number" step="0.1" required value={sysBounds.ats} onChange={e => setSysBounds({...sysBounds, ats: Number(e.target.value)})} disabled={isSaving} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-sm font-semibold outline-none focus:border-blue-700 disabled:opacity-50 transition-colors" />
                                            </div>
                                        </div>
                                        <div className="mt-2 text-right">
                                            <button type="submit" disabled={isSaving} className="rounded-lg bg-slate-800 dark:bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50">Save Boundaries</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "audit" && can('manage_records') && (
                        <div className="flex h-full flex-col">
                            <div className="mb-4 flex flex-col gap-2 shrink-0">
                                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Security Audit Ledger</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Immutable read-only log of session operations.</p>
                            </div>

                            <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 transition-colors shrink-0">
                                <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Filter Ledger</div>
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                                    <input type="date" value={auditFilters.start} onChange={e => setAuditFilters({...auditFilters, start: e.target.value})} className="rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-800 p-2 text-xs outline-none focus:border-blue-700 dark:focus:border-blue-500" title="Start Date" />
                                    <input type="date" value={auditFilters.end} onChange={e => setAuditFilters({...auditFilters, end: e.target.value})} className="rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-800 p-2 text-xs outline-none focus:border-blue-700 dark:focus:border-blue-500" title="End Date" />
                                    <input type="text" placeholder="User ID..." value={auditFilters.user} onChange={e => setAuditFilters({...auditFilters, user: e.target.value})} className="rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-800 p-2 text-xs outline-none focus:border-blue-700 dark:focus:border-blue-500" />
                                    <input type="text" placeholder="Action Type..." value={auditFilters.action} onChange={e => setAuditFilters({...auditFilters, action: e.target.value.toUpperCase()})} className="rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-800 p-2 text-xs outline-none focus:border-blue-700 dark:focus:border-blue-500" />
                                    <input type="text" placeholder="Target Search..." value={auditFilters.target} onChange={e => setAuditFilters({...auditFilters, target: e.target.value})} className="rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-800 p-2 text-xs outline-none focus:border-blue-700 dark:focus:border-blue-500" />
                                </div>
                                <div className="mt-3 text-right">
                                    <button onClick={() => setAuditFilters({ start: "", end: "", user: "", action: "", target: "" })} className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400">Clear Filters</button>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-colors flex flex-col overflow-hidden">
                                <div className="max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                                        <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-500 dark:text-slate-400 shadow-sm">
                                        <tr>
                                            <th className="px-5 py-3 font-semibold">Timestamp</th><th className="px-5 py-3 font-semibold">User ID</th><th className="px-5 py-3 font-semibold">Action Executed</th><th className="px-5 py-3 font-semibold text-right">Target Document</th>
                                        </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {filteredLogs.map(log => (
                                            <tr key={log.logID} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                <td className="px-5 py-3 font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</td><td className="px-5 py-3 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{log.userID}</td><td className="px-5 py-3"><span className="rounded bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:text-blue-400">{log.action.replace(/_/g, ' ')}</span></td><td className="px-5 py-3 text-right font-mono text-xs">{log.target}</td>
                                            </tr>
                                        ))}
                                        {filteredLogs.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400 dark:text-slate-500">No events match the current filters.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}