import { App, normalizePath, PluginSettingTab, Setting, SettingDefinitionItem, TextAreaComponent } from "obsidian";
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

	private getTemplateDesc(): DocumentFragment {
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
		return templateDesc;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: "group",
				heading: "Folders & Storage",
				items: [
					{
						name: "Applications Folder",
						desc: "Folder in your vault where job application notes will be created and tracked.",
						render: (setting: Setting) => {
							setting.addText((text) =>
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
						},
					},
					{
						name: "Interview Notes Folder",
						desc: "Folder where generated interview prep and debrief notes will be stored.",
						render: (setting: Setting) => {
							setting.addText((text) =>
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
						},
					},
					{
						name: "Attachments Folder",
						desc: "Folder where uploaded job description PDFs and markdown attachments are stored.",
						render: (setting: Setting) => {
							setting.addText((text) =>
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
						},
					},
				],
			},
			{
				type: "group",
				heading: "Display & Pipeline Defaults",
				items: [
					{
						name: "Default View Location",
						desc: "Where to open the Job Application Tracker dashboard when clicking the ribbon icon or command.",
						render: (setting: Setting) => {
							setting.addDropdown((dropdown) => {
								dropdown.addOption("tab", "Main Tab (Center, Recommended for Kanban)");
								dropdown.addOption("right-sidebar", "Right Sidebar");
								dropdown.addOption("left-sidebar", "Left Sidebar");
								dropdown.setValue(this.plugin.settings.openViewLocation || "tab");
								dropdown.onChange(async (value) => {
									this.plugin.settings.openViewLocation = value as "tab" | "right-sidebar" | "left-sidebar";
									await this.plugin.saveSettings();
								});
							});
						},
					},
					{
						name: "Default Initial Status",
						desc: "Default status assigned to newly created applications.",
						render: (setting: Setting) => {
							setting.addDropdown((dropdown) => {
								for (const st of this.plugin.settings.statuses) {
									dropdown.addOption(st, st);
								}
								dropdown.setValue(this.plugin.settings.defaultStatus);
								dropdown.onChange(async (value) => {
									this.plugin.settings.defaultStatus = value as JobStatus;
									await this.plugin.saveSettings();
								});
							});
						},
					},
					{
						name: "Application Sources",
						desc: "Comma-separated list of sources for finding jobs (e.g. LinkedIn, Referral, Indeed).",
						render: (setting: Setting) => {
							setting.addTextArea((text) => {
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
						},
					},
				],
			},
			{
				type: "group",
				heading: "Interview Prep Note Template",
				items: [
					{
						name: "Template Content",
						desc: this.getTemplateDesc(),
						render: (setting: Setting) => {
							let templateTextArea: TextAreaComponent | null = null;
							setting
								.addTextArea((textArea) => {
									templateTextArea = textArea;
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
											if (templateTextArea) {
												templateTextArea.setValue(DEFAULT_INTERVIEW_PREP_TEMPLATE);
											}
										});
								});
						},
					},
				],
			},
		];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const def of this.getSettingDefinitions()) {
			if ("type" in def && def.type === "group" && "items" in def && Array.isArray(def.items)) {
				if ("heading" in def && typeof def.heading === "string") {
					new Setting(containerEl).setName(def.heading).setHeading();
				}
				for (const item of def.items) {
					if ("render" in item && typeof item.render === "function") {
						const setting = new Setting(containerEl);
						if ("name" in item && typeof item.name === "string") {
							setting.setName(item.name);
						}
						if ("desc" in item && item.desc) {
							setting.setDesc(item.desc);
						}
						(item.render as (s: Setting) => void)(setting);
					}
				}
			}
		}
	}
}
