import { setIcon, TFile } from "obsidian";
import { JobApplication } from "../../types";
import { NewApplicationModal } from "../../modals/NewApplicationModal";
import { UpdateStatusModal } from "../../modals/UpdateStatusModal";
import { JobTrackerView } from "../JobTrackerView";

/**
 * Renderer for the Kanban view mode, handling column stages, drag-and-drop, and card interactions.
 */
export class KanbanRenderer {
	private view: JobTrackerView;

	constructor(view: JobTrackerView) {
		this.view = view;
	}

	/**
	 * Renders the full Kanban board across all configured status columns.
	 */
	render(container: HTMLElement, apps: JobApplication[]) {
		const board = container.createDiv({ cls: "job-tracker-kanban-board" });
		const statuses = this.view.plugin.settings.statuses;

		for (const status of statuses) {
			const colApps = apps.filter((a) => a.status === status);

			const column = board.createDiv({
				cls: `job-tracker-kanban-column status-${status.toLowerCase()}`,
				attr: { role: "region", "aria-label": `${status} column` },
			});

			// Drag and drop event handlers on column
			column.ondragover = (e) => {
				e.preventDefault();
				column.addClass("drag-over");
			};
			column.ondragleave = () => {
				column.removeClass("drag-over");
			};
			column.ondrop = async (e) => {
				e.preventDefault();
				column.removeClass("drag-over");
				const filePath = e.dataTransfer?.getData("text/plain");
				if (filePath) {
					const file = this.view.plugin.appService.resolveFile(filePath);
					if (file instanceof TFile) {
						await this.view.plugin.appService.updateStatus(file, status);
					}
				}
			};

			// Column Header
			const colHeader = column.createDiv({ cls: "job-tracker-kanban-col-header" });
			const colTitle = colHeader.createDiv({ cls: "job-tracker-kanban-col-title" });
			colTitle.createSpan({ text: status, cls: "job-tracker-status-pill" });
			colTitle.createSpan({ text: `${colApps.length}`, cls: "job-tracker-col-count" });

			const colAddBtn = colHeader.createEl("button", {
				cls: "job-tracker-col-add-btn",
				attr: { "aria-label": `Add application in ${status}` },
			});
			setIcon(colAddBtn, "plus");
			colAddBtn.onclick = () => {
				const modal = new NewApplicationModal(this.view.app, this.view.plugin);
				modal.status = status;
				modal.open();
			};

			// Column Card Container
			const cardList = column.createDiv({ cls: "job-tracker-kanban-cards" });

			if (colApps.length === 0) {
				const emptyMsg = cardList.createDiv({ cls: "job-tracker-kanban-empty" });
				emptyMsg.createSpan({ text: "Drop here" });
			} else {
				for (const app of colApps) {
					this.renderCard(cardList, app);
				}
			}
		}
	}

	renderCard(container: HTMLElement, app: JobApplication) {
		const card = container.createDiv({
			cls: "job-tracker-kanban-card",
			attr: { draggable: "true", role: "article", "aria-label": `${app.company} - ${app.role}` },
		});

		// Drag events
		card.ondragstart = (e) => {
			e.dataTransfer?.setData("text/plain", app.filePath);
			card.addClass("is-dragging");
		};
		card.ondragend = () => {
			card.removeClass("is-dragging");
		};

		// Card top: Company & Actions menu
		const cardTop = card.createDiv({ cls: "job-tracker-card-top" });
		const companyLink = cardTop.createEl("a", {
			text: app.company,
			cls: "job-tracker-card-company",
			attr: { tabindex: "0", role: "link" },
		});
		companyLink.onclick = (e) => {
			e.preventDefault();
			this.view.openNote(app.filePath);
		};
		companyLink.onkeydown = (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.view.openNote(app.filePath);
			}
		};

		const actionsGroup = cardTop.createDiv({ cls: "job-tracker-card-actions-group" });
		const statusPill = actionsGroup.createSpan({
			text: app.status,
			cls: `job-tracker-status-badge status-${app.status.toLowerCase()}`,
			attr: { "aria-label": `Change status (Current: ${app.status})`, role: "button", tabindex: "0" },
		});
		statusPill.onclick = (e) => {
			e.stopPropagation();
			new UpdateStatusModal(this.view.app, this.view.plugin, app).open();
		};
		statusPill.onkeydown = (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				new UpdateStatusModal(this.view.app, this.view.plugin, app).open();
			}
		};

		const menuBtn = actionsGroup.createSpan({
			cls: "job-tracker-card-menu-btn",
			attr: { role: "button", tabindex: "0", "aria-label": "Application actions" },
		});
		setIcon(menuBtn, "more-vertical");
		menuBtn.onclick = (e) => {
			e.stopPropagation();
			this.view.showCardMenu(e, app);
		};
		menuBtn.onkeydown = (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				this.view.showCardMenu(e, app);
			}
		};

		// Role title
		const roleEl = card.createDiv({
			cls: "job-tracker-card-role",
			text: app.role,
			attr: { tabindex: "0", role: "button", "aria-label": `Open note: ${app.role}` },
		});
		roleEl.onclick = () => this.view.openNote(app.filePath);
		roleEl.onkeydown = (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.view.openNote(app.filePath);
			}
		};

		// Tags & Badges
		const badgesRow = card.createDiv({ cls: "job-tracker-card-badges" });
		if (app.location) {
			const locBadge = badgesRow.createSpan({ cls: "job-tracker-badge" });
			const locIcon = locBadge.createSpan({ cls: "job-tracker-badge-icon" });
			setIcon(locIcon, "map-pin");
			locBadge.createSpan({ text: app.location });
		}
		if (app.workplaceType) {
			const wpBadge = badgesRow.createSpan({ cls: "job-tracker-badge job-tracker-badge-workplace" });
			const wpIcon = wpBadge.createSpan({ cls: "job-tracker-badge-icon" });
			setIcon(wpIcon, app.workplaceType === "Remote" ? "globe" : app.workplaceType === "Hybrid" ? "layers" : "building");
			wpBadge.createSpan({ text: app.workplaceType });
		}
		if (app.salary) {
			const salBadge = badgesRow.createSpan({ cls: "job-tracker-badge job-tracker-badge-salary" });
			salBadge.createSpan({ text: app.salary });
		}
		if (app.followUpDate) {
			const fuBadge = badgesRow.createSpan({ cls: "job-tracker-badge job-tracker-badge-followup" });
			const fuIcon = fuBadge.createSpan({ cls: "job-tracker-badge-icon" });
			setIcon(fuIcon, "bell");
			fuBadge.createSpan({ text: app.followUpDate });
		}
		if (app.jobDescriptionFile) {
			const isPdf = app.jobDescriptionFile.toLowerCase().endsWith(".pdf");
			const jdBadge = badgesRow.createSpan({
				cls: "job-tracker-badge job-tracker-badge-attachment",
				attr: { "aria-label": `Open attached JD: ${app.jobDescriptionFile}`, role: "button", tabindex: "0" },
			});
			const jdIcon = jdBadge.createSpan({ cls: "job-tracker-badge-icon" });
			setIcon(jdIcon, isPdf ? "file-text" : "file");
			jdBadge.createSpan({ text: isPdf ? "PDF JD" : "MD JD" });
			jdBadge.onclick = (e) => {
				e.stopPropagation();
				this.view.openNote(app.jobDescriptionFile!);
			};
			jdBadge.onkeydown = (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					e.stopPropagation();
					this.view.openNote(app.jobDescriptionFile!);
				}
			};
		}

		// Contacts & Interviews meta
		const metaRow = card.createDiv({ cls: "job-tracker-card-meta" });

		if (app.contacts && app.contacts.length > 0) {
			const contactMeta = metaRow.createSpan({
				cls: "job-tracker-meta-item",
				attr: { "aria-label": `${app.contacts.length} Contact(s)` },
			});
			const cIcon = contactMeta.createSpan();
			setIcon(cIcon, "user");
			contactMeta.createSpan({ text: `${app.contacts.length}` });
		}

		if (app.interviews && app.interviews.length > 0) {
			const ivMeta = metaRow.createSpan({
				cls: "job-tracker-meta-item",
				attr: { "aria-label": `${app.interviews.length} Interview(s)` },
			});
			const ivIcon = ivMeta.createSpan();
			setIcon(ivIcon, "calendar");
			ivMeta.createSpan({ text: `${app.interviews.length}` });
		}

		metaRow.createSpan({
			cls: "job-tracker-meta-item job-tracker-date-meta",
			text: app.dateApplied || app.lastUpdated || "",
		});
	}
}
