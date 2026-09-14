import { App, Notice, TFile, TFolder, normalizePath, stringifyYaml } from "obsidian";
import { Contact, EmploymentType, InterviewRound, InterviewRoundType, JobApplication, JobApplicationFrontMatter, JobStatus, StatusHistoryEntry, WorkplaceType, isFinalStatus } from "../types";
import JobApplicationTrackerPlugin from "../main";

/**
 * Validates and sanitizes a URL, allowing only http: and https: protocols.
 * Returns empty string if the URL is invalid or uses a disallowed protocol (e.g. javascript:).
 */
export function sanitizeUrl(url?: string | null): string {
	if (!url) return "";
	const trimmed = url.trim();
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return trimmed;
		}
	} catch {
		// Not a valid URL
	}
	return "";
}

/**
 * Validates an email address. Returns empty string if invalid or dangerous.
 */
export function sanitizeEmail(email?: string | null): string {
	if (!email) return "";
	const trimmed = email.trim();
	if (/^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/.test(trimmed)) {
		return trimmed;
	}
	return "";
}

/**
 * Escapes characters that have markdown syntax significance to avoid unintentional formatting injection.
 */
export function escapeMarkdown(text?: string | null, preserveNewlines = false): string {
	if (!text) return "";
	let s = text;
	if (!preserveNewlines) {
		s = s.replace(/[\r\n]+/g, " ");
	}
	return s
		.replace(/\\/g, "\\\\")
		.replace(/\[/g, "\\[")
		.replace(/\]/g, "\\]")
		.replace(/\(/g, "\\(")
		.replace(/\)/g, "\\)")
		.replace(/#/g, "\\#")
		.replace(/\*/g, "\\*")
		.replace(/_/g, "\\_")
		.replace(/\|/g, "\\|")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

export class ApplicationService {
	private readonly app: App;
	private readonly plugin: JobApplicationTrackerPlugin;
	private fileLocks = new Map<string, Promise<void>>();
	private cachedApplications: JobApplication[] | null = null;

	invalidateCache(): void {
		this.cachedApplications = null;
	}

	private applyFrontMatterFields(fm: JobApplicationFrontMatter, fields: Partial<JobApplication>): void {
		if (fields.company !== undefined) fm.company = fields.company;
		if (fields.role !== undefined) fm.role = fields.role;
		if (fields.status !== undefined) fm.status = fields.status;
		if (fields.location !== undefined) fm.location = fields.location;
		if (fields.workplaceType !== undefined) fm.workplaceType = fields.workplaceType;
		if (fields.employmentType !== undefined) fm.employmentType = fields.employmentType;
		if (fields.salary !== undefined) fm.salary = fields.salary;
		if (fields.jobUrl !== undefined) fm.jobUrl = fields.jobUrl;
		if (fields.source !== undefined) fm.source = fields.source;
		if (fields.followUpDate !== undefined) fm.followUpDate = fields.followUpDate;
		if (fields.dateApplied !== undefined) fm.dateApplied = fields.dateApplied;
		if (fields.jobDescriptionFile !== undefined) fm.jobDescriptionFile = fields.jobDescriptionFile;
		if (fields.contacts !== undefined) fm.contacts = fields.contacts;
		if (fields.interviews !== undefined) fm.interviews = fields.interviews;
	}

	constructor(app: App, plugin: JobApplicationTrackerPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * Executes an asynchronous operation exclusively for a given file path.
	 * Concurrent operations on the same file are queued sequentially to prevent race conditions.
	 */
	async runWithFileLock<T>(file: TFile, op: () => Promise<T>): Promise<T> {
		const key = file.path;
		const prev = this.fileLocks.get(key) || Promise.resolve();
		let releaseLock: () => void;
		const next = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const lockPromise = prev.then(
			() => next,
			() => next
		);
		this.fileLocks.set(key, lockPromise);

		try {
			await prev;
			return await op();
		} finally {
			releaseLock!();
			if (this.fileLocks.get(key) === lockPromise) {
				this.fileLocks.delete(key);
			}
		}
	}

	/**
	 * Resolves a file path or wikilink to a TFile in the vault.
	 */
	resolveFile(pathOrLink: string): TFile | null {
		if (!pathOrLink) return null;
		const normalized = normalizePath(pathOrLink);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (file instanceof TFile) {
			return file;
		}
		return this.app.metadataCache.getFirstLinkpathDest(pathOrLink, "");
	}

	/**
	 * Resolves a file path to a TFile and executes the provided action.
	 * Displays user feedback if the file cannot be found.
	 */
	async withFile<T>(
		pathOrLink: string,
		action: (file: TFile) => Promise<T> | T,
		errorMessage = "Application file could not be found. It may have been moved or deleted."
	): Promise<T | null> {
		const file = this.resolveFile(pathOrLink);
		if (file instanceof TFile) {
			return await action(file);
		}
		new Notice(errorMessage);
		return null;
	}

	/**
	 * Ensure that a folder exists in the vault, creating parent directories if needed.
	 */
	async ensureFolder(folderPath: string): Promise<TFolder> {
		const normalized = normalizePath(folderPath.trim());
		if (!normalized || normalized === "/" || normalized === ".") {
			return this.app.vault.getRoot();
		}

		const abstractItem = this.app.vault.getAbstractFileByPath(normalized);
		if (abstractItem instanceof TFolder) {
			return abstractItem;
		}
		if (abstractItem instanceof TFile) {
			throw new Error(`Path "${normalized}" is an existing file, not a folder.`);
		}

		// Ensure parent folder exists first
		const parentPath = normalized.substring(0, normalized.lastIndexOf("/"));
		if (parentPath) {
			await this.ensureFolder(parentPath);
		}

		try {
			return await this.app.vault.createFolder(normalized);
		} catch (err) {
			const checkAgain = this.app.vault.getAbstractFileByPath(normalized);
			if (checkAgain instanceof TFolder) {
				return checkAgain;
			}
			throw err;
		}
	}

	/**
	 * Sanitizes a string so it can safely be used as a markdown filename in Obsidian.
	 */
	sanitizeFileName(name: string): string {
		return name
			.replace(/[\\/:*?"<>|#^[\]]/g, "-")
			.replace(/\s+/g, " ")
			.trim();
	}

	/**
	 * Formats today's date in YYYY-MM-DD format.
	 */
	getTodayDateString(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	/**
	 * Inserts an entry into the Notes & Activity Log section, or appends the section at the end of the note if missing.
	 */
	appendActivityLogEntry(content: string, entry: string): string {
		const logHeaderRegex = /(?:^|\n)(#{1,6}\s+(?:📝\s*)?Notes\s*(?:&|and)?\s*Activity Log)/i;
		const match = content.match(logHeaderRegex);
		if (match && match[1]) {
			return content.replace(logHeaderRegex, (fullMatch, header) => {
				const prefix = fullMatch.startsWith("\n") ? "\n" : "";
				return `${prefix}${header}\n- ${entry}`;
			});
		}
		return `${content.trimEnd()}\n\n## 📝 Notes & Activity Log\n- ${entry}\n`;
	}

	/**
	 * Formats a contact into a safe markdown list line.
	 */
	formatContactLine(contact: Contact): string {
		const safeName = escapeMarkdown(contact.name);
		const safeRole = escapeMarkdown(contact.role);
		let line = `- **${safeName}** (${safeRole})`;
		const safeEmail = sanitizeEmail(contact.email);
		if (safeEmail) {
			line += ` - [${escapeMarkdown(contact.email)}](mailto:${safeEmail})`;
		} else if (contact.email) {
			line += ` - ${escapeMarkdown(contact.email)}`;
		}
		if (contact.phone) line += ` - ${escapeMarkdown(contact.phone)}`;
		const safeLinkedin = sanitizeUrl(contact.linkedin);
		if (safeLinkedin) {
			line += ` - [LinkedIn](${safeLinkedin})`;
		} else if (contact.linkedin) {
			line += ` - ${escapeMarkdown(contact.linkedin)}`;
		}
		if (contact.notes) line += `\n  - *Notes:* ${escapeMarkdown(contact.notes, true)}`;
		return line;
	}

	/**
	 * Formats an interview round into a safe markdown list line.
	 */
	formatInterviewLine(interview: InterviewRound): string {
		const prepLink = interview.prepNotePath ? ` - [[${interview.prepNotePath}|Prep Note]]` : "";
		const safeRound = escapeMarkdown(interview.roundName);
		const safeStatus = escapeMarkdown(interview.status);
		const safeDate = escapeMarkdown(interview.date || "TBD");
		const safeTime = interview.time ? ` ${escapeMarkdown(interview.time)}` : "";
		return `- **${safeRound}** (${safeStatus}) - ${safeDate}${safeTime}${prepLink}`;
	}

	/**
	 * Saves an attachment file (PDF, MD, etc.) into the attachments folder and returns the created TFile.
	 */
	async saveAttachment(file: File, prefix?: string): Promise<TFile> {
		try {
			const folderPath = this.plugin.settings.attachmentsFolderPath || "Job Applications/Attachments";
			await this.ensureFolder(folderPath);

			const arrayBuffer = await file.arrayBuffer();
			const safeOriginalName = this.sanitizeFileName(file.name);
			const cleanPrefix = prefix ? `${this.sanitizeFileName(prefix)} - ` : "";
			let baseFileName = `${cleanPrefix}${safeOriginalName}`;
			if (baseFileName.length > 180) {
				const extIndex = baseFileName.lastIndexOf(".");
				const ext = extIndex !== -1 ? baseFileName.substring(extIndex) : "";
				baseFileName = baseFileName.substring(0, 180 - ext.length).trim() + ext;
			}

			let filePath = `${normalizePath(folderPath)}/${baseFileName}`;
			let counter = 1;

			while (this.app.vault.getAbstractFileByPath(filePath) != null && counter < 1000) {
				const extIndex = baseFileName.lastIndexOf(".");
				const nameWithoutExt = extIndex !== -1 ? baseFileName.substring(0, extIndex) : baseFileName;
				const ext = extIndex !== -1 ? baseFileName.substring(extIndex) : "";
				filePath = `${normalizePath(folderPath)}/${nameWithoutExt} (${counter})${ext}`;
				counter++;
			}

			return await this.app.vault.createBinary(filePath, arrayBuffer);

		} catch (err) {
			console.error("Job Tracker: Failed to save attachment:", err);
			new Notice(`Failed to save attachment. Check console for details.`);
			throw err;
		}
	}

	/**
	 * Generates markdown body content for a newly created application.
	 */
	generateNoteContent(appData: Partial<JobApplication>): string {
		const today = this.getTodayDateString();
		const company = escapeMarkdown(appData.company) || "Company";
		const role = escapeMarkdown(appData.role) || "Role";

		let body = `# ${company} - ${role}\n\n`;

		body += `## 📋 Overview\n`;
		if (appData.salary) body += `- **Salary / Comp:** ${escapeMarkdown(appData.salary)}\n`;
		if (appData.location) body += `- **Location:** ${escapeMarkdown(appData.location)}\n`;
		if (appData.workplaceType) body += `- **Workplace Model:** ${escapeMarkdown(appData.workplaceType)}\n`;
		if (appData.employmentType) body += `- **Employment Type:** ${escapeMarkdown(appData.employmentType)}\n`;
		if (appData.source) body += `- **Source:** ${escapeMarkdown(appData.source)}\n`;
		if (appData.followUpDate) body += `- **Follow-up / Deadline:** ${escapeMarkdown(appData.followUpDate)}\n`;
		if (appData.jobUrl) {
			const safeJobUrl = sanitizeUrl(appData.jobUrl);
			if (safeJobUrl) {
				body += `- **Job Posting:** [Link](${safeJobUrl})\n`;
			} else {
				body += `- **Job Posting:** ${escapeMarkdown(appData.jobUrl)}\n`;
			}
		}
		body += `- **Applied Date:** ${escapeMarkdown(appData.dateApplied || today)}\n\n`;

		body += `## 👥 Key Contacts\n`;
		if (appData.contacts && appData.contacts.length > 0) {
			for (const c of appData.contacts) {
				body += `${this.formatContactLine(c)}\n`;
			}
		} else {
			body += `*No contacts added yet.*\n`;
		}
		body += `\n`;

		body += `## 📅 Interviews & Stages\n`;
		if (appData.interviews && appData.interviews.length > 0) {
			for (const iv of appData.interviews) {
				body += `${this.formatInterviewLine(iv)}\n`;
			}
		} else {
			body += `*No interviews scheduled yet.*\n`;
		}
		body += `\n`;

		body += `## 📝 Notes & Activity Log\n`;
		if (appData.notes) {
			body += `- **${today}**: ${escapeMarkdown(appData.notes, true)}\n`;
		} else {
			body += `- **${today}**: Application created (Status: ${escapeMarkdown(appData.status || "Applied")})\n`;
		}
		body += `\n`;

		body += `## 📄 Job Description\n`;
		if (appData.jobDescriptionFile) {
			const isPdf = appData.jobDescriptionFile.toLowerCase().endsWith(".pdf");
			const title = isPdf ? "Job Description (PDF)" : "Job Description (Markdown)";
			body += `> [!abstract]- 📎 ${title}\n> ![[${appData.jobDescriptionFile}]]\n\n`;
		}
		if (appData.jobDescription) {
			body += `${appData.jobDescription}\n`;
		} else if (!appData.jobDescriptionFile) {
			body += `*Paste job description or requirements here...*\n`;
		}

		return body;
	}

	/**
	 * Creates a new job application markdown file with frontmatter and structured body.
	 */
	async createApplication(data: {
		company: string;
		role: string;
		status?: JobStatus;
		dateApplied?: string;
		location?: string;
		workplaceType?: WorkplaceType;
		employmentType?: EmploymentType;
		salary?: string;
		jobUrl?: string;
		source?: string;
		followUpDate?: string;
		notes?: string;
		jobDescription?: string;
		jobDescriptionFile?: string;
		contacts?: Contact[];
	}): Promise<TFile> {
		try {
			const folderPath = this.plugin.settings.trackerFolderPath;
			await this.ensureFolder(folderPath);

			const today = this.getTodayDateString();
			const status = data.status || this.plugin.settings.defaultStatus || "Applied";
			const dateApplied = data.dateApplied || today;

			let baseFileName = this.sanitizeFileName(`${data.company} - ${data.role}`);
			if (baseFileName.length > 180) {
				baseFileName = baseFileName.substring(0, 180).trim();
			}
			let filePath = `${normalizePath(folderPath)}/${baseFileName}.md`;
			let counter = 1;

			while (this.app.vault.getAbstractFileByPath(filePath) != null && counter < 1000) {
				filePath = `${normalizePath(folderPath)}/${baseFileName} (${counter}).md`;
				counter++;
			}

			const initialStatusHistory: StatusHistoryEntry[] = [
				{
					status: status,
					date: today,
					note: data.notes || "Application created",
				},
			];

			const frontmatterObj: JobApplicationFrontMatter = {
				type: "job-application",
				company: data.company,
				role: data.role,
				status: status,
				dateApplied: dateApplied,
				lastUpdated: today,
				location: data.location || "",
				workplaceType: data.workplaceType || undefined,
				employmentType: data.employmentType || undefined,
				salary: data.salary || "",
				jobUrl: data.jobUrl || "",
				source: data.source || "",
				followUpDate: data.followUpDate || undefined,
				jobDescriptionFile: data.jobDescriptionFile || "",
				tags: ["job-application"],
				contacts: data.contacts || [],
				interviews: [],
				statusHistory: initialStatusHistory,
			};

			const yamlHeader = `---\n${stringifyYaml(frontmatterObj)}---\n\n`;

			const body = this.generateNoteContent({
				...data,
				status,
				dateApplied,
			});

			const fullContent = `${yamlHeader}${body}`;
			const file = await this.app.vault.create(filePath, fullContent);
			this.invalidateCache();
			new Notice(`Created application: ${data.company} - ${data.role}`);
			return file;

		} catch (err) {
			console.error("Job Tracker: Failed to create application:", err);
			new Notice(`Failed to create application. Check console for details.`);
			throw err;
		}
	}

	/**
	 * Parse a TFile into a typed JobApplication object with runtime validation.
	 */
	getApplicationFromCache(file: TFile): JobApplication | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const rawFrontmatter = cache?.frontmatter;

		if (!rawFrontmatter || typeof rawFrontmatter !== "object") {
			return null;
		}

		// Explicitly ignore interview prep notes and non-application types
		if (rawFrontmatter.type === "interview-prep" || rawFrontmatter.type === "interview") {
			return null;
		}

		// Check if file is in interview notes folder
		const interviewFolder = normalizePath(this.plugin.settings.interviewNotesFolderPath);
		if (file.path.startsWith(interviewFolder + "/") || file.path === interviewFolder) {
			return null;
		}

		const isExplicitApp = rawFrontmatter.type === "job-application";
		const rawCompany = typeof rawFrontmatter.company === "string" ? rawFrontmatter.company.trim() : "";
		const rawRole = typeof rawFrontmatter.role === "string" ? rawFrontmatter.role.trim() : "";
		const rawStatus = typeof rawFrontmatter.status === "string" ? rawFrontmatter.status.trim() : "";
		const hasAppFields = Boolean(rawCompany && (rawRole || rawStatus));

		if (!isExplicitApp && !hasAppFields) {
			return null;
		}

		const baseParts = file.basename.split(" - ");
		const company = rawCompany || (baseParts[0]?.trim() || "Unknown Company");
		const role = rawRole || (baseParts[1]?.trim() || "Unknown Role");
		const status = rawStatus || "Applied";

		const contacts: Contact[] = [];
		if (Array.isArray(rawFrontmatter.contacts)) {
			for (const c of rawFrontmatter.contacts) {
				if (c && typeof c === "object" && typeof (c as Record<string, unknown>).name === "string") {
					const cObj = c as Record<string, unknown>;
					contacts.push({
						id: typeof cObj.id === "string" ? cObj.id : String(Date.now()),
						name: String(cObj.name),
						role: typeof cObj.role === "string" ? cObj.role : "Contact",
						email: typeof cObj.email === "string" ? cObj.email : undefined,
						phone: typeof cObj.phone === "string" ? cObj.phone : undefined,
						linkedin: typeof cObj.linkedin === "string" ? cObj.linkedin : undefined,
						notes: typeof cObj.notes === "string" ? cObj.notes : undefined,
					});
				}
			}
		}

		const interviews: InterviewRound[] = [];
		if (Array.isArray(rawFrontmatter.interviews)) {
			for (const iv of rawFrontmatter.interviews) {
				if (iv && typeof iv === "object" && typeof (iv as Record<string, unknown>).roundName === "string") {
					const ivObj = iv as Record<string, unknown>;
					const rawIvStatus = ivObj.status;
					const ivStatus = rawIvStatus === "Completed" || rawIvStatus === "Cancelled" ? rawIvStatus : "Scheduled";
					interviews.push({
						id: typeof ivObj.id === "string" ? ivObj.id : String(Date.now()),
						roundName: String(ivObj.roundName),
						roundType: (typeof ivObj.roundType === "string" ? ivObj.roundType : "Other") as InterviewRoundType,
						date: typeof ivObj.date === "string" ? ivObj.date : undefined,
						time: typeof ivObj.time === "string" ? ivObj.time : undefined,
						interviewers: typeof ivObj.interviewers === "string" ? ivObj.interviewers : undefined,
						prepNotePath: typeof ivObj.prepNotePath === "string" ? ivObj.prepNotePath : undefined,
						status: ivStatus,
						outcomeNotes: typeof ivObj.outcomeNotes === "string" ? ivObj.outcomeNotes : undefined,
					});
				}
			}
		}

		const statusHistory: StatusHistoryEntry[] = [];
		if (Array.isArray(rawFrontmatter.statusHistory)) {
			for (const sh of rawFrontmatter.statusHistory) {
				if (sh && typeof sh === "object" && typeof (sh as Record<string, unknown>).status === "string") {
					const shObj = sh as Record<string, unknown>;
					statusHistory.push({
						status: String(shObj.status),
						date: typeof shObj.date === "string" ? shObj.date : "",
						note: typeof shObj.note === "string" ? shObj.note : undefined,
					});
				}
			}
		}

		return {
			filePath: file.path,
			company,
			role,
			status,
			dateApplied: typeof rawFrontmatter.dateApplied === "string" ? rawFrontmatter.dateApplied : "",
			lastUpdated: typeof rawFrontmatter.lastUpdated === "string" ? rawFrontmatter.lastUpdated : "",
			location: typeof rawFrontmatter.location === "string" ? rawFrontmatter.location : "",
			workplaceType: typeof rawFrontmatter.workplaceType === "string" ? (rawFrontmatter.workplaceType as WorkplaceType) : undefined,
			employmentType: typeof rawFrontmatter.employmentType === "string" ? (rawFrontmatter.employmentType as EmploymentType) : undefined,
			salary: typeof rawFrontmatter.salary === "string" ? rawFrontmatter.salary : "",
			jobUrl: typeof rawFrontmatter.jobUrl === "string" ? rawFrontmatter.jobUrl : "",
			source: typeof rawFrontmatter.source === "string" ? rawFrontmatter.source : "",
			followUpDate: typeof rawFrontmatter.followUpDate === "string" ? rawFrontmatter.followUpDate : undefined,
			jobDescriptionFile: typeof rawFrontmatter.jobDescriptionFile === "string" ? rawFrontmatter.jobDescriptionFile : "",
			contacts,
			interviews,
			statusHistory,
			tags: Array.isArray(rawFrontmatter.tags) ? rawFrontmatter.tags.map(String) : [],
		};
	}

	/**
	 * Get all job applications in the configured tracker folder. Uses cached list if available.
	 */
	getAllApplications(forceRefresh = false): JobApplication[] {
		if (!forceRefresh && this.cachedApplications !== null) {
			return this.cachedApplications;
		}

		const applications: JobApplication[] = [];
		const folderPrefix = normalizePath(this.plugin.settings.trackerFolderPath);
		const interviewFolderPrefix = normalizePath(this.plugin.settings.interviewNotesFolderPath);

		// Direct scan of configured application folder
		const trackerAbstract = this.app.vault.getAbstractFileByPath(folderPrefix);
		if (trackerAbstract instanceof TFolder) {
			const collectFromFolder = (folder: TFolder) => {
				for (const child of folder.children) {
					if (child instanceof TFile && child.extension === "md") {
						if (!child.path.startsWith(interviewFolderPrefix + "/") && child.path !== interviewFolderPrefix) {
							const appData = this.getApplicationFromCache(child);
							if (appData) applications.push(appData);
						}
					} else if (child instanceof TFolder) {
						if (!child.path.startsWith(interviewFolderPrefix + "/") && child.path !== interviewFolderPrefix) {
							collectFromFolder(child);
						}
					}
				}
			};
			collectFromFolder(trackerAbstract);
		}

		// Sort by last updated / date applied descending
		applications.sort((a, b) => {
			const dateA = a.lastUpdated || a.dateApplied || "";
			const dateB = b.lastUpdated || b.dateApplied || "";
			return dateB.localeCompare(dateA);
		});

		this.cachedApplications = applications;
		return applications;
	}

	/**
	 * Updates the status of an application note, appending to statusHistory and activity log.
	 */
	async updateStatus(file: TFile, newStatus: JobStatus, note?: string): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					const previousStatus = fm.status;
					fm.status = newStatus;
					fm.lastUpdated = today;

					if (!Array.isArray(fm.statusHistory)) {
						fm.statusHistory = [];
					}

					// If previous status was a final status and new status is also a final status,
					// replace the previous final status entry instead of chaining multiple final statuses.
					const isPrevFinal = previousStatus ? isFinalStatus(previousStatus) : false;
					const isNewFinal = isFinalStatus(newStatus);

					if (isPrevFinal && isNewFinal && fm.statusHistory.length > 0) {
						const lastEntry = fm.statusHistory[fm.statusHistory.length - 1];
						if (lastEntry.status && isFinalStatus(lastEntry.status)) {
							lastEntry.status = newStatus;
							lastEntry.date = today;
							lastEntry.note = note || `Final status changed from ${previousStatus || "previous"} to ${newStatus}`;
							return;
						}
					}

					fm.statusHistory.push({
						status: newStatus,
						date: today,
						note: note || `Status updated to ${newStatus}`,
					});
				});

				// If a note was provided, append it to the Notes & Activity Log section in the markdown
				if (note) {
					await this.app.vault.process(file, (content) => {
						return this.appendActivityLogEntry(content, `**${today}** (${escapeMarkdown(newStatus)}): ${escapeMarkdown(note, true)}`);
					});
				}

				this.invalidateCache();
				new Notice(`Updated status to "${newStatus}" for ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to update status:", err);
				new Notice(`Failed to update status. Check console for details.`);
			}
		});
	}

	/**
	 * Comprehensive update of application details and job description attachments.
	 */
	async updateApplicationDetails(
		file: TFile,
		fields: Partial<JobApplication>,
		newJobDescriptionText?: string
	): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					this.applyFrontMatterFields(fm, fields);
					fm.lastUpdated = today;
				});

				// Update Job Description section in note body if updated
				if (fields.jobDescriptionFile !== undefined || newJobDescriptionText !== undefined) {
					await this.app.vault.process(file, (content) => {
						const jdHeader = "## 📄 Job Description";
						let newJdContent = `${jdHeader}\n`;
						if (fields.jobDescriptionFile) {
							const isPdf = fields.jobDescriptionFile.toLowerCase().endsWith(".pdf");
							const title = isPdf ? "Job Description (PDF)" : "Job Description (Markdown)";
							newJdContent += `> [!abstract]- 📎 ${title}\n> ![[${fields.jobDescriptionFile}]]\n\n`;
						}
						if (newJobDescriptionText) {
							newJdContent += `${newJobDescriptionText}\n`;
						} else if (!fields.jobDescriptionFile) {
							newJdContent += `*Paste job description or requirements here...*\n`;
						}

						// Replace the JD section content while preserving any sections that follow
						const jdSectionRegex = /(?:^|\n)(#{1,6}\s+(?:📄\s*)?Job Description)[\s\S]*?(?=\n#{1,6}\s+|$)/i;
						if (jdSectionRegex.test(content)) {
							return content.replace(jdSectionRegex, (fullMatch, header) => {
								const prefix = fullMatch.startsWith("\n") ? "\n" : "";
								return `${prefix}${header}\n${newJdContent.substring(jdHeader.length + 1).trimEnd()}`;
							});
						}
						// Fallback: append Job Description section to end of file
						return `${content.trimEnd()}\n\n${newJdContent.trimEnd()}\n`;
					});
				}

				this.invalidateCache();
				new Notice(`Updated application details for ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to update application details:", err);
				new Notice(`Failed to update application details. Check console for details.`);
			}
		});
	}

	/**
	 * Update general application frontmatter fields.
	 */
	async updateApplicationFields(file: TFile, fields: Partial<JobApplication>): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					this.applyFrontMatterFields(fm, fields);
					fm.lastUpdated = today;
				});
				this.invalidateCache();
			} catch (err) {
				console.error("Job Tracker: Failed to update application fields:", err);
				new Notice(`Failed to update application fields. Check console for details.`);
			}
		});
	}

	/**
	 * Add a contact to an application note and update the markdown body.
	 */
	async addContactToApplication(file: TFile, contact: Contact): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (!Array.isArray(fm.contacts)) {
						fm.contacts = [];
					}
					fm.contacts.push(contact);
					fm.lastUpdated = today;
				});

				// Update ## 👥 Key Contacts section in body
				await this.app.vault.process(file, (content) => {
					const contactLine = this.formatContactLine(contact);

					const contactHeaderRegex = /(?:^|\n)(#{1,6}\s+(?:👥\s*)?Key Contacts)/i;
					if (contactHeaderRegex.test(content)) {
						if (content.includes("*No contacts added yet.*")) {
							return content.replace("*No contacts added yet.*", () => contactLine);
						} else {
							return content.replace(contactHeaderRegex, (fullMatch, header) => {
								const prefix = fullMatch.startsWith("\n") ? "\n" : "";
								return `${prefix}${header}\n${contactLine}`;
							});
						}
					}
					// Fallback: append Key Contacts section to end of file
					return `${content.trimEnd()}\n\n## 👥 Key Contacts\n${contactLine}\n`;
				});

				this.invalidateCache();
				new Notice(`Added contact ${contact.name} to ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to add contact to application:", err);
				new Notice(`Failed to add contact to application. Check console for details.`);
			}
		});
	}

	/**
	 * Creates an interview prep note based on the plugin template.
	 */
	async createInterviewPrepNote(
		appData: JobApplication,
		interview: InterviewRound
	): Promise<TFile> {
		const folderPath = this.plugin.settings.interviewNotesFolderPath;
		await this.ensureFolder(folderPath);

		let baseFileName = this.sanitizeFileName(
			`${appData.company} - ${interview.roundName} - Prep`
		);
		if (baseFileName.length > 180) {
			baseFileName = baseFileName.substring(0, 180).trim();
		}
		let filePath = `${normalizePath(folderPath)}/${baseFileName}.md`;
		let counter = 1;

		while (this.app.vault.getAbstractFileByPath(filePath) != null && counter < 1000) {
			filePath = `${normalizePath(folderPath)}/${baseFileName} (${counter}).md`;
			counter++;
		}

		const appFile = this.resolveFile(appData.filePath);
		const appTitle = appFile instanceof TFile ? appFile.basename : `${appData.company} - ${appData.role}`;

		const template = this.plugin.settings.interviewPrepTemplate || "";
		const replacements: Record<string, string> = {
			"{{company}}": appData.company,
			"{{role}}": appData.role,
			"{{roundName}}": interview.roundName,
			"{{date}}": interview.date || this.getTodayDateString(),
			"{{time}}": interview.time || "TBD",
			"{{interviewers}}": interview.interviewers || "TBD",
			"{{applicationNoteTitle}}": appTitle,
		};
		const renderedContent = template.replace(
			/\{\{(?:company|role|roundName|date|time|interviewers|applicationNoteTitle)\}\}/g,
			(match) => replacements[match] ?? match
		);

		const prepFile = await this.app.vault.create(filePath, renderedContent);
		new Notice(`Created interview prep note: ${prepFile.basename}`);
		return prepFile;
	}

	/**
	 * Add an interview round to an application note, generate prep note if requested, and update markdown.
	 */
	async addInterviewToApplication(
		file: TFile,
		interview: InterviewRound,
		createPrepNote = true,
		autoUpdateStatus = true
	): Promise<{ interview: InterviewRound; prepFile?: TFile }> {
		return await this.runWithFileLock(file, async () => {
			try {
				const appData = this.getApplicationFromCache(file);
				let prepFile: TFile | undefined;

				if (createPrepNote && appData) {
					prepFile = await this.createInterviewPrepNote(appData, interview);
					interview.prepNotePath = prepFile.path;
				}

				const today = this.getTodayDateString();

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (!Array.isArray(fm.interviews)) {
						fm.interviews = [];
					}
					fm.interviews.push(interview);
					fm.lastUpdated = today;

					// Bump status to Interviewing unless already in Interviewing or a later status (e.g. Offer or final)
					const currentStatus = fm.status || "Applied";
					if (autoUpdateStatus && currentStatus !== "Interviewing" && currentStatus !== "Offer" && !isFinalStatus(currentStatus)) {
						fm.status = "Interviewing";
						if (!Array.isArray(fm.statusHistory)) fm.statusHistory = [];
						fm.statusHistory.push({
							status: "Interviewing",
							date: today,
							note: `Scheduled interview: ${interview.roundName}`,
						});
					}
				});

				// Update ## 📅 Interviews & Stages section in body
				await this.app.vault.process(file, (content) => {
					const interviewLine = this.formatInterviewLine(interview);

					const interviewHeaderRegex = /(?:^|\n)(#{1,6}\s+(?:📅\s*)?Interviews\s*(?:&|and)?\s*Stages)/i;
					if (interviewHeaderRegex.test(content)) {
						if (content.includes("*No interviews scheduled yet.*")) {
							return content.replace("*No interviews scheduled yet.*", () => interviewLine);
						} else {
							return content.replace(interviewHeaderRegex, (fullMatch, header) => {
								const prefix = fullMatch.startsWith("\n") ? "\n" : "";
								return `${prefix}${header}\n${interviewLine}`;
							});
						}
					}
					// Fallback: append Interviews & Stages section to end of file
					return `${content.trimEnd()}\n\n## 📅 Interviews & Stages\n${interviewLine}\n`;
				});

				this.invalidateCache();
				new Notice(`Added ${interview.roundName} to ${file.basename}`);
				return { interview, prepFile };

			} catch (err) {
				console.error("Job Tracker: Failed to add interview to application:", err);
				new Notice(`Failed to add interview to application. Check console for details.`);
				throw err;
			}
		});
	}

	/**
	 * Log interview outcome/debrief and update notes.
	 */
	async updateInterviewOutcome(
		file: TFile,
		interviewId: string,
		status: "Completed" | "Cancelled",
		outcomeNotes?: string,
		newJobStatus?: JobStatus
	): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();

				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (Array.isArray(fm.interviews)) {
						const iv = fm.interviews.find((i: InterviewRound) => i.id === interviewId);
						if (iv) {
							iv.status = status;
							if (outcomeNotes) {
								iv.outcomeNotes = outcomeNotes;
							}
						}
					}

					if (newJobStatus) {
						fm.status = newJobStatus;
						if (!Array.isArray(fm.statusHistory)) fm.statusHistory = [];
						fm.statusHistory.push({
							status: newJobStatus,
							date: today,
							note: outcomeNotes || `Interview ${status} -> Moved to ${newJobStatus}`,
						});
					}

					fm.lastUpdated = today;
				});

				if (outcomeNotes) {
					await this.app.vault.process(file, (content) => {
						return this.appendActivityLogEntry(content, `**${today}** (Interview ${escapeMarkdown(status)}): ${escapeMarkdown(outcomeNotes, true)}`);
					});
				}

				this.invalidateCache();
				new Notice(`Logged outcome for interview on ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to update interview outcome:", err);
				new Notice(`Failed to update interview outcome. Check console for details.`);
			}
		});
	}

	/**
	 * Moves an application file to Obsidian trash respecting user deletion preference.
	 */
	async deleteApplication(file: TFile): Promise<void> {
		try {
			const name = file.basename;
			await this.app.fileManager.trashFile(file);
			this.invalidateCache();
			new Notice(`Moved "${name}" to trash.`);

		} catch (err) {
			console.error("Job Tracker: Failed to delete application:", err);
			new Notice(`Failed to delete application. Check console for details.`);
		}
	}

	/**
	 * Synchronizes Key Contacts and Interviews markdown body sections.
	 * Accepts optional pre-fetched data to avoid reading from the (potentially stale) metadata cache
	 * when called immediately after processFrontMatter.
	 */
	async syncNoteBodySections(
		file: TFile,
		freshData?: { contacts?: Contact[]; interviews?: InterviewRound[] }
	): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			await this._syncNoteBodySections(file, freshData);
		});
	}

	private async _syncNoteBodySections(
		file: TFile,
		freshData?: { contacts?: Contact[]; interviews?: InterviewRound[] }
	): Promise<void> {
		let contacts: Contact[];
		let interviews: InterviewRound[];

		if (freshData) {
			contacts = freshData.contacts ?? [];
			interviews = freshData.interviews ?? [];
		} else {
			const appData = this.getApplicationFromCache(file);
			if (!appData) return;
			contacts = appData.contacts ?? [];
			interviews = appData.interviews ?? [];
		}

		await this.app.vault.process(file, (content) => {
			let updated = content;

			// Contacts section
			const contactHeader = "## 👥 Key Contacts";
			let newContactsSection = `${contactHeader}\n`;
			if (contacts.length > 0) {
				for (const c of contacts) {
					newContactsSection += `${this.formatContactLine(c)}\n`;
				}
			} else {
				newContactsSection += `*No contacts added yet.*\n`;
			}

			const contactSectionRegex = /(?:^|\n)(#{1,6}\s+(?:👥\s*)?Key Contacts)[\s\S]*?(?=\n#{1,6}\s+|$)/i;
			if (contactSectionRegex.test(updated)) {
				updated = updated.replace(contactSectionRegex, (fullMatch, header) => {
					const prefix = fullMatch.startsWith("\n") ? "\n" : "";
					return `${prefix}${header}\n${newContactsSection.substring(contactHeader.length + 1).trimEnd()}`;
				});
			} else if (contacts.length > 0) {
				// Fallback: append Key Contacts section if not found
				updated = `${updated.trimEnd()}\n\n${newContactsSection.trimEnd()}\n`;
			}

			// Interviews section
			const interviewHeader = "## 📅 Interviews & Stages";
			let newInterviewsSection = `${interviewHeader}\n`;
			if (interviews.length > 0) {
				for (const iv of interviews) {
					newInterviewsSection += `${this.formatInterviewLine(iv)}\n`;
				}
			} else {
				newInterviewsSection += `*No interviews scheduled yet.*\n`;
			}

			const interviewSectionRegex = /(?:^|\n)(#{1,6}\s+(?:📅\s*)?Interviews\s*(?:&|and)?\s*Stages)[\s\S]*?(?=\n#{1,6}\s+|$)/i;
			if (interviewSectionRegex.test(updated)) {
				updated = updated.replace(interviewSectionRegex, (fullMatch, header) => {
					const prefix = fullMatch.startsWith("\n") ? "\n" : "";
					return `${prefix}${header}\n${newInterviewsSection.substring(interviewHeader.length + 1).trimEnd()}`;
				});
			} else if (interviews.length > 0) {
				// Fallback: append Interviews & Stages section if not found
				updated = `${updated.trimEnd()}\n\n${newInterviewsSection.trimEnd()}\n`;
			}

			return updated;
		});
	}

	/**
	 * Updates an existing contact and syncs markdown note body.
	 */
	async updateContact(file: TFile, contactId: string, updated: Partial<Contact>): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();
				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];
				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (Array.isArray(fm.contacts)) {
						const idx = fm.contacts.findIndex((c: Contact) => c.id === contactId);
						if (idx !== -1) {
							fm.contacts[idx] = { ...fm.contacts[idx], ...updated };
						}
					}
					fm.lastUpdated = today;
					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});
				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
				this.invalidateCache();
				new Notice(`Updated contact on ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to update contact:", err);
				new Notice(`Failed to update contact. Check console for details.`);
			}
		});
	}

	/**
	 * Deletes a contact from frontmatter and note body.
	 */
	async deleteContact(file: TFile, contactId: string): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();
				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];
				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (Array.isArray(fm.contacts)) {
						fm.contacts = fm.contacts.filter((c: Contact) => c.id !== contactId);
					}
					fm.lastUpdated = today;
					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});
				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
				this.invalidateCache();
				new Notice(`Removed contact from ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to delete contact:", err);
				new Notice(`Failed to delete contact. Check console for details.`);
			}
		});
	}

	/**
	 * Updates an interview round and syncs markdown note body.
	 */
	async updateInterview(file: TFile, interviewId: string, updated: Partial<InterviewRound>): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();
				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];
				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (Array.isArray(fm.interviews)) {
						const idx = fm.interviews.findIndex((i: InterviewRound) => i.id === interviewId);
						if (idx !== -1) {
							fm.interviews[idx] = { ...fm.interviews[idx], ...updated };
						}
					}
					fm.lastUpdated = today;
					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});
				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
				this.invalidateCache();
				new Notice(`Updated interview round on ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to update interview:", err);
				new Notice(`Failed to update interview. Check console for details.`);
			}
		});
	}

	/**
	 * Deletes an interview round from frontmatter and note body.
	 */
	async deleteInterview(file: TFile, interviewId: string): Promise<void> {
		return await this.runWithFileLock(file, async () => {
			try {
				const today = this.getTodayDateString();
				let freshContacts: Contact[] = [];
				let freshInterviews: InterviewRound[] = [];
				await this.app.fileManager.processFrontMatter(file, (fm: JobApplicationFrontMatter) => {
					if (Array.isArray(fm.interviews)) {
						fm.interviews = fm.interviews.filter((i: InterviewRound) => i.id !== interviewId);
					}
					fm.lastUpdated = today;
					freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
					freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
				});
				await this._syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
				this.invalidateCache();
				new Notice(`Removed interview round from ${file.basename}`);

			} catch (err) {
				console.error("Job Tracker: Failed to delete interview:", err);
				new Notice(`Failed to delete interview. Check console for details.`);
			}
		});
	}
}

