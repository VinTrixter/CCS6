// src/components/Shell.tsx
import React, { useState } from "react";
import * as I from "./icons";
import { useStore, type View } from "../store/store";
import { backendAPI } from "../backend/api";

const navItems: { id: View; label: string; icon: React.ElementType }[] = [
    { id: "dashboard", label: "Dashboard", icon: I.Grid },
    { id: "evaluator", label: "Student Manager", icon: I.UserSearch },
    { id: "curriculum", label: "Curriculum Manager", icon: I.Book },
    { id: "reports", label: "Reports & Archives", icon: I.FileChart },
    { id: "settings", label: "System Settings", icon: I.Settings },
];

export function Header() {
    const [bellOpen, setBellOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);

    const { activeUser, activeTerm, setIsAuthenticated, pushAudit, standings, remarks, setActiveView, setPendingSettingsTab, setHighlightReviewTable, terms } = useStore();
    const termDetails = terms.find(t => t.termID === activeTerm);

    const initials = activeUser ? `${activeUser.userFirstName[0] || ""}${activeUser.userLastName[0] || ""}`.toUpperCase() : "??";

    const handleLogout = () => {
        if (activeUser) pushAudit("USER_LOGOUT", activeUser.userID);
        setIsAuthenticated(false);
    };

    const handleProfileRedirect = () => {
        setActiveView("settings");
        setPendingSettingsTab("profile");
        setProfileOpen(false);
    };

    const handleNotificationClick = () => {
        setActiveView("dashboard");
        setHighlightReviewTable(true);
        setBellOpen(false);
    };

    // FIXED: Now utilizes shared centralized logic to perfectly map the bell count
    const manualReviewList = backendAPI.getManualReviewList(standings, remarks, activeTerm, activeUser);
    const flaggedCount = manualReviewList.length;
    const hasUnread = flaggedCount > 0;

    return (
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-5 shadow-sm print:hidden transition-colors">
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <img src="/imgSilliman.png" alt="Silliman University" className="h-9 w-9 object-contain drop-shadow-sm" />
                    <img src="/imgCCS.jpg" alt="College of Computer Studies" className="h-9 w-9 rounded-full object-contain drop-shadow-sm" />
                </div>
                <div className="leading-tight ml-2">
                    <div className="font-display text-lg font-bold tracking-tight text-blue-800 dark:text-blue-400">Silliman University College of Computer Studies</div>
                    <div className="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:block">College On Probation Management, Progression, and Academic Standing System</div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <div className="mr-4 hidden text-right md:block">
                    <div className="font-mono text-xs font-medium text-slate-600 dark:text-slate-300">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">{termDetails?.termSem}, A.Y. {termDetails?.termSY}</div>
                </div>

                <div className="relative">
                    <button
                        onClick={() => { setBellOpen(!bellOpen); setProfileOpen(false); }}
                        className="relative rounded-md p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="System Alerts"
                    >
                        <I.Bell className="h-5 w-5" />
                        {hasUnread && (
                            <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-coral" />
                            </span>
                        )}
                    </button>
                    {bellOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                            <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 shadow-xl shadow-slate-300/40 dark:shadow-black/50">
                                <div className="border-b border-slate-100 dark:border-slate-700 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">System Alerts</div>
                                <div className="flex flex-col">
                                    {hasUnread ? (
                                        <button
                                            onClick={handleNotificationClick}
                                            className="flex flex-col items-start px-4 py-3 text-left transition hover:bg-coral-tint/30 dark:hover:bg-coral-900/30"
                                        >
                                            <span className="text-sm font-bold text-coral">Action Required: Manual Review</span>
                                            <span className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                                                <span className="font-bold text-slate-800 dark:text-slate-100">{flaggedCount}</span> students are flagged for academic review in the active term. Click to process.
                                            </span>
                                        </button>
                                    ) : (
                                        <div className="px-4 py-5 text-center text-sm text-slate-500">
                                            No new flags or reviews pending at this time.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="relative">
                    <button onClick={() => { setProfileOpen(!profileOpen); setBellOpen(false); }} className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition ${profileOpen ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-800 text-xs font-bold text-white">{initials}</span>
                        <span className="hidden text-sm font-medium text-slate-700 dark:text-slate-200 lg:block">{activeUser?.userFirstName} {activeUser?.userLastName}</span>
                        <I.ChevronDown className="h-4 w-4 text-slate-400" />
                    </button>
                    {profileOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 py-1 shadow-xl shadow-slate-300/40 dark:shadow-black/50">
                                <div className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Account Options</div>
                                <button onClick={handleProfileRedirect} className="relative z-10 w-full px-4 py-2 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">My Profile</button>
                                <button onClick={handleLogout} className="relative z-10 w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-coral-tint dark:hover:bg-coral-900/30">Secure Logout</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}

export function Sidebar() {
    const { students, activeView, setActiveView } = useStore();

    const activeStudentsCount = students.filter(s => s.accountStatus === 'Active').length;
    const inactiveStudentsCount = students.filter(s => s.accountStatus === 'Inactive' || s.accountStatus === 'Graduated').length;

    return (
        <aside className="hidden w-58 shrink-0 flex-col justify-between border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 md:flex print:hidden transition-colors" style={{ width: 232 }}>
            <div>
                <nav className="flex flex-col gap-1 p-3">
                    {navItems.map((n) => {
                        const isActive = activeView === n.id;
                        return (
                            <button
                                key={n.id}
                                onClick={() => setActiveView(n.id)}
                                className={`group flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-sm font-medium transition ${
                                    isActive ? "border-blue-700 bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-sm" : "border-transparent text-slate-500 dark:text-slate-400 hover:bg-white/70 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                                }`}
                            >
                                <n.icon className={isActive ? "text-blue-700 dark:text-blue-400" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"} />
                                {n.label}
                            </button>
                        );
                    })}
                </nav>
                <div className="mx-3 mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-4 shadow-sm">
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Students</div>
                        <div className="mt-0.5 font-mono text-xl font-bold text-blue-700 dark:text-blue-400">{activeStudentsCount}</div>
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inactive Records</div>
                        <div className="mt-0.5 font-mono text-xl font-bold text-slate-600 dark:text-slate-300">{inactiveStudentsCount}</div>
                    </div>
                </div>
            </div>
        </aside>
    );
}