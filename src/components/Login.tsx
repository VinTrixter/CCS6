// src/components/Login.tsx
import React, { useState } from "react";
import { supabase } from '../backend/supabaseClient';
import { useStore } from '../store/store';

// @ts-ignore: Bypassing missing types package for local encryption
import bcrypt from 'bcryptjs';
import * as I from "./icons";

export default function Login() {
    const { setIsAuthenticated, setActiveUser, pushAudit } = useStore();

    const [loginInput, setLoginInput] = useState("");
    const [passwordInput, setPasswordInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMessage("");

        const cleanInput = loginInput.trim();

        // 1. Fetch user by checking BOTH userID and userName columns
        const { data: userData, error: userError } = await supabase
            .from('COMPASS_USER')
            .select('*')
            .or(`userID.eq.${cleanInput},userName.eq.${cleanInput}`)
            .single();

        if (userError || !userData) {
            setErrorMessage("Credentials not found in the system.");
            setIsLoading(false);
            return;
        }

        // 2. Compare the typed password against the bcrypt hash in the database
        const isPasswordMatch = bcrypt.compareSync(passwordInput, userData.userPassword);

        if (!isPasswordMatch) {
            setErrorMessage("Invalid password. Please try again.");
            setIsLoading(false);
            return;
        }

        // 3. Establish Local Session
        setActiveUser(userData);
        setIsAuthenticated(true);
        pushAudit("USER_LOGIN", userData.userID);
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
                <div className="bg-slate-900 p-8 text-center">
                    <div className="mx-auto mb-4 flex items-center justify-center gap-4">
                        <img src="/imgSilliman.png" alt="Silliman University" className="h-16 w-16 object-contain drop-shadow-md" />
                        <img src="/imgCCS.jpg" alt="College of Computer Studies" className="h-16 w-16 rounded-full object-contain drop-shadow-md" />
                    </div>
                    <h1 className="font-display text-2xl font-bold tracking-tight text-white">COMPASS</h1>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-slate-400">Database Authentication</p>
                </div>
                <div className="p-8">
                    <form onSubmit={handleLogin} className="flex flex-col gap-5">
                        {errorMessage && <div className="p-3 text-xs font-bold text-red-600 bg-red-50 rounded-md border border-red-200">{errorMessage}</div>}

                        <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">User ID or Username</label>
                            <div className="relative">
                                <I.UserSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                                <input required type="text" placeholder="e.g. USR-001 or rgomez" value={loginInput} onChange={e => setLoginInput(e.target.value)} disabled={isLoading} className="w-full rounded-lg border border-slate-300 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-700 focus:ring-1 focus:ring-blue-700 disabled:opacity-50" />
                            </div>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Password</label>
                            <div className="relative">
                                <div className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center justify-center text-slate-400">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                </div>
                                <input required type="password" placeholder="••••••••••••" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} disabled={isLoading} className="w-full rounded-lg border border-slate-300 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 disabled:opacity-50" />
                            </div>
                        </div>

                        <button type="submit" disabled={isLoading} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 py-3 text-sm font-bold text-white shadow-md shadow-blue-700/20 transition hover:bg-blue-800 active:scale-[0.98] disabled:opacity-70">
                            {isLoading ? "Authenticating..." : "Establish Secure Session"} <I.ChevronRight className="h-4 w-4" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}