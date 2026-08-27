import { Plugin } from "obsidian";
import { JobApplicationTrackerSettings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";
import { ApplicationService } from "./services/ApplicationService";
import { JobApplicationTrackerSettingTab } from "./settings/SettingsTab";
import { NewApplicationModal } from "./modals/NewApplicationModal";
import { UpdateStatusModal } from "./modals/UpdateStatusModal";

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

		// Command palette: Add new job application
		this.addCommand({
			id: "add-job-application",
			name: "Add new job application",
			callback: () => {
				new NewApplicationModal(this.app, this).open();
			},
		});

		// Command palette: Update application status
		this.addCommand({
			id: "update-job-application-status",
			name: "Update application status",
			callback: () => {
				new UpdateStatusModal(this.app, this).open();
			},
		});

		// Settings tab
		this.addSettingTab(new JobApplicationTrackerSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
