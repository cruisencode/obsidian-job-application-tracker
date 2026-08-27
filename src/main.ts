import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

interface JobApplicationTrackerSettings {
	trackerFolderPath: string;
}

const DEFAULT_SETTINGS: JobApplicationTrackerSettings = {
	trackerFolderPath: "Job Applications",
};

export default class JobApplicationTrackerPlugin extends Plugin {
	settings: JobApplicationTrackerSettings;

	async onload() {
		await this.loadSettings();

		// Ribbon icon to quickly open/create tracker
		this.addRibbonIcon("briefcase", "Job Application Tracker", () => {
			// Placeholder action for opening tracker view / dashboard
		});

		// Command palette entry
		this.addCommand({
			id: "open-job-application-tracker",
			name: "Open tracker",
			callback: () => {
				// Placeholder action
			},
		});

		// Add settings tab
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

class JobApplicationTrackerSettingTab extends PluginSettingTab {
	plugin: JobApplicationTrackerPlugin;

	constructor(app: App, plugin: JobApplicationTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl("h2", { text: "Job Application Tracker Settings" });

		new Setting(containerEl)
			.setName("Applications Folder")
			.setDesc("Folder where job applications and notes will be stored.")
			.addText((text) =>
				text
					.setPlaceholder("Job Applications")
					.setValue(this.plugin.settings.trackerFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.trackerFolderPath = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
