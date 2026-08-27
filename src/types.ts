export type JobStatus =
	| "Wishlist"
	| "Applied"
	| "Screening"
	| "Interviewing"
	| "Offer"
	| "Rejected"
	| "Withdrawn"
	| "Ghosted";

export interface Contact {
	id: string;
	name: string;
	role: string; // e.g. "Recruiter", "Coordinator", "Hiring Manager", "Peer"
	email?: string;
	phone?: string;
	linkedin?: string;
	notes?: string;
}

export type InterviewRoundType =
	| "Recruiter Screen"
	| "Technical Screen"
	| "Hiring Manager"
	| "System Design"
	| "Coding Challenge"
	| "Behavioral"
	| "Onsite / Panel"
	| "Executive / Final"
	| "Other";

export interface InterviewRound {
	id: string;
	roundName: string;
	roundType: InterviewRoundType;
	date?: string; // YYYY-MM-DD
	time?: string; // HH:mm
	interviewers?: string;
	prepNotePath?: string;
	status: "Scheduled" | "Completed" | "Cancelled";
	outcomeNotes?: string;
}

export interface StatusHistoryEntry {
	status: JobStatus;
	date: string; // YYYY-MM-DD
	note?: string;
}

export interface JobApplication {
	filePath: string;
	company: string;
	role: string;
	status: JobStatus;
	dateApplied: string; // YYYY-MM-DD
	lastUpdated: string; // YYYY-MM-DD
	location?: string;
	salary?: string;
	jobUrl?: string;
	source?: string; // e.g. "LinkedIn", "Referral", "Indeed", "Company Site"
	contacts: Contact[];
	interviews: InterviewRound[];
	statusHistory: StatusHistoryEntry[];
	tags: string[];
	notes?: string;
	jobDescription?: string;
	jobDescriptionFile?: string; // Path or name of attached PDF or MD file
}

export interface JobApplicationTrackerSettings {
	trackerFolderPath: string;
	interviewNotesFolderPath: string;
	attachmentsFolderPath: string;
	statuses: JobStatus[];
	defaultStatus: JobStatus;
	interviewPrepTemplate: string;
	defaultSourceOptions: string[];
	openViewLocation: "tab" | "right-sidebar" | "left-sidebar";
}


