// src/store/store.tsx
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode, Dispatch, SetStateAction } from "react";
import { backendAPI, type EnrichedStudent } from "../backend/api";
import type {
    COMPASS_USER, AUDIT_LOG, DEGREE_PROGRAM, COURSE,
    PROGRAM_COURSE, ACADEMIC_RECORD, ADVISING_REMARK, TERM_STANDING, COURSE_PREREQUISITE, ACADEMIC_TERM
} from "./types";

export type View = "dashboard" | "evaluator" | "curriculum" | "reports" | "settings";

interface CompassState {
    isInitializing: boolean;
    isAuthenticated: boolean;
    activeUser: COMPASS_USER | null;
    activeTerm: string;
    auditLogs: AUDIT_LOG[];
    students: EnrichedStudent[];
    programs: DEGREE_PROGRAM[];
    courses: COURSE[];
    programCourses: PROGRAM_COURSE[];
    records: ACADEMIC_RECORD[];
    remarks: ADVISING_REMARK[];
    standings: TERM_STANDING[];
    terms: ACADEMIC_TERM[];
    coursePrerequisites: COURSE_PREREQUISITE[];

    activeView: View;
    pendingReportFilter: string;
    focusedStudentID: string | null;
    pendingEvaluatorAction: "new" | null;
    isDarkMode: boolean;
    pendingSettingsTab: "profile" | "system" | "audit" | null;
    highlightReviewTable: boolean;

    setIsAuthenticated: Dispatch<SetStateAction<boolean>>;
    setActiveUser: Dispatch<SetStateAction<COMPASS_USER | null>>;
    setStudents: Dispatch<SetStateAction<EnrichedStudent[]>>;
    setPrograms: Dispatch<SetStateAction<DEGREE_PROGRAM[]>>;
    setCourses: Dispatch<SetStateAction<COURSE[]>>;
    setProgramCourses: Dispatch<SetStateAction<PROGRAM_COURSE[]>>;
    setRecords: Dispatch<SetStateAction<ACADEMIC_RECORD[]>>;
    setRemarks: Dispatch<SetStateAction<ADVISING_REMARK[]>>;
    setStandings: Dispatch<SetStateAction<TERM_STANDING[]>>;
    setTerms: Dispatch<SetStateAction<ACADEMIC_TERM[]>>;
    setActiveTerm: Dispatch<SetStateAction<string>>;
    setActiveView: Dispatch<SetStateAction<View>>;
    setPendingReportFilter: Dispatch<SetStateAction<string>>;
    setFocusedStudentID: Dispatch<SetStateAction<string | null>>;
    setPendingEvaluatorAction: Dispatch<SetStateAction<"new" | null>>;
    setIsDarkMode: Dispatch<SetStateAction<boolean>>;
    setPendingSettingsTab: Dispatch<SetStateAction<"profile" | "system" | "audit" | null>>;
    setHighlightReviewTable: Dispatch<SetStateAction<boolean>>;
    pushAudit: (action: string, target: string) => void;
    can: (permission: string) => boolean;
}

const CompassContext = createContext<CompassState | undefined>(undefined);

export const CompassProvider = ({ children }: { children: ReactNode }) => {
    const [isInitializing, setIsInitializing] = useState<boolean>(true);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [activeUser, setActiveUser] = useState<COMPASS_USER | null>(null);
    const [activeTerm, setActiveTerm] = useState<string>("T2025-1");

    const [students, setStudents] = useState<EnrichedStudent[]>([]);
    const [programs, setPrograms] = useState<DEGREE_PROGRAM[]>([]);
    const [courses, setCourses] = useState<COURSE[]>([]);
    const [programCourses, setProgramCourses] = useState<PROGRAM_COURSE[]>([]);
    const [records, setRecords] = useState<ACADEMIC_RECORD[]>([]);
    const [remarks, setRemarks] = useState<ADVISING_REMARK[]>([]);
    const [standings, setStandings] = useState<TERM_STANDING[]>([]);
    const [terms, setTerms] = useState<ACADEMIC_TERM[]>([]);
    const [coursePrerequisites, setCoursePrerequisites] = useState<COURSE_PREREQUISITE[]>([]);
    const [auditLogs, setAuditLogs] = useState<AUDIT_LOG[]>([]);

    const [activeView, setActiveView] = useState<View>("dashboard");
    const [pendingReportFilter, setPendingReportFilter] = useState<string>("All Students");
    const [focusedStudentID, setFocusedStudentID] = useState<string | null>(null);
    const [pendingEvaluatorAction, setPendingEvaluatorAction] = useState<"new" | null>(null);
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
    const [pendingSettingsTab, setPendingSettingsTab] = useState<"profile" | "system" | "audit" | null>(null);
    const [highlightReviewTable, setHighlightReviewTable] = useState<boolean>(false);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;

        const loadDatabase = async () => {
            setIsInitializing(true);
            const { data, error } = await backendAPI.fetchInitialSystemData();
            if (data) {
                setStudents(data.students);
                setPrograms(data.programs);
                setCourses(data.courses);
                setProgramCourses(data.programCourses);
                setStandings(data.standings);
                setRemarks(data.remarks);
                setRecords(data.records);
                setTerms(data.terms);
                setCoursePrerequisites(data.coursePrerequisites);
            } else {
                console.error("Database connection failed:", error);
            }
            setIsInitializing(false);
        };

        if (isAuthenticated) {
            void loadDatabase();
        } else {
            timer = setTimeout(() => setIsInitializing(false), 0);
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [isAuthenticated]);

    const pushAudit = (action: string, target: string) => {
        if (!activeUser) return;
        const logID = `LOG-${Date.now()}`;
        const newLog: AUDIT_LOG = { logID, timestamp: new Date().toISOString(), userID: activeUser.userID, action, target };
        setAuditLogs(prev => [newLog, ...prev]);
        void backendAPI.pushAuditLog(logID, activeUser.userID, action, target);
    };

    const can = (permission: string): boolean => {
        if (!activeUser) return false;
        const type = activeUser.userType;
        switch (permission) {
            case 'encode_grades':
            case 'manage_records':
            case 'manage_curriculum':
            case 'generate_forms':
            case 'archive_student':
                return type === 'Deans Office_Staff';
            case 'view_records':
            case 'add_remarks':
                return type === 'Deans Office_Staff' || type === 'Faculty';
            default:
                return false;
        }
    };

    return (
        <CompassContext.Provider value={{
            isInitializing, isAuthenticated, activeUser, activeTerm, auditLogs, students,
            programs, courses, programCourses, records, remarks, standings, terms, coursePrerequisites,
            activeView, pendingReportFilter, focusedStudentID, pendingEvaluatorAction,
            isDarkMode, pendingSettingsTab, highlightReviewTable,
            setIsAuthenticated, setActiveUser, setStudents, setPrograms, setCourses,
            setProgramCourses, setRecords, setRemarks, setStandings, setTerms, setActiveTerm,
            setActiveView, setPendingReportFilter, setFocusedStudentID, setPendingEvaluatorAction,
            setIsDarkMode, setPendingSettingsTab, setHighlightReviewTable, pushAudit, can
        }}>
            {children}
        </CompassContext.Provider>
    );
};

export const useStore = () => {
    const context = useContext(CompassContext);
    if (!context) throw new Error("useStore must be used within a CompassProvider");
    return context;
};