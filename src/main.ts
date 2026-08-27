import { MarkdownView, Plugin, TFile } from "obsidian";
import { JobApplicationTrackerSettings, JobApplication } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import { ApplicationService } from "./services/ApplicationService";
import { JobApplicationTrackerSettingTab } from "./settings/SettingsTab";
import { NewApplicationModal } from "./modals/NewApplicationModal";
import { UpdateStatusModal } from "./modals/UpdateStatusModal";
import { AddContactModal } from "./modals/AddContactModal";
import { AddInterviewModal } from "./modals/AddInterviewModal";
import { LogInterviewOutcomeModal } from "./modals/LogInterviewOutcomeModal";

export default class JobApplicationTrackerPlugin extends Plugin {
	settings: JobApplicationTrackerSettings;
	appService: ApplicationService;

	async onload() {
		await this.loadSettings();

		this.appService = new ApplicationService(this.app, this);

		// Ribbon icon
		this.addRibbonIcon("briefcase", "Job Application Tracker: New Application", () => {
			new NewApplicationModal(this.app, this).open();
		});

		// Command: Add new job application
		this.addCommand({
			id: "add-job-application",
			name: "Add new job application",
			callback: () => {
				new NewApplicationModal(this.app, this).open();
			},
		});

		// Command: Update application status
		this.addCommand({
			id: "update-job-application-status",
			name: "Update application status",
			callback: () => {
				const activeApp = this.getActiveApplication();
				new UpdateStatusModal(this.app, this, activeApp).open();
			},
		});

		// Command: Add contact to application
		this.addCommand({
			id: "add-contact-to-application",
			name: "Add contact to application",
			callback: () => {
				const activeApp = this.getActiveApplication();
				new AddContactModal(this.app, this, activeApp).open();
			},
		});

		// Command: Add interview to application
		this.addCommand({
			id: "add-interview-to-application",
			name: "Add interview to application",
			callback: () => {
				const activeApp = this.getActiveApplication();
				new AddInterviewModal(this.app, this, activeApp).open();
			},
		});

		// Command: Log interview outcome / debrief
		this.addCommand({
			id: "log-interview-outcome",
			name: "Log interview outcome / debrief",
			callback: () => {
				const activeApp = this.getActiveApplication();
				new LogInterviewOutcomeModal(this.app, this, activeApp).open();
			},
		});

		// Settings tab
		this.addSettingTab(new JobApplicationTrackerSettingTab(this.app, this));
	}

	/**
	 * Helper to get the JobApplication object if the currently active file is a tracked application.
	 */
	getActiveApplication(): JobApplication | null {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile instanceof TFile) {
			return this.appService.getApplicationFromCache(activeFile);
		}
		return null;
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
