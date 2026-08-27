import { App, PluginSettingTab, Setting } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { JobStatus } from "../types";
import { DEFAULT_INTERVIEW_PREP_TEMPLATE, DEFAULT_SETTINGS } from "../constants";

export class JobApplicationTrackerSettingTab extends PluginSettingTab {
	plugin: JobApplicationTrackerPlugin;

	constructor(app: App, plugin: JobApplicationTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Job Application Tracker Settings" });

		// Storage folders
		containerEl.createEl("h3", { text: "Folders & Storage" });

		new Setting(containerEl)
			.setName("Applications Folder")
			.setDesc("Folder in your vault where job application notes will be created and tracked.")
			.addText((text) =>
				text
					.setPlaceholder("Job Applications")
					.setValue(this.plugin.settings.trackerFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.trackerFolderPath = value.trim() || DEFAULT_SETTINGS.trackerFolderPath;
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
						this.plugin.settings.interviewNotesFolderPath =
							value.trim() || DEFAULT_SETTINGS.interviewNotesFolderPath;
						await this.plugin.saveSettings();
					})
			);

		// Defaults
		containerEl.createEl("h3", { text: "Defaults & Pipeline" });

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
						this.plugin.settings.defaultSourceOptions = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 2;
			});

		// Interview Prep Template
		containerEl.createEl("h3", { text: "Interview Prep Note Template" });
		const templateDesc = document.createDocumentFragment();
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
