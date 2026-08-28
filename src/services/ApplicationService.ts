import { App, Notice, TFile, TFolder, normalizePath, stringifyYaml } from "obsidian";
import { Contact, FINAL_STATUSES, InterviewRound, JobApplication, JobStatus, StatusHistoryEntry } from "../types";
import JobApplicationTrackerPlugin from "../main";

export class ApplicationService {
	app: App;
	plugin: JobApplicationTrackerPlugin;

	constructor(app: App, plugin: JobApplicationTrackerPlugin) {
		this.app = app;
		this.plugin = plugin;
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
			.replace(/[\\/:*?"<>|#^\[\]]/g, "-")
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
	 * Saves an attachment file (PDF, MD, etc.) into the attachments folder and returns the created TFile.
	 */
	async saveAttachment(file: File, prefix?: string): Promise<TFile> {
		try {
			const folderPath = this.plugin.settings.attachmentsFolderPath || "Job Applications/Attachments";
			await this.ensureFolder(folderPath);

			const arrayBuffer = await file.arrayBuffer();
			const safeOriginalName = this.sanitizeFileName(file.name);
			const cleanPrefix = prefix ? `${this.sanitizeFileName(prefix)} - ` : "";
			const baseFileName = `${cleanPrefix}${safeOriginalName}`;

			let filePath = `${normalizePath(folderPath)}/${baseFileName}`;
			let counter = 1;

			while (this.app.vault.getAbstractFileByPath(filePath) != null) {
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
		const company = appData.company || "Company";
		const role = appData.role || "Role";

		let body = `# ${company} - ${role}\n\n`;

		body += `## 📋 Overview\n`;
		if (appData.salary) body += `- **Salary / Comp:** ${appData.salary}\n`;
		if (appData.location) body += `- **Location:** ${appData.location}\n`;
		if (appData.source) body += `- **Source:** ${appData.source}\n`;
		if (appData.jobUrl) body += `- **Job Posting:** [Link](${appData.jobUrl})\n`;
		body += `- **Applied Date:** ${appData.dateApplied || today}\n\n`;

		body += `## 👥 Key Contacts\n`;
		if (appData.contacts && appData.contacts.length > 0) {
			for (const c of appData.contacts) {
				body += `- **${c.name}** (${c.role})${c.email ? ` - [${c.email}](mailto:${c.email})` : ""}${c.phone ? ` - ${c.phone}` : ""}${c.notes ? `\n  - *Notes:* ${c.notes}` : ""}\n`;
			}
		} else {
			body += `*No contacts added yet.*\n`;
		}
		body += `\n`;

		body += `## 📅 Interviews & Stages\n`;
		if (appData.interviews && appData.interviews.length > 0) {
			for (const iv of appData.interviews) {
				const prepLink = iv.prepNotePath ? ` - [[${iv.prepNotePath}|Prep Note]]` : "";
				body += `- **${iv.roundName}** (${iv.status}) - ${iv.date || "TBD"} ${iv.time || ""}${prepLink}\n`;
			}
		} else {
			body += `*No interviews scheduled yet.*\n`;
		}
		body += `\n`;

		body += `## 📝 Notes & Activity Log\n`;
		if (appData.notes) {
			body += `- **${today}**: ${appData.notes}\n`;
		} else {
			body += `- **${today}**: Application created (Status: ${appData.status || "Applied"})\n`;
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
		salary?: string;
		jobUrl?: string;
		source?: string;
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

			const baseFileName = this.sanitizeFileName(`${data.company} - ${data.role}`);
			let filePath = `${normalizePath(folderPath)}/${baseFileName}.md`;
			let counter = 1;

			while (this.app.vault.getAbstractFileByPath(filePath) != null) {
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

			const frontmatterObj: Record<string, any> = {
				type: "job-application",
				company: data.company,
				role: data.role,
				status: status,
				dateApplied: dateApplied,
				lastUpdated: today,
				location: data.location || "",
				salary: data.salary || "",
				jobUrl: data.jobUrl || "",
				source: data.source || "",
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
			new Notice(`Created application: ${data.company} - ${data.role}`);
			return file;

		} catch (err) {
			console.error("Job Tracker: Failed to create application:", err);
			new Notice(`Failed to create application. Check console for details.`);
			throw err;
		}
	}

	/**
	 * Parse a TFile into a typed JobApplication object.
	 */
	getApplicationFromCache(file: TFile): JobApplication | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		if (!frontmatter) {
			return null;
		}

		// Explicitly ignore interview prep notes and non-application types
		if (frontmatter.type === "interview-prep" || frontmatter.type === "interview") {
			return null;
		}

		// Check if file is in interview notes folder
		const interviewFolder = normalizePath(this.plugin.settings.interviewNotesFolderPath);
		if (file.path.startsWith(interviewFolder + "/") || file.path === interviewFolder) {
			return null;
		}

		// Must either be explicitly marked type: job-application, or have company, role, and status
		const isExplicitApp = frontmatter.type === "job-application";
		const hasAppFields = frontmatter.company && (frontmatter.role || frontmatter.status);

		if (!isExplicitApp && !hasAppFields) {
			return null;
		}

		return {
			filePath: file.path,
			company: frontmatter.company || file.basename.split(" - ")[0] || "Unknown Company",
			role: frontmatter.role || file.basename.split(" - ")[1] || "Unknown Role",
			status: frontmatter.status || "Applied",
			dateApplied: frontmatter.dateApplied || "",
			lastUpdated: frontmatter.lastUpdated || "",
			location: frontmatter.location || "",
			salary: frontmatter.salary || "",
			jobUrl: frontmatter.jobUrl || "",
			source: frontmatter.source || "",
			jobDescriptionFile: frontmatter.jobDescriptionFile || "",
			contacts: Array.isArray(frontmatter.contacts) ? frontmatter.contacts : [],
			interviews: Array.isArray(frontmatter.interviews) ? frontmatter.interviews : [],
			statusHistory: Array.isArray(frontmatter.statusHistory) ? frontmatter.statusHistory : [],
			tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
		};
	}

	/**
	 * Get all job applications in the vault.
	 */
	async getAllApplications(): Promise<JobApplication[]> {
		const files = this.app.vault.getMarkdownFiles();
		const applications: JobApplication[] = [];
		const folderPrefix = normalizePath(this.plugin.settings.trackerFolderPath);
		const interviewFolderPrefix = normalizePath(this.plugin.settings.interviewNotesFolderPath);

		for (const file of files) {
			// Skip interview notes directory
			if (file.path.startsWith(interviewFolderPrefix + "/") || file.path === interviewFolderPrefix) {
				continue;
			}

			const isInFolder = file.path.startsWith(folderPrefix + "/") || file.path === folderPrefix;
			const cache = this.app.metadataCache.getFileCache(file);
			const isJobAppType = cache?.frontmatter?.type === "job-application";

			if (isInFolder || isJobAppType) {
				const appData = this.getApplicationFromCache(file);
				if (appData) {
					applications.push(appData);
				}
			}
		}

		// Sort by last updated / date applied descending
		return applications.sort((a, b) => {
			const dateA = a.lastUpdated || a.dateApplied || "";
			const dateB = b.lastUpdated || b.dateApplied || "";
			return dateB.localeCompare(dateA);
		});
	}

	/**
	 * Updates the status of an application note, appending to statusHistory and activity log.
	 */
	async updateStatus(file: TFile, newStatus: JobStatus, note?: string): Promise<void> {
		try {
			const today = this.getTodayDateString();

			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const previousStatus = fm.status as JobStatus;
				fm.status = newStatus;
				fm.lastUpdated = today;

				if (!Array.isArray(fm.statusHistory)) {
					fm.statusHistory = [];
				}

				// If previous status was a final status and new status is also a final status,
				// replace the previous final status entry instead of chaining multiple final statuses.
				const isPrevFinal = FINAL_STATUSES.includes(previousStatus);
				const isNewFinal = FINAL_STATUSES.includes(newStatus);

				if (isPrevFinal && isNewFinal && fm.statusHistory.length > 0) {
					const lastEntry = fm.statusHistory[fm.statusHistory.length - 1];
					if (FINAL_STATUSES.includes(lastEntry.status)) {
						lastEntry.status = newStatus;
						lastEntry.date = today;
						lastEntry.note = note || `Final status changed from ${previousStatus} to ${newStatus}`;
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
					const logHeader = "## 📝 Notes & Activity Log";
					if (content.includes(logHeader)) {
						const insertion = `\n- **${today}** (${newStatus}): ${note}`;
						return content.replace(logHeader, () => `${logHeader}${insertion}`);
					}
					return content;
				});
			}

			new Notice(`Updated status to "${newStatus}" for ${file.basename}`);

		} catch (err) {
			console.error("Job Tracker: Failed to update status:", err);
			new Notice(`Failed to update status. Check console for details.`);
		}
	}

	/**
	 * Comprehensive update of application details and job description attachments.
	 */
	async updateApplicationDetails(
		file: TFile,
		fields: Partial<JobApplication>,
		newJobDescriptionText?: string
	): Promise<void> {
		try {
			const today = this.getTodayDateString();

			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (fields.company !== undefined) fm.company = fields.company;
				if (fields.role !== undefined) fm.role = fields.role;
				if (fields.status !== undefined) fm.status = fields.status;
				if (fields.location !== undefined) fm.location = fields.location;
				if (fields.salary !== undefined) fm.salary = fields.salary;
				if (fields.jobUrl !== undefined) fm.jobUrl = fields.jobUrl;
				if (fields.source !== undefined) fm.source = fields.source;
				if (fields.dateApplied !== undefined) fm.dateApplied = fields.dateApplied;
				if (fields.jobDescriptionFile !== undefined) fm.jobDescriptionFile = fields.jobDescriptionFile;
				fm.lastUpdated = today;
			});

			// Update Job Description section in note body if updated
			if (fields.jobDescriptionFile !== undefined || newJobDescriptionText !== undefined) {
				await this.app.vault.process(file, (content) => {
					const jdHeader = "## 📄 Job Description";
					if (content.includes(jdHeader)) {
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
						const jdSectionRegex = new RegExp(
							`(${jdHeader.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})[\\\\s\\\\S]*?(?=\\\\n## |$)`
						);
						if (jdSectionRegex.test(content)) {
							return content.replace(jdSectionRegex, () => newJdContent.trimEnd());
						}
					}
					return content;
				});
			}

			new Notice(`Updated application details for ${file.basename}`);

		} catch (err) {
			console.error("Job Tracker: Failed to update application details:", err);
			new Notice(`Failed to update application details. Check console for details.`);
		}
	}

	/**
	 * Update general application frontmatter fields.
	 */
	async updateApplicationFields(file: TFile, fields: Partial<JobApplication>): Promise<void> {
		const today = this.getTodayDateString();

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (fields.company !== undefined) fm.company = fields.company;
			if (fields.role !== undefined) fm.role = fields.role;
			if (fields.status !== undefined) fm.status = fields.status;
			if (fields.location !== undefined) fm.location = fields.location;
			if (fields.salary !== undefined) fm.salary = fields.salary;
			if (fields.jobUrl !== undefined) fm.jobUrl = fields.jobUrl;
			if (fields.source !== undefined) fm.source = fields.source;
			if (fields.dateApplied !== undefined) fm.dateApplied = fields.dateApplied;
			if (fields.jobDescriptionFile !== undefined) fm.jobDescriptionFile = fields.jobDescriptionFile;
			if (fields.contacts !== undefined) fm.contacts = fields.contacts;
			if (fields.interviews !== undefined) fm.interviews = fields.interviews;
			fm.lastUpdated = today;
		});
	}

	/**
	 * Add a contact to an application note and update the markdown body.
	 */
	async addContactToApplication(file: TFile, contact: Contact): Promise<void> {
		try {
			const today = this.getTodayDateString();

			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (!Array.isArray(fm.contacts)) {
					fm.contacts = [];
				}
				fm.contacts.push(contact);
				fm.lastUpdated = today;
			});

			// Update ## 👥 Key Contacts section in body
			await this.app.vault.process(file, (content) => {
				const contactHeader = "## 👥 Key Contacts";
				if (content.includes(contactHeader)) {
					let contactLine = `- **${contact.name}** (${contact.role})`;
					if (contact.email) contactLine += ` - [${contact.email}](mailto:${contact.email})`;
					if (contact.phone) contactLine += ` - ${contact.phone}`;
					if (contact.linkedin) contactLine += ` - [LinkedIn](${contact.linkedin})`;
					if (contact.notes) contactLine += `\n  - *Notes:* ${contact.notes}`;

					if (content.includes("*No contacts added yet.*")) {
						return content.replace("*No contacts added yet.*", () => contactLine);
					} else {
						return content.replace(contactHeader, () => `${contactHeader}\n${contactLine}`);
					}
				}
				return content;
			});

			new Notice(`Added contact ${contact.name} to ${file.basename}`);

		} catch (err) {
			console.error("Job Tracker: Failed to add contact to application:", err);
			new Notice(`Failed to add contact to application. Check console for details.`);
		}
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

		const baseFileName = this.sanitizeFileName(
			`${appData.company} - ${interview.roundName} - Prep`
		);
		let filePath = `${normalizePath(folderPath)}/${baseFileName}.md`;
		let counter = 1;

		while (this.app.vault.getAbstractFileByPath(filePath) != null) {
			filePath = `${normalizePath(folderPath)}/${baseFileName} (${counter}).md`;
			counter++;
		}

		const appFile = this.resolveFile(appData.filePath);
		const appTitle = appFile instanceof TFile ? appFile.basename : `${appData.company} - ${appData.role}`;

		let template = this.plugin.settings.interviewPrepTemplate || "";
		template = template
			.replace(/{{company}}/g, appData.company)
			.replace(/{{role}}/g, appData.role)
			.replace(/{{roundName}}/g, interview.roundName)
			.replace(/{{date}}/g, interview.date || this.getTodayDateString())
			.replace(/{{time}}/g, interview.time || "TBD")
			.replace(/{{interviewers}}/g, interview.interviewers || "TBD")
			.replace(/{{applicationNoteTitle}}/g, appTitle);

		const prepFile = await this.app.vault.create(filePath, template);
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
		try {
			const appData = this.getApplicationFromCache(file);
			let prepFile: TFile | undefined;

			if (createPrepNote && appData) {
				prepFile = await this.createInterviewPrepNote(appData, interview);
				interview.prepNotePath = prepFile.path;
			}

			const today = this.getTodayDateString();

			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (!Array.isArray(fm.interviews)) {
					fm.interviews = [];
				}
				fm.interviews.push(interview);
				fm.lastUpdated = today;

				// Bump status to Interviewing unless already in Interviewing or a later status (e.g. Offer)
				const laterOrCurrentStatuses: JobStatus[] = ["Interviewing", "Offer", ...FINAL_STATUSES];
				if (autoUpdateStatus && !laterOrCurrentStatuses.includes(fm.status)) {
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
				const interviewHeader = "## 📅 Interviews & Stages";
				if (content.includes(interviewHeader)) {
					const prepLink = interview.prepNotePath
						? ` - [[${interview.prepNotePath}|Prep Note]]`
						: "";
					const interviewLine = `- **${interview.roundName}** (${interview.status}) - ${interview.date || "TBD"} ${interview.time || ""}${prepLink}`;

					if (content.includes("*No interviews scheduled yet.*")) {
						return content.replace("*No interviews scheduled yet.*", () => interviewLine);
					} else {
						return content.replace(interviewHeader, () => `${interviewHeader}\n${interviewLine}`);
					}
				}
				return content;
			});

			new Notice(`Added ${interview.roundName} to ${file.basename}`);
			return { interview, prepFile };

		} catch (err) {
			console.error("Job Tracker: Failed to add interview to application:", err);
			new Notice(`Failed to add interview to application. Check console for details.`);
			throw err;
		}
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
		try {
			const today = this.getTodayDateString();

			await this.app.fileManager.processFrontMatter(file, (fm) => {
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
					const logHeader = "## 📝 Notes & Activity Log";
					if (content.includes(logHeader)) {
						const insertion = `\n- **${today}** (Interview ${status}): ${outcomeNotes}`;
						return content.replace(logHeader, () => `${logHeader}${insertion}`);
					}
					return content;
				});
			}

			new Notice(`Logged outcome for interview on ${file.basename}`);

		} catch (err) {
			console.error("Job Tracker: Failed to update interview outcome:", err);
			new Notice(`Failed to update interview outcome. Check console for details.`);
		}
	}

	/**
	 * Moves an application file to Obsidian trash.
	 */
	async deleteApplication(file: TFile): Promise<void> {
		try {
			const name = file.basename;
			await this.app.vault.trash(file, true);
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
					newContactsSection += `- **${c.name}** (${c.role})${c.email ? ` - [${c.email}](mailto:${c.email})` : ""}${c.phone ? ` - ${c.phone}` : ""}${c.linkedin ? ` - [LinkedIn](${c.linkedin})` : ""}${c.notes ? `\n  - *Notes:* ${c.notes}` : ""}\n`;
				}
			} else {
				newContactsSection += `*No contacts added yet.*\n`;
			}

			if (updated.includes(contactHeader)) {
				const regex = new RegExp(`${contactHeader}[\\s\\S]*?(?=\\n## |$)`);
				updated = updated.replace(regex, () => newContactsSection.trimEnd());
			}

			// Interviews section
			const interviewHeader = "## 📅 Interviews & Stages";
			let newInterviewsSection = `${interviewHeader}\n`;
			if (interviews.length > 0) {
				for (const iv of interviews) {
					const prepLink = iv.prepNotePath ? ` - [[${iv.prepNotePath}|Prep Note]]` : "";
					newInterviewsSection += `- **${iv.roundName}** (${iv.status}) - ${iv.date || "TBD"} ${iv.time || ""}${prepLink}\n`;
				}
			} else {
				newInterviewsSection += `*No interviews scheduled yet.*\n`;
			}

			if (updated.includes(interviewHeader)) {
				const regex = new RegExp(`${interviewHeader}[\\s\\S]*?(?=\\n## |$)`);
				updated = updated.replace(regex, () => newInterviewsSection.trimEnd());
			}

			return updated;
		});
	}

	/**
	 * Updates an existing contact and syncs markdown note body.
	 */
	async updateContact(file: TFile, contactId: string, updated: Partial<Contact>): Promise<void> {
		try {
			const today = this.getTodayDateString();
			let freshContacts: Contact[] = [];
			let freshInterviews: InterviewRound[] = [];
			await this.app.fileManager.processFrontMatter(file, (fm) => {
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
			await this.syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
			new Notice(`Updated contact on ${file.basename}`);

		} catch (err) {
			console.error("Job Tracker: Failed to update contact:", err);
			new Notice(`Failed to update contact. Check console for details.`);
		}
	}

	/**
	 * Deletes a contact from frontmatter and note body.
	 */
	async deleteContact(file: TFile, contactId: string): Promise<void> {
		try {
			const today = this.getTodayDateString();
			let freshContacts: Contact[] = [];
			let freshInterviews: InterviewRound[] = [];
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (Array.isArray(fm.contacts)) {
					fm.contacts = fm.contacts.filter((c: Contact) => c.id !== contactId);
				}
				fm.lastUpdated = today;
				freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
				freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
			});
			await this.syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
			new Notice(`Removed contact from ${file.basename}`);

		} catch (err) {
			console.error("Job Tracker: Failed to delete contact:", err);
			new Notice(`Failed to delete contact. Check console for details.`);
		}
	}

	/**
	 * Updates an interview round and syncs markdown note body.
	 */
	async updateInterview(file: TFile, interviewId: string, updated: Partial<InterviewRound>): Promise<void> {
		try {
			const today = this.getTodayDateString();
			let freshContacts: Contact[] = [];
			let freshInterviews: InterviewRound[] = [];
			await this.app.fileManager.processFrontMatter(file, (fm) => {
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
			await this.syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
			new Notice(`Updated interview round on ${file.basename}`);

		} catch (err) {
			console.error("Job Tracker: Failed to update interview:", err);
			new Notice(`Failed to update interview. Check console for details.`);
		}
	}

	/**
	 * Deletes an interview round from frontmatter and note body.
	 */
	async deleteInterview(file: TFile, interviewId: string): Promise<void> {
		try {
			const today = this.getTodayDateString();
			let freshContacts: Contact[] = [];
			let freshInterviews: InterviewRound[] = [];
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (Array.isArray(fm.interviews)) {
					fm.interviews = fm.interviews.filter((i: InterviewRound) => i.id !== interviewId);
				}
				fm.lastUpdated = today;
				freshContacts = Array.isArray(fm.contacts) ? [...fm.contacts] : [];
				freshInterviews = Array.isArray(fm.interviews) ? [...fm.interviews] : [];
			});
			await this.syncNoteBodySections(file, { contacts: freshContacts, interviews: freshInterviews });
			new Notice(`Removed interview round from ${file.basename}`);

		} catch (err) {
			console.error("Job Tracker: Failed to delete interview:", err);
			new Notice(`Failed to delete interview. Check console for details.`);
		}
	}
}

