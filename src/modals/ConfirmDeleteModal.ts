/**
 * Confirmation dialog for destructive actions (deleting applications, contacts, or interviews).
 */
export class ConfirmDeleteModal extends Modal {
	title: string;
	message: string;
	confirmButtonText: string;
	onConfirm: () => Promise<void> | void;

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

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("job-tracker-modal");

		contentEl.createEl("h2", { text: this.title });
		contentEl.createEl("p", {
			text: this.message,
			cls: "job-tracker-modal-subtitle",
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText(this.confirmButtonText)
					.setWarning()
					.onClick(async () => {
						this.close();
						await this.onConfirm();
					})
			)
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => {
					this.close();
				})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
