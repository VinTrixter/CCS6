// src/App.tsx
import { useStore, CompassProvider } from "./store/store";
import { Header, Sidebar } from "./components/Shell";
import Dashboard from "./components/Dashboard";
import Evaluator from "./components/Evaluator";
import Curriculum from "./components/Curriculum";
import Reports from "./components/Reports";
import Settings from "./components/Settings";
import Login from "./components/Login";

function AppContent() {
    const { isAuthenticated, activeView, isDarkMode, isInitializing } = useStore();

    // FIXED: isInitializing must be checked FIRST to prevent the app from
    // rendering the Login screen or Dashboard while the network is suspended.
    if (isInitializing) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700"></div>
                    <div className="font-bold text-slate-500 animate-pulse">Connecting to secure COMPASS Database...</div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) return <Login />;

    return (
        <div className={`flex h-screen flex-col font-sans transition-colors duration-300 ${isDarkMode ? "dark bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-800"}`}>
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto">
                    {activeView === "dashboard" && <Dashboard />}
                    {activeView === "evaluator" && <Evaluator />}
                    {activeView === "curriculum" && <Curriculum />}
                    {activeView === "reports" && <Reports />}
                    {activeView === "settings" && <Settings />}
                </main>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <CompassProvider>
            <AppContent />
        </CompassProvider>
    );
}