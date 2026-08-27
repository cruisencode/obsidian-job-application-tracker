import { App, FuzzySuggestModal, Modal, Setting, TFile } from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { JobApplication, JobStatus } from "../types";

export class SelectApplicationModal extends FuzzySuggestModal<JobApplication> {
	plugin: JobApplicationTrackerPlugin;
	applications: JobApplication[];
	onSelect: (app: JobApplication) => void;

	constructor(app: App, plugin: JobApplicationTrackerPlugin, onSelect: (app: JobApplication) => void) {
		super(app);
		this.plugin = plugin;
		this.onSelect = onSelect;
	}

	async onOpen() {
		this.applications = await this.plugin.appService.getAllApplications();
		super.onOpen();
	}

	getItems(): JobApplication[] {
		return this.applications || [];
	}

	getItemText(item: JobApplication): string {
		return `${item.company} - ${item.role} [${item.status}]`;
	}

	onChooseItem(item: JobApplication, evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(item);
	}
}

export class UpdateStatusModal extends Modal {
	plugin: JobApplicationTrackerPlugin;
	application: JobApplication | null;
	newStatus: JobStatus;
	note = "";

	constructor(app: App, plugin: JobApplicationTrackerPlugin, application: JobApplication | null = null) {
		super(app);
		this.plugin = plugin;
		this.application = application;
		this.newStatus = application?.status || plugin.settings.defaultStatus || "Applied";
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");

		if (!this.application) {
			// If no application passed in, let user select one first
			new SelectApplicationModal(this.app, this.plugin, (selectedApp) => {
				this.application = selectedApp;
				this.newStatus = selectedApp.status;
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

		contentEl.createEl("h2", { text: `Update Status: ${this.application.company}` });
		contentEl.createEl("p", {
			text: `${this.application.role} (Current: ${this.application.status})`,
			cls: "job-tracker-modal-subtitle",
		});

		new Setting(contentEl)
			.setName("New Status")
			.setDesc("Select the updated stage")
			.addDropdown((dropdown) => {
				for (const st of this.plugin.settings.statuses) {
					dropdown.addOption(st, st);
				}
				dropdown.setValue(this.newStatus);
				dropdown.onChange((value) => {
					this.newStatus = value as JobStatus;
				});
			});

		new Setting(contentEl)
			.setName("Status Note (Optional)")
			.setDesc("Reason, recruiter feedback, rejection note, or stage details")
			.addTextArea((text) => {
				text.setPlaceholder("e.g. Completed recruiter phone screen. Advancing to round 1.").onChange(
					(value) => {
						this.note = value;
					}
				);
				text.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Update Status")
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

		const file = this.app.vault.getAbstractFileByPath(this.application.filePath);
		if (file instanceof TFile) {
			await this.plugin.appService.updateStatus(file, this.newStatus, this.note.trim());
		}

		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
