// src/components/icons.tsx
export type IconProps = { className?: string }

const base = (className?: string) => ({
    className, width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
})

export const Menu = ({ className }: IconProps) => <svg {...base(className)}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
export const Bell = ({ className }: IconProps) => <svg {...base(className)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
export const ChevronDown = ({ className }: IconProps) => <svg {...base(className)}><path d="m6 9 6 6 6-6" /></svg>
export const ChevronRight = ({ className }: IconProps) => <svg {...base(className)}><path d="m9 18 6-6-6-6" /></svg>
export const Grid = ({ className }: IconProps) => <svg {...base(className)}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
export const UserSearch = ({ className }: IconProps) => <svg {...base(className)}><circle cx="10" cy="8" r="4" /><path d="M3 20a7 7 0 0 1 11-5.7" /><circle cx="17" cy="17" r="3" /><path d="m21 21-1.5-1.5" /></svg>
export const Book = ({ className }: IconProps) => <svg {...base(className)}><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" /></svg>
export const FileChart = ({ className }: IconProps) => <svg {...base(className)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 18v-3M12 18v-6M16 18v-2" /></svg>
export const Settings = ({ className }: IconProps) => <svg {...base(className)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15H4.4a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.7l-.1-.1A2 2 0 1 1 8.4 5.4l.1.1a1.6 1.6 0 0 0 1.8.3H10.4A1.6 1.6 0 0 0 11.5 4.4V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10.4a1.6 1.6 0 0 0 1.1 1.1h.2a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.1.5z" /></svg>
export const Warning = ({ className }: IconProps) => <svg {...base(className)}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
export const Printer = ({ className }: IconProps) => <svg {...base(className)}><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /></svg>
export const Plus = ({ className }: IconProps) => <svg {...base(className)}><path d="M12 5v14M5 12h14" /></svg>
export const Search = ({ className }: IconProps) => <svg {...base(className)}><circle cx="11" cy="11" r="7" /><path d="m21 21-3.5-3.5" /></svg>
export const X = ({ className }: IconProps) => <svg {...base(className)}><path d="M18 6 6 18M6 6l12 12" /></svg>
export const Edit2 = ({ className }: IconProps) => <svg {...base(className)}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
export const ShieldAlert = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>
);

export const Users = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
);

export const Activity = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
);

export function Sun(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
    );
}

export function Moon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
    );
}