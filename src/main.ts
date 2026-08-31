import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { JobApplicationTrackerSettings, JobApplication } from "./types";
import { DEFAULT_SETTINGS, VIEW_TYPE_JOB_TRACKER } from "./constants";
import { ApplicationService } from "./services/ApplicationService";
import { JobApplicationTrackerSettingTab } from "./settings/SettingsTab";
import { NewApplicationModal } from "./modals/NewApplicationModal";
import { UpdateStatusModal, SelectApplicationModal } from "./modals/UpdateStatusModal";
import { AddContactModal } from "./modals/AddContactModal";
import { AddInterviewModal } from "./modals/AddInterviewModal";
import { LogInterviewOutcomeModal } from "./modals/LogInterviewOutcomeModal";
import { EditApplicationModal } from "./modals/EditApplicationModal";
import { ManageApplicationModal } from "./modals/ManageApplicationModal";
import { ConfirmDeleteModal } from "./modals/ConfirmDeleteModal";
import { JobTrackerView } from "./views/JobTrackerView";

export default class JobApplicationTrackerPlugin extends Plugin {
	declare settings: JobApplicationTrackerSettings;
	appService!: ApplicationService;

	async onload() {
		await this.loadSettings();

		this.appService = new ApplicationService(this.app, this);

		// Register custom Job Tracker View
		this.registerView(
			VIEW_TYPE_JOB_TRACKER,
			(leaf) => new JobTrackerView(leaf, this)
		);

		// Ribbon icon: Opens the Job Application Tracker dashboard
		this.addRibbonIcon("briefcase", "Job Application Tracker", () => {
			void this.activateView();
		});

		// Command: Open Job Application Tracker view (default location)
		this.addCommand({
			id: "open-job-tracker-view",
			name: "Open tracker dashboard (Kanban / Table / List / Metrics)",
			callback: () => {
				void this.activateView();
			},
		});

		// Command: Open Job Application Tracker in Main Tab
		this.addCommand({
			id: "open-job-tracker-main-tab",
			name: "Open tracker dashboard in Main Center Tab",
			callback: () => {
				void this.activateView("tab");
			},
		});

		// Command: Open Job Application Tracker in Sidebar
		this.addCommand({
			id: "open-job-tracker-sidebar",
			name: "Open tracker dashboard in Sidebar",
			callback: () => {
				void this.activateView("right-sidebar");
			},
		});

		// Command: Add new job application
		this.addCommand({
			id: "add-job-application",
			name: "Add new job application",
			callback: () => {
				new NewApplicationModal(this.app, this).open();
			},
		});

		// Command: Edit application details & attachments
		this.addCommand({
			id: "edit-job-application",
			name: "Edit application details & attachments",
			callback: () => {
				const activeApp = this.getActiveApplication();
				new EditApplicationModal(this.app, this, activeApp).open();
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

		// Command: Manage application contacts & interviews
		this.addCommand({
			id: "manage-job-application",
			name: "Manage application (Contacts, Interviews & Details)",
			callback: () => {
				const activeApp = this.getActiveApplication();
				new ManageApplicationModal(this.app, this, activeApp).open();
			},
		});

		// Command: Delete application
		this.addCommand({
			id: "delete-job-application",
			name: "Delete application note",
			callback: () => {
				const activeApp = this.getActiveApplication();
				if (!activeApp) {
					new SelectApplicationModal(this.app, this, (selectedApp) => {
						new ConfirmDeleteModal(
							this.app,
							`Delete ${selectedApp.company}?`,
							`Are you sure you want to delete the application note for "${selectedApp.company} - ${selectedApp.role}"? This will move the file to trash.`,
							"Delete Application",
							async () => {
								const file = this.appService.resolveFile(selectedApp.filePath);
								if (file instanceof TFile) {
									await this.appService.deleteApplication(file);
								}
							}
						).open();
					}).open();
					return;
				}

				new ConfirmDeleteModal(
					this.app,
					`Delete ${activeApp.company}?`,
					`Are you sure you want to delete the application note for "${activeApp.company} - ${activeApp.role}"? This will move the file to trash.`,
					"Delete Application",
					async () => {
						const file = this.appService.resolveFile(activeApp.filePath);
						if (file instanceof TFile) {
							await this.appService.deleteApplication(file);
						}
					}
				).open();
			},
		});

		// Settings tab
		this.addSettingTab(new JobApplicationTrackerSettingTab(this.app, this));
	}

	async activateView(location?: "tab" | "right-sidebar" | "left-sidebar") {
		const { workspace } = this.app;
		const targetLocation = location || this.settings.openViewLocation || "tab";

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_JOB_TRACKER);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			if (targetLocation === "tab") {
				// Open as a full center tab in main workspace
				leaf = workspace.getLeaf("tab");
			} else if (targetLocation === "left-sidebar") {
				leaf = workspace.getLeftLeaf(false);
			} else {
				leaf = workspace.getRightLeaf(false);
			}

			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_JOB_TRACKER, active: true });
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
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

	/**
	 * Checks whether the Job Tracker main view is currently open in the main center workspace section.
	 */
	isTrackerViewOpenInMain(): boolean {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_JOB_TRACKER);
		return leaves.some((leaf) => leaf.getRoot() === this.app.workspace.rootSplit);
	}

	onunload() {}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<JobApplicationTrackerSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
		if (!Array.isArray(this.settings.statuses) || this.settings.statuses.length === 0) {
			this.settings.statuses = [...DEFAULT_SETTINGS.statuses];
		}
		if (!Array.isArray(this.settings.defaultSourceOptions) || this.settings.defaultSourceOptions.length === 0) {
			this.settings.defaultSourceOptions = [...DEFAULT_SETTINGS.defaultSourceOptions];
		}
		if (!this.settings.interviewPrepTemplate) {
			this.settings.interviewPrepTemplate = DEFAULT_SETTINGS.interviewPrepTemplate;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
