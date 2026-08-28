import { App, normalizePath, PluginSettingTab, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { JobStatus } from "../types";
import { DEFAULT_INTERVIEW_PREP_TEMPLATE, DEFAULT_SETTINGS } from "../constants";

export class JobApplicationTrackerSettingTab extends PluginSettingTab {
	plugin: JobApplicationTrackerPlugin;

	constructor(app: App, plugin: JobApplicationTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private sanitizeFolderPath(input: string, fallback: string): string {
		const cleaned = input.trim().replace(/[\\:*?"<>|#^[\]]/g, "-");
		const normalized = normalizePath(cleaned);
		return normalized === "." || !normalized ? fallback : normalized;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Storage folders
		new Setting(containerEl).setName("Folders & Storage").setHeading();

		new Setting(containerEl)
			.setName("Applications Folder")
			.setDesc("Folder in your vault where job application notes will be created and tracked.")
			.addText((text) =>
				text
					.setPlaceholder("Job Applications")
					.setValue(this.plugin.settings.trackerFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.trackerFolderPath = this.sanitizeFolderPath(
							value,
							DEFAULT_SETTINGS.trackerFolderPath
						);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Interview Notes Folder")
			.setDesc("Folder where generated interview prep and debrief notes will be stored.")
			.addText((text) =>
				text
					.setPlaceholder("Job Applications/Interviews")
					.setValue(this.plugin.settings.interviewNotesFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.interviewNotesFolderPath = this.sanitizeFolderPath(
							value,
							DEFAULT_SETTINGS.interviewNotesFolderPath
						);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Attachments Folder")
			.setDesc("Folder where uploaded job description PDFs and markdown attachments are stored.")
			.addText((text) =>
				text
					.setPlaceholder("Job Applications/Attachments")
					.setValue(this.plugin.settings.attachmentsFolderPath || "Job Applications/Attachments")
					.onChange(async (value) => {
						this.plugin.settings.attachmentsFolderPath = this.sanitizeFolderPath(
							value,
							DEFAULT_SETTINGS.attachmentsFolderPath
						);
						await this.plugin.saveSettings();
					})
			);

		// Defaults & Display
		new Setting(containerEl).setName("Display & Pipeline Defaults").setHeading();

		new Setting(containerEl)
			.setName("Default View Location")
			.setDesc("Where to open the Job Application Tracker dashboard when clicking the ribbon icon or command.")
			.addDropdown((dropdown) => {
				dropdown.addOption("tab", "Main Tab (Center, Recommended for Kanban)");
				dropdown.addOption("right-sidebar", "Right Sidebar");
				dropdown.addOption("left-sidebar", "Left Sidebar");
				dropdown.setValue(this.plugin.settings.openViewLocation || "tab");
				dropdown.onChange(async (value) => {
					this.plugin.settings.openViewLocation = value as "tab" | "right-sidebar" | "left-sidebar";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default Initial Status")
			.setDesc("Default status assigned to newly created applications.")
			.addDropdown((dropdown) => {
				for (const st of this.plugin.settings.statuses) {
					dropdown.addOption(st, st);
				}
				dropdown.setValue(this.plugin.settings.defaultStatus);
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultStatus = value as JobStatus;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Application Sources")
			.setDesc("Comma-separated list of sources for finding jobs (e.g. LinkedIn, Referral, Indeed).")
			.addTextArea((text) => {
				text
					.setValue(this.plugin.settings.defaultSourceOptions.join(", "))
					.onChange(async (value) => {
						const cleanSources = value
							.split(",")
							.map((s) => s.trim().replace(/[\\#^[\]]/g, ""))
							.filter((s) => s.length > 0);
						this.plugin.settings.defaultSourceOptions =
							cleanSources.length > 0 ? cleanSources : [...DEFAULT_SETTINGS.defaultSourceOptions];
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 2;
			});

		// Interview Prep Template
		new Setting(containerEl).setName("Interview Prep Note Template").setHeading();
		const templateDesc = createFragment();
		templateDesc.append(
			"Template used when creating an Interview Prep note. Supported placeholders:",
			templateDesc.createEl("br"),
			templateDesc.createEl("code", { text: "{{company}}" }),
			", ",
			templateDesc.createEl("code", { text: "{{role}}" }),
			", ",
			templateDesc.createEl("code", { text: "{{roundName}}" }),
			", ",
			templateDesc.createEl("code", { text: "{{date}}" }),
			", ",
			templateDesc.createEl("code", { text: "{{time}}" }),
			", ",
			templateDesc.createEl("code", { text: "{{interviewers}}" }),
			", ",
			templateDesc.createEl("code", { text: "{{applicationNoteTitle}}" })
		);

		new Setting(containerEl)
			.setName("Template Content")
			.setDesc(templateDesc)
			.addTextArea((textArea) => {
				textArea
					.setValue(this.plugin.settings.interviewPrepTemplate)
					.onChange(async (value) => {
						this.plugin.settings.interviewPrepTemplate = value;
						await this.plugin.saveSettings();
					});
				textArea.inputEl.rows = 14;
				textArea.inputEl.addClass("job-tracker-template-textarea");
			})
			.addExtraButton((btn) => {
				btn.setIcon("reset")
					.setTooltip("Reset to default template")
					.onClick(async () => {
						this.plugin.settings.interviewPrepTemplate = DEFAULT_INTERVIEW_PREP_TEMPLATE;
						await this.plugin.saveSettings();
						this.display();
					});
			});
	}
}
