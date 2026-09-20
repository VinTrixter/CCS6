export interface COMPASS_USER {
    userID: string;
    userName: string;
    userFirstName: string;
    userMiddleName?: string;
    userLastName: string;
    userType: "Faculty" | "Deans Office_Staff";
    userPassword?: string;
}

export interface STUDENT {
    studentID: string;
    studFirstName: string;
    studMiddleName?: string;
    studLastName: string;
    shsTrack: "STEM" | "HUMSS" | "ABM" | "GAS" | "TVL";
    yearLevel: 1 | 2 | 3 | 4;
    accountStatus: "Active" | "Inactive" | "Graduated";
}

export interface STUDENT_PROGRAM {
    studProgID: string;
    programCode: string;
    studentID: string;
}

export interface ACADEMIC_TERM {
    termID: string;
    termSY: string;
    termSem: "1st Semester" | "2nd Semester" | "Midyear";
}

export interface DEGREE_PROGRAM {
    programCode: string;
    programTitle: string;
    curriculumYear: string;
    passingGradeThreshold?: number;
}

export interface COURSE {
    courseCode: string;
    courseTitle: string;
    courseUnits: number;
}

export interface PROGRAM_COURSE {
    programCourseID: string;
    programCode: string;
    courseCode: string;
    majorMinorClassif: "Major" | "Minor";
    isCQPAIncluded: boolean;
    yearLevel: number;
    termSem: "1st Semester" | "2nd Semester" | "Midyear";
}

export interface COURSE_PREREQUISITE {
    prereqID: string;
    programCourseID: string;
    prereqProgramCourseID: string;
}

export interface ACADEMIC_RECORD {
    recordID: string;
    finalGrade: number | null;
    isFailed: boolean;
    dateEncoded: string;
    programCourseID: string;
    termID: string;
    studentID: string;
    userID: string;
    gradeRemarks?: string;
}

export interface TERM_STANDING {
    standingID: string;
    semCQPA: number;
    runningCQPA?: number;
    termAcademicStatus: "Regular" | "On-Probation" | "Advised to Shift";
    isConsecutiveOP: boolean;
    studentID: string;
    termID: string;
}

export interface ADVISING_REMARK {
    remarkID: string;
    content: string;
    timestamp: string;
    userID: string;
    standingID: string;
    category?: string;
}

export interface AUDIT_LOG {
    logID: string;
    timestamp: string;
    userID: string;
    action: string;
    target: string;
}