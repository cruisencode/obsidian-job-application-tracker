import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";

/**
 * Confirmation dialog for destructive actions (deleting applications, contacts, or interviews).
 */
export class ConfirmDeleteModal extends Modal {
	private title: string;
	private message: string;
	private confirmButtonText: string;
	private onConfirm: () => Promise<void> | void;

	constructor(
		app: App,
		title: string,
		message: string,
		confirmButtonText: string,
		onConfirm: () => Promise<void> | void
	) {
		super(app);
		this.title = title;
		this.message = message;
		this.confirmButtonText = confirmButtonText;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");
		contentEl.setAttrs({
			role: "alertdialog",
			"aria-labelledby": "confirm-delete-title",
			"aria-describedby": "confirm-delete-desc",
		});

		contentEl.createEl("h2", { text: this.title, attr: { id: "confirm-delete-title" } });
		contentEl.createEl("p", {
			text: this.message,
			cls: "job-tracker-modal-subtitle",
			attr: { id: "confirm-delete-desc" },
		});

		let confirmBtn: ButtonComponent;
		let cancelBtn: ButtonComponent;

		new Setting(contentEl)
			.addButton((btn) => {
				confirmBtn = btn;
				btn
					.setButtonText(this.confirmButtonText)
					.setClass("mod-warning")
					.onClick(async () => {
						confirmBtn.setDisabled(true);
						cancelBtn.setDisabled(true);
						try {
							await this.onConfirm();
							this.close();
						} catch (err) {
							confirmBtn.setDisabled(false);
							cancelBtn.setDisabled(false);
							console.error("Job Tracker: Confirmation action failed:", err);
							new Notice("Action failed. Please check the console for details.");
						}
					});
			})
			.addButton((btn) => {
				cancelBtn = btn;
				btn.setButtonText("Cancel").onClick(() => {
					this.close();
				});
			});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
