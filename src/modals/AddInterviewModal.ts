import { App, Modal, Setting, TFile } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { InterviewRound, InterviewRoundType, JobApplication } from "../types";
import { SelectApplicationModal } from "./UpdateStatusModal";

export const INTERVIEW_TYPES: InterviewRoundType[] = [
	"Recruiter Screen",
	"Technical Screen",
	"Hiring Manager",
	"System Design",
	"Coding Challenge",
	"Behavioral",
	"Onsite / Panel",
	"Executive / Final",
	"Other",
];

export class AddInterviewModal extends Modal {
	plugin: JobApplicationTrackerPlugin;
	application: JobApplication | null;

	roundType: InterviewRoundType = "Recruiter Screen";
	roundName = "Recruiter Screen";
	date = "";
	time = "";
	interviewers = "";
	createPrepNote = true;
	updateStatusToInterviewing = true;

	constructor(app: App, plugin: JobApplicationTrackerPlugin, application: JobApplication | null = null) {
		super(app);
		this.plugin = plugin;
		this.application = application;
		this.date = plugin.appService.getTodayDateString();
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");

		if (!this.application) {
			new SelectApplicationModal(this.app, this.plugin, (selectedApp) => {
				this.application = selectedApp;
				this.renderModal();
			}).open();
			this.close();
			return;
		}

		this.renderModal();
	}

	renderModal() {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.application) return;

		contentEl.createEl("h2", { text: `Add Interview: ${this.application.company}` });
		contentEl.createEl("p", {
			text: `${this.application.role}`,
			cls: "job-tracker-modal-subtitle",
		});

		// Round Type
		new Setting(contentEl)
			.setName("Interview Type / Stage")
			.setDesc("Select standard interview type")
			.addDropdown((dropdown) => {
				for (const type of INTERVIEW_TYPES) {
					dropdown.addOption(type, type);
				}
				dropdown.setValue(this.roundType);
				dropdown.onChange((value) => {
					this.roundType = value as InterviewRoundType;
					this.roundName = value;
					this.renderModal();
				});
			});

		// Round Name
		new Setting(contentEl)
			.setName("Round Name")
			.setDesc("Specific title for this interview stage")
			.addText((text) =>
				text.setValue(this.roundName).onChange((value) => {
					this.roundName = value;
				})
			);

		// Date
		new Setting(contentEl)
			.setName("Interview Date")
			.setDesc("Date of interview (YYYY-MM-DD)")
			.addText((text) =>
				text.setValue(this.date).onChange((value) => {
					this.date = value;
				})
			);

		// Time
		new Setting(contentEl)
			.setName("Time")
			.setDesc("e.g. 10:00 AM EST, 14:30")
			.addText((text) =>
				text.setPlaceholder("e.g. 2:00 PM EST").onChange((value) => {
					this.time = value;
				})
			);

		// Interviewers
		new Setting(contentEl)
			.setName("Interviewers / Panel")
			.setDesc("Names and roles of the interviewers")
			.addText((text) =>
				text.setPlaceholder("e.g. Sarah Connor (VP Eng), John Smith (Tech Lead)").onChange((value) => {
					this.interviewers = value;
				})
			);

		// Options
		new Setting(contentEl)
			.setName("Generate Interview Prep Note")
			.setDesc("Creates a linked prep note with STAR questions, company research, and questions to ask")
			.addToggle((toggle) =>
				toggle.setValue(this.createPrepNote).onChange((value) => {
					this.createPrepNote = value;
				})
			);

		new Setting(contentEl)
			.setName("Update Status to 'Interviewing'")
			.setDesc("Automatically advance application status to Interviewing")
			.addToggle((toggle) =>
				toggle.setValue(this.updateStatusToInterviewing).onChange((value) => {
					this.updateStatusToInterviewing = value;
				})
			);

		// Action buttons
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Schedule Interview")
					.setCta()
					.onClick(async () => {
						await this.handleSubmit();
					})
			)
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => {
					this.close();
				})
			);
	}

	async handleSubmit() {
		if (!this.application) return;
		if (!this.roundName.trim()) {
			alert("Please enter a round name.");
			return;
		}

		const interview: InterviewRound = {
			id: Date.now().toString(),
			roundName: this.roundName.trim(),
			roundType: this.roundType,
			date: this.date.trim() || undefined,
			time: this.time.trim() || undefined,
			interviewers: this.interviewers.trim() || undefined,
			status: "Scheduled",
		};

		const file = this.app.vault.getAbstractFileByPath(this.application.filePath);
		if (file instanceof TFile) {
			const result = await this.plugin.appService.addInterviewToApplication(
				file,
				interview,
				this.createPrepNote,
				this.updateStatusToInterviewing
			);

			this.close();

			// If prep note was generated, open it for immediate prep
			if (result.prepFile) {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(result.prepFile);
			}
		} else {
			this.close();
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
