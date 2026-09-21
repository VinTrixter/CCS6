// src/components/Settings.tsx
import React, { useState, useEffect } from "react";
import { useStore } from "../store/store";
import { backendAPI } from "../backend/api";
import type { ACADEMIC_TERM } from "../store/types";
import * as I from "./icons";

type SettingsTab = "profile" | "system" | "audit";

export default function Settings() {
    const { activeUser, setActiveUser, activeTerm, setActiveTerm, auditLogs, can, pushAudit, pendingSettingsTab, setPendingSettingsTab, terms, setTerms } = useStore();
    const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

    const [newTermForm, setNewTermForm] = useState({ sy: "", sem: "1st Semester" });
    const [auditFilters, setAuditFilters] = useState({ start: "", end: "", user: "", action: "", target: "" });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (pendingSettingsTab) {
            const timer = setTimeout(() => {
                setActiveTab(pendingSettingsTab);
                setPendingSettingsTab(null);
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [pendingSettingsTab, setPendingSettingsTab]);

    const handleProfileSave = (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!activeUser) return;
        pushAudit("UPDATED_OWN_PROFILE", activeUser.userID);
        alert("Profile updated successfully (Mock).");
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

    const handleAddTerm = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!newTermForm.sy) return alert("Please enter a School Year.");
        const semCode = newTermForm.sem === "1st Semester" ? "1" : newTermForm.sem === "2nd Semester" ? "2" : "3";
        const newID = `T${newTermForm.sy.split('-')[0]}-${semCode}`;

        if (terms.some(t => t.termID === newID)) return alert("This term already exists.");

        setIsSaving(true);
        const newTerm: ACADEMIC_TERM = {
            termID: newID,
            termSY: newTermForm.sy,
            termSem: newTermForm.sem as "1st Semester" | "2nd Semester" | "Midyear",
            isCurrent: false
        };

        const { error } = await backendAPI.createTerm(newTerm);

        if (error) {
            alert("Database Error: Could not create term. " + error);
        } else {
            setTerms([...terms, newTerm]);
            pushAudit("CREATED_ACADEMIC_TERM", newID);
            alert("New academic term added successfully.");
            setNewTermForm({ sy: "", sem: "1st Semester" });
        }
        setIsSaving(false);
    };

    const filteredLogs = auditLogs.filter(log => {
        const logDate = new Date(log.timestamp).toISOString().split('T')[0];
        return !(
            (auditFilters.start && logDate < auditFilters.start) ||
            (auditFilters.end && logDate > auditFilters.end) ||
            (auditFilters.user && log.userID !== auditFilters.user) ||
            (auditFilters.action && !log.action.includes(auditFilters.action)) ||
            (auditFilters.target && !log.target.toLowerCase().includes(auditFilters.target.toLowerCase()))
        );
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
                        <button onClick={() => setActiveTab("profile")} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition-colors ${activeTab === "profile" ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-600" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"}`}>
                            <I.UserSearch className="h-4 w-4" /> My Profile
                        </button>
                        {can('manage_records') && (
                            <button onClick={() => setActiveTab("system")} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition-colors ${activeTab === "system" ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-600" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"}`}>
                                <I.Settings className="h-4 w-4" /> Environment
                            </button>
                        )}
                        {can('manage_records') && (
                            <button onClick={() => setActiveTab("audit")} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition-colors ${activeTab === "audit" ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-600" : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"}`}>
                                <I.ShieldAlert className="h-4 w-4" /> Audit Ledger
                            </button>
                        )}
                    </nav>
                </div>

                <div className="flex-1 p-8 overflow-y-auto">
                    {activeTab === "profile" && (
                        <div className="max-w-2xl">
                            <h2 className="mb-6 text-lg font-bold text-slate-800 dark:text-slate-100">Profile Information</h2>
                            <form onSubmit={handleProfileSave} className="flex flex-col gap-5">
                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">First Name</label>
                                        <input type="text" value={activeUser?.userFirstName || ""} onChange={(e) => activeUser && setActiveUser({...activeUser, userFirstName: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2.5 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Last Name</label>
                                        <input type="text" value={activeUser?.userLastName || ""} onChange={(e) => activeUser && setActiveUser({...activeUser, userLastName: e.target.value})} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2.5 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 transition-colors" />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Username handle</label>
                                    <input type="text" value={activeUser?.userName || ""} disabled className="w-full cursor-not-allowed rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-sm text-slate-400 dark:text-slate-500 outline-none" />
                                </div>
                                <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-5">
                                    <button type="submit" className="rounded-lg bg-blue-700 dark:bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 dark:hover:bg-blue-700">Save Profile Details</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {activeTab === "system" && can('manage_records') && (
                        <div className="max-w-2xl">
                            <h2 className="mb-6 text-lg font-bold text-slate-800 dark:text-slate-100">Global Environment Variables</h2>

                            <form onSubmit={handleSystemSave} className="mb-8 flex flex-col gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-5 transition-colors">
                                <label className="mb-1.5 block text-sm font-bold text-slate-800 dark:text-slate-200">Active Academic Term</label>
                                <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Sets the default term context for the Student Evaluator and Reports generation.</p>
                                <select value={activeTerm} onChange={(e) => setActiveTerm(e.target.value)} disabled={isSaving} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-sm font-semibold outline-none focus:border-blue-700 dark:focus:border-blue-500 disabled:opacity-50 transition-colors">
                                    {terms.map(t => (
                                        <option key={t.termID} value={t.termID}>{t.termSem}, AY {t.termSY} {t.isCurrent ? "(Current)" : ""}</option>
                                    ))}
                                </select>
                                <div className="mt-2 text-right">
                                    <button type="submit" disabled={isSaving} className="rounded-lg bg-slate-800 dark:bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-700 dark:hover:bg-blue-500 disabled:opacity-50">Set Active Term</button>
                                </div>
                            </form>

                            <form onSubmit={handleAddTerm} className="flex flex-col gap-4 rounded-xl border border-blue-100 dark:border-blue-900 bg-white dark:bg-slate-800 p-5 shadow-sm transition-colors">
                                <label className="mb-1.5 block text-sm font-bold text-blue-800 dark:text-blue-400">Create New Academic Term</label>
                                <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Initialize a new academic semester for the system. This action is permanent.</p>
                                <div className="flex gap-4">
                                    <input required placeholder="School Year (e.g. 2026-2027)" value={newTermForm.sy} onChange={e => setNewTermForm({...newTermForm, sy: e.target.value})} disabled={isSaving} className="w-1/2 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 disabled:opacity-50 transition-colors" />
                                    <select required value={newTermForm.sem} onChange={e => setNewTermForm({...newTermForm, sem: e.target.value})} disabled={isSaving} className="w-1/2 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent dark:bg-slate-900 p-2 text-sm outline-none focus:border-blue-700 dark:focus:border-blue-500 disabled:opacity-50 transition-colors">
                                        <option>1st Semester</option><option>2nd Semester</option><option>Midyear</option>
                                    </select>
                                </div>
                                <div className="mt-2 text-right">
                                    <button type="submit" disabled={isSaving} className="rounded-lg bg-blue-700 dark:bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 dark:hover:bg-blue-700 disabled:opacity-50">Register Term</button>
                                </div>
                            </form>
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

                            {/* FIXED: Audit table is now strictly limited in height and supports vertical scrolling */}
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-colors flex flex-col overflow-hidden">
                                <div className="max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                                        <thead className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-500 dark:text-slate-400 shadow-sm">
                                        <tr>
                                            <th className="px-5 py-3 font-semibold">Timestamp</th>
                                            <th className="px-5 py-3 font-semibold">User ID</th>
                                            <th className="px-5 py-3 font-semibold">Action Executed</th>
                                            <th className="px-5 py-3 font-semibold text-right">Target Document</th>
                                        </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {filteredLogs.map(log => (
                                            <tr key={log.logID} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                <td className="px-5 py-3 font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                                                <td className="px-5 py-3 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{log.userID}</td>
                                                <td className="px-5 py-3"><span className="rounded bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:text-blue-400">{log.action.replace(/_/g, ' ')}</span></td>
                                                <td className="px-5 py-3 text-right font-mono text-xs">{log.target}</td>
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