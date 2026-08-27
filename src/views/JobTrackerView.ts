import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	TFile,
	debounce,
	Menu,
} from "obsidian";
import JobApplicationTrackerPlugin from "../main";
import { JobApplication, JobStatus } from "../types";
import { VIEW_TYPE_JOB_TRACKER } from "../constants";
import { NewApplicationModal } from "../modals/NewApplicationModal";
import { UpdateStatusModal } from "../modals/UpdateStatusModal";
import { AddContactModal } from "../modals/AddContactModal";
import { AddInterviewModal } from "../modals/AddInterviewModal";

export type TrackerViewMode = "kanban" | "table" | "list" | "metrics";

export class JobTrackerView extends ItemView {
	plugin: JobApplicationTrackerPlugin;

	currentMode: TrackerViewMode = "kanban";
	searchQuery = "";
	statusFilter = "All";
	sortField: keyof JobApplication = "dateApplied";
	sortAscending = false;
	applications: JobApplication[] = [];

	private debouncedRefresh: () => void;

	constructor(leaf: WorkspaceLeaf, plugin: JobApplicationTrackerPlugin) {
		super(leaf);
		this.plugin = plugin;

		this.debouncedRefresh = debounce(
			() => {
				this.loadAndRender();
			},
			300,
			true
		);
	}

	getViewType(): string {
		return VIEW_TYPE_JOB_TRACKER;
	}

	getDisplayText(): string {
		return "Job Applications";
	}

	getIcon(): string {
		return "briefcase";
	}

	async onOpen() {
		// Register vault & cache change listeners to auto-refresh view
		this.registerEvent(this.app.vault.on("create", () => this.debouncedRefresh()));
		this.registerEvent(this.app.vault.on("delete", () => this.debouncedRefresh()));
		this.registerEvent(this.app.vault.on("rename", () => this.debouncedRefresh()));
		this.registerEvent(this.app.metadataCache.on("changed", () => this.debouncedRefresh()));

		await this.loadAndRender();
	}

	async loadAndRender() {
		this.applications = await this.plugin.appService.getAllApplications();
		this.render();
	}

	render() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("job-tracker-view");

		this.renderHeader(containerEl);

		const contentContainer = containerEl.createDiv({ cls: "job-tracker-content-area" });

		const filteredApps = this.getFilteredAndSortedApps();

		if (filteredApps.length === 0 && this.applications.length === 0) {
			this.renderEmptyState(contentContainer);
			return;
		}

		if (this.currentMode === "kanban") {
			this.renderKanbanView(contentContainer, filteredApps);
		} else if (this.currentMode === "table") {
			this.renderTableView(contentContainer, filteredApps);
		} else if (this.currentMode === "list") {
			this.renderListView(contentContainer, filteredApps);
		} else {
			this.renderMetricsView(contentContainer);
		}
	}

	renderHeader(container: HTMLElement) {
		const header = container.createDiv({ cls: "job-tracker-header" });

		// Top row: Title + Actions
		const topRow = header.createDiv({ cls: "job-tracker-header-top" });
		const titleContainer = topRow.createDiv({ cls: "job-tracker-title-container" });
		const titleIcon = titleContainer.createSpan({ cls: "job-tracker-title-icon" });
		setIcon(titleIcon, "briefcase");
		titleContainer.createEl("h3", { text: "Job Tracker", cls: "job-tracker-title" });
		titleContainer.createSpan({
			text: `${this.applications.length} apps`,
			cls: "job-tracker-count-badge",
		});

		const headerActions = topRow.createDiv({ cls: "job-tracker-header-actions" });

		// Mode switcher buttons
		const viewSwitcher = headerActions.createDiv({ cls: "job-tracker-view-switcher" });

		const kanbanBtn = viewSwitcher.createEl("button", {
			cls: `job-tracker-mode-btn ${this.currentMode === "kanban" ? "is-active" : ""}`,
			attr: { "aria-label": "Kanban View" },
		});
		setIcon(kanbanBtn, "columns-3");
		kanbanBtn.onclick = () => {
			this.currentMode = "kanban";
			this.render();
		};

		const tableBtn = viewSwitcher.createEl("button", {
			cls: `job-tracker-mode-btn ${this.currentMode === "table" ? "is-active" : ""}`,
			attr: { "aria-label": "Table View" },
		});
		setIcon(tableBtn, "table");
		tableBtn.onclick = () => {
			this.currentMode = "table";
			this.render();
		};

		const listBtn = viewSwitcher.createEl("button", {
			cls: `job-tracker-mode-btn ${this.currentMode === "list" ? "is-active" : ""}`,
			attr: { "aria-label": "List View" },
		});
		setIcon(listBtn, "list");
		listBtn.onclick = () => {
			this.currentMode = "list";
			this.render();
		};

		const metricsBtn = viewSwitcher.createEl("button", {
			cls: `job-tracker-mode-btn ${this.currentMode === "metrics" ? "is-active" : ""}`,
			attr: { "aria-label": "Metrics & Statistics" },
		});
		setIcon(metricsBtn, "bar-chart-3");
		metricsBtn.onclick = () => {
			this.currentMode = "metrics";
			this.render();
		};

		// Refresh button
		const refreshBtn = headerActions.createEl("button", {
			cls: "job-tracker-icon-btn",
			attr: { "aria-label": "Refresh applications" },
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.onclick = () => this.loadAndRender();

		// Add Application CTA button
		const addBtn = headerActions.createEl("button", {
			cls: "mod-cta job-tracker-add-btn",
			text: "+ Add Application",
		});
		addBtn.onclick = () => {
			new NewApplicationModal(this.app, this.plugin).open();
		};

		// Filter & Search bar row (only for non-metrics view)
		if (this.currentMode !== "metrics") {
			const filterRow = header.createDiv({ cls: "job-tracker-filter-row" });

			// Search input
			const searchWrapper = filterRow.createDiv({ cls: "job-tracker-search-wrapper" });
			const searchIcon = searchWrapper.createSpan({ cls: "job-tracker-search-icon" });
			setIcon(searchIcon, "search");
			const searchInput = searchWrapper.createEl("input", {
				type: "text",
				placeholder: "Search company, role, location...",
				cls: "job-tracker-search-input",
				value: this.searchQuery,
			});
			searchInput.oninput = (e) => {
				this.searchQuery = (e.target as HTMLInputElement).value;
				this.renderContentOnly();
			};

			if (this.searchQuery) {
				const clearBtn = searchWrapper.createSpan({ cls: "job-tracker-search-clear" });
				setIcon(clearBtn, "x");
				clearBtn.onclick = () => {
					this.searchQuery = "";
					this.render();
				};
			}

			// Status filter dropdown
			const statusSelect = filterRow.createEl("select", { cls: "job-tracker-filter-select" });
			statusSelect.createEl("option", { text: "All Statuses", value: "All" });
			for (const st of this.plugin.settings.statuses) {
				const opt = statusSelect.createEl("option", { text: st, value: st });
				if (st === this.statusFilter) opt.selected = true;
			}
			statusSelect.onchange = (e) => {
				this.statusFilter = (e.target as HTMLSelectElement).value;
				this.renderContentOnly();
			};
		}
	}

	renderContentOnly() {
		const contentArea = this.containerEl.querySelector(".job-tracker-content-area");
		if (contentArea instanceof HTMLElement) {
			contentArea.empty();
			const filteredApps = this.getFilteredAndSortedApps();
			if (filteredApps.length === 0 && this.applications.length === 0) {
				this.renderEmptyState(contentArea);
				return;
			}
			if (this.currentMode === "kanban") {
				this.renderKanbanView(contentArea, filteredApps);
			} else if (this.currentMode === "table") {
				this.renderTableView(contentArea, filteredApps);
			} else if (this.currentMode === "list") {
				this.renderListView(contentArea, filteredApps);
			} else {
				this.renderMetricsView(contentArea);
			}
		}
	}

	getFilteredAndSortedApps(): JobApplication[] {
		let result = [...this.applications];

		// Status Filter
		if (this.statusFilter !== "All") {
			result = result.filter((a) => a.status === this.statusFilter);
		}

		// Search filter
		if (this.searchQuery.trim()) {
			const q = this.searchQuery.toLowerCase().trim();
			result = result.filter(
				(a) =>
					a.company.toLowerCase().includes(q) ||
					a.role.toLowerCase().includes(q) ||
					(a.location && a.location.toLowerCase().includes(q)) ||
					(a.source && a.source.toLowerCase().includes(q)) ||
					(a.salary && a.salary.toLowerCase().includes(q)) ||
					a.contacts.some(
						(c) =>
							c.name.toLowerCase().includes(q) ||
							(c.email && c.email.toLowerCase().includes(q))
					)
			);
		}

		// Sorting
		result.sort((a, b) => {
			let valA = a[this.sortField] || "";
			let valB = b[this.sortField] || "";

			if (typeof valA === "string") valA = valA.toLowerCase();
			if (typeof valB === "string") valB = valB.toLowerCase();

			if (valA < valB) return this.sortAscending ? -1 : 1;
			if (valA > valB) return this.sortAscending ? 1 : -1;
			return 0;
		});

		return result;
	}

	renderEmptyState(container: HTMLElement) {
		const emptyDiv = container.createDiv({ cls: "job-tracker-empty-state" });
		const iconEl = emptyDiv.createDiv({ cls: "job-tracker-empty-icon" });
		setIcon(iconEl, "briefcase");
		emptyDiv.createEl("h4", { text: "No Job Applications Found" });
		emptyDiv.createEl("p", {
			text: "Get started by adding your first job application.",
		});
		const addBtn = emptyDiv.createEl("button", {
			cls: "mod-cta",
			text: "+ Add Job Application",
		});
		addBtn.onclick = () => {
			new NewApplicationModal(this.app, this.plugin).open();
		};
	}

	/* ========================================================================= */
	/* KANBAN VIEW                                                               */
	/* ========================================================================= */
	renderKanbanView(container: HTMLElement, apps: JobApplication[]) {
		const board = container.createDiv({ cls: "job-tracker-kanban-board" });

		const statuses = this.plugin.settings.statuses;

		for (const status of statuses) {
			const colApps = apps.filter((a) => a.status === status);

			const column = board.createDiv({
				cls: `job-tracker-kanban-column status-${status.toLowerCase()}`,
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
					const file = this.app.vault.getAbstractFileByPath(filePath);
					if (file instanceof TFile) {
						await this.plugin.appService.updateStatus(file, status);
						this.loadAndRender();
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
				const modal = new NewApplicationModal(this.app, this.plugin);
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
					this.renderKanbanCard(cardList, app);
				}
			}
		}
	}

	renderKanbanCard(container: HTMLElement, app: JobApplication) {
		const card = container.createDiv({ cls: "job-tracker-kanban-card", attr: { draggable: "true" } });

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
		});
		companyLink.onclick = (e) => {
			e.preventDefault();
			this.openNote(app.filePath);
		};

		const menuBtn = cardTop.createSpan({ cls: "job-tracker-card-menu-btn" });
		setIcon(menuBtn, "more-vertical");
		menuBtn.onclick = (e) => {
			e.stopPropagation();
			this.showCardMenu(e, app);
		};

		// Role title
		const roleEl = card.createDiv({ cls: "job-tracker-card-role", text: app.role });
		roleEl.onclick = () => this.openNote(app.filePath);

		// Tags & Badges
		const badgesRow = card.createDiv({ cls: "job-tracker-card-badges" });
		if (app.location) {
			const locBadge = badgesRow.createSpan({ cls: "job-tracker-badge" });
			const locIcon = locBadge.createSpan({ cls: "badge-icon" });
			setIcon(locIcon, "map-pin");
			locBadge.createSpan({ text: app.location });
		}
		if (app.salary) {
			const salBadge = badgesRow.createSpan({ cls: "job-tracker-badge badge-salary" });
			salBadge.createSpan({ text: app.salary });
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

		const dateMeta = metaRow.createSpan({
			cls: "job-tracker-meta-item job-tracker-date-meta",
			text: app.dateApplied || app.lastUpdated || "",
		});
	}

	/* ========================================================================= */
	/* TABLE VIEW                                                                */
	/* ========================================================================= */
	renderTableView(container: HTMLElement, apps: JobApplication[]) {
		const tableWrapper = container.createDiv({ cls: "job-tracker-table-wrapper" });
		const table = tableWrapper.createEl("table", { cls: "job-tracker-table" });

		// Table Header
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");

		const columns: { label: string; field: keyof JobApplication }[] = [
			{ label: "Company", field: "company" },
			{ label: "Role", field: "role" },
			{ label: "Status", field: "status" },
			{ label: "Applied Date", field: "dateApplied" },
			{ label: "Location", field: "location" },
			{ label: "Salary", field: "salary" },
			{ label: "Source", field: "source" },
		];

		for (const col of columns) {
			const th = headerRow.createEl("th", { cls: "sortable-th" });
			th.createSpan({ text: col.label });
			if (this.sortField === col.field) {
				const sortIcon = th.createSpan({ cls: "sort-indicator" });
				setIcon(sortIcon, this.sortAscending ? "arrow-up" : "arrow-down");
			}
			th.onclick = () => {
				if (this.sortField === col.field) {
					this.sortAscending = !this.sortAscending;
				} else {
					this.sortField = col.field;
					this.sortAscending = true;
				}
				this.renderContentOnly();
			};
		}

		headerRow.createEl("th", { text: "Contacts" });
		headerRow.createEl("th", { text: "Interviews" });
		headerRow.createEl("th", { text: "Actions" });

		// Table Body
		const tbody = table.createEl("tbody");
		for (const app of apps) {
			const tr = tbody.createEl("tr");

			// Company
			const tdCompany = tr.createEl("td", { cls: "td-company" });
			const cLink = tdCompany.createEl("a", { text: app.company, cls: "company-link" });
			cLink.onclick = () => this.openNote(app.filePath);

			// Role
			const tdRole = tr.createEl("td", { text: app.role });

			// Status Badge
			const tdStatus = tr.createEl("td");
			const statusBadge = tdStatus.createSpan({
				text: app.status,
				cls: `job-tracker-status-badge status-${app.status.toLowerCase()}`,
			});
			statusBadge.onclick = () => {
				new UpdateStatusModal(this.app, this.plugin, app).open();
			};

			// Applied Date
			tr.createEl("td", { text: app.dateApplied || "-" });

			// Location
			tr.createEl("td", { text: app.location || "-" });

			// Salary
			tr.createEl("td", { text: app.salary || "-" });

			// Source
			tr.createEl("td", { text: app.source || "-" });

			// Contacts
			const tdContacts = tr.createEl("td");
			if (app.contacts.length > 0) {
				tdContacts.createSpan({
					text: `${app.contacts.map((c) => c.name).join(", ")}`,
					cls: "table-contacts-preview",
				});
			} else {
				tdContacts.createSpan({ text: "-", cls: "text-muted" });
			}

			// Interviews
			const tdInterviews = tr.createEl("td");
			if (app.interviews.length > 0) {
				tdInterviews.createSpan({
					text: `${app.interviews.length} round(s)`,
					cls: "table-interviews-badge",
				});
			} else {
				tdInterviews.createSpan({ text: "-", cls: "text-muted" });
			}

			// Actions
			const tdActions = tr.createEl("td", { cls: "td-actions" });
			const actionMenuBtn = tdActions.createEl("button", {
				cls: "job-tracker-action-btn",
				attr: { "aria-label": "Actions" },
			});
			setIcon(actionMenuBtn, "more-horizontal");
			actionMenuBtn.onclick = (e) => {
				this.showCardMenu(e, app);
			};
		}
	}

	/* ========================================================================= */
	/* LIST VIEW                                                                 */
	/* ========================================================================= */
	renderListView(container: HTMLElement, apps: JobApplication[]) {
		const listContainer = container.createDiv({ cls: "job-tracker-list-container" });

		for (const app of apps) {
			const item = listContainer.createDiv({ cls: "job-tracker-list-item" });

			const mainInfo = item.createDiv({ cls: "job-tracker-list-main" });
			const titleRow = mainInfo.createDiv({ cls: "job-tracker-list-title-row" });
			const compLink = titleRow.createEl("a", {
				text: app.company,
				cls: "job-tracker-list-company",
			});
			compLink.onclick = () => this.openNote(app.filePath);

			titleRow.createSpan({ text: "•", cls: "divider" });
			titleRow.createSpan({ text: app.role, cls: "job-tracker-list-role" });

			const statusBadge = titleRow.createSpan({
				text: app.status,
				cls: `job-tracker-status-badge status-${app.status.toLowerCase()}`,
			});
			statusBadge.onclick = () => {
				new UpdateStatusModal(this.app, this.plugin, app).open();
			};

			// Details row
			const detailsRow = mainInfo.createDiv({ cls: "job-tracker-list-details" });
			if (app.location) detailsRow.createSpan({ text: `📍 ${app.location}` });
			if (app.salary) detailsRow.createSpan({ text: `💰 ${app.salary}` });
			if (app.source) detailsRow.createSpan({ text: `🔗 ${app.source}` });
			if (app.dateApplied) detailsRow.createSpan({ text: `📅 Applied: ${app.dateApplied}` });

			if (app.interviews.length > 0) {
				const nextIv = app.interviews.find((i) => i.status === "Scheduled");
				if (nextIv) {
					detailsRow.createSpan({
						text: `⏳ Next: ${nextIv.roundName} (${nextIv.date || "TBD"})`,
						cls: "job-tracker-list-highlight",
					});
				}
			}

			// Actions
			const actions = item.createDiv({ cls: "job-tracker-list-actions" });

			const addIvBtn = actions.createEl("button", {
				cls: "job-tracker-action-pill-btn",
				text: "+ Interview",
			});
			addIvBtn.onclick = () => new AddInterviewModal(this.app, this.plugin, app).open();

			const addContactBtn = actions.createEl("button", {
				cls: "job-tracker-action-pill-btn",
				text: "+ Contact",
			});
			addContactBtn.onclick = () => new AddContactModal(this.app, this.plugin, app).open();

			const menuBtn = actions.createEl("button", {
				cls: "job-tracker-icon-btn",
				attr: { "aria-label": "More options" },
			});
			setIcon(menuBtn, "more-vertical");
			menuBtn.onclick = (e) => this.showCardMenu(e, app);
		}
	}

	/* ========================================================================= */
	/* METRICS & STATISTICS VIEW                                                 */
	/* ========================================================================= */
	renderMetricsView(container: HTMLElement) {
		const metricsContainer = container.createDiv({ cls: "job-tracker-metrics-container" });

		const totalApps = this.applications.length;
		const activeStatuses: JobStatus[] = ["Wishlist", "Applied", "Screening", "Interviewing"];
		const activeApps = this.applications.filter((a) => activeStatuses.includes(a.status));
		const interviewApps = this.applications.filter(
			(a) => ["Screening", "Interviewing", "Offer"].includes(a.status) || a.interviews.length > 0
		);
		const offerApps = this.applications.filter((a) => a.status === "Offer");
		const rejectedApps = this.applications.filter((a) => a.status === "Rejected");
		const ghostedApps = this.applications.filter((a) => a.status === "Ghosted");

		const appliedTotal = this.applications.filter((a) => a.status !== "Wishlist").length;
		const respondedTotal = this.applications.filter(
			(a) => a.status !== "Applied" && a.status !== "Wishlist" && a.status !== "Ghosted"
		).length;

		const responseRate = appliedTotal > 0 ? ((respondedTotal / appliedTotal) * 100).toFixed(1) : "0.0";
		const interviewRate = appliedTotal > 0 ? ((interviewApps.length / appliedTotal) * 100).toFixed(1) : "0.0";
		const offerRate = appliedTotal > 0 ? ((offerApps.length / appliedTotal) * 100).toFixed(1) : "0.0";

		const totalContacts = this.applications.reduce((acc, a) => acc + (a.contacts?.length || 0), 0);
		const totalInterviews = this.applications.reduce((acc, a) => acc + (a.interviews?.length || 0), 0);
		const completedInterviews = this.applications.reduce(
			(acc, a) => acc + (a.interviews?.filter((i) => i.status === "Completed").length || 0),
			0
		);

		// 1. KPI Cards Grid
		const kpiGrid = metricsContainer.createDiv({ cls: "job-tracker-kpi-grid" });

		this.renderKpiCard(kpiGrid, "Total Applications", `${totalApps}`, "briefcase", "All tracked job notes");
		this.renderKpiCard(kpiGrid, "Active Pipeline", `${activeApps.length}`, "activity", "In progress applications");
		this.renderKpiCard(kpiGrid, "Response Rate", `${responseRate}%`, "mail", "Applications with a response");
		this.renderKpiCard(kpiGrid, "Interview Rate", `${interviewRate}%`, "calendar-check", "Advancement to screens/interviews");
		this.renderKpiCard(kpiGrid, "Offer Rate", `${offerRate}%`, "award", "Offers received");
		this.renderKpiCard(kpiGrid, "Total Contacts", `${totalContacts}`, "users", "Recruiters & managers");
		this.renderKpiCard(
			kpiGrid,
			"Interviews",
			`${totalInterviews}`,
			"clock",
			`${completedInterviews} completed rounds`
		);

		// 2. Section: Pipeline Stage Funnel & Breakdown
		const funnelSection = metricsContainer.createDiv({ cls: "job-tracker-metrics-section" });
		funnelSection.createEl("h4", { text: "Pipeline Stage Breakdown" });

		const funnelBars = funnelSection.createDiv({ cls: "job-tracker-funnel-bars" });

		for (const st of this.plugin.settings.statuses) {
			const count = this.applications.filter((a) => a.status === st).length;
			const pct = totalApps > 0 ? ((count / totalApps) * 100).toFixed(1) : "0";

			const barItem = funnelBars.createDiv({ cls: "job-tracker-funnel-item" });

			const labelRow = barItem.createDiv({ cls: "job-tracker-funnel-label-row" });
			const leftLabel = labelRow.createDiv({ cls: "job-tracker-funnel-left" });
			leftLabel.createSpan({ text: st, cls: `job-tracker-status-badge status-${st.toLowerCase()}` });

			const rightLabel = labelRow.createDiv({ cls: "job-tracker-funnel-right" });
			rightLabel.createSpan({ text: `${count} (${pct}%)`, cls: "text-muted" });

			const progressBg = barItem.createDiv({ cls: "job-tracker-progress-bg" });
			const progressFill = progressBg.createDiv({
				cls: `job-tracker-progress-fill status-${st.toLowerCase()}`,
			});
			progressFill.style.width = `${pct}%`;
		}

		// 3. Section: Source Performance Analytics
		const sourceSection = metricsContainer.createDiv({ cls: "job-tracker-metrics-section" });
		sourceSection.createEl("h4", { text: "Source Performance & Conversion" });

		// Group applications by source
		const sourceMap = new Map<string, { total: number; interviews: number; offers: number }>();
		for (const app of this.applications) {
			const src = app.source || "Unspecified";
			const entry = sourceMap.get(src) || { total: 0, interviews: 0, offers: 0 };
			entry.total++;
			if (["Screening", "Interviewing", "Offer"].includes(app.status) || app.interviews.length > 0) {
				entry.interviews++;
			}
			if (app.status === "Offer") {
				entry.offers++;
			}
			sourceMap.set(src, entry);
		}

		if (sourceMap.size === 0) {
			sourceSection.createEl("p", {
				text: "No source data available yet.",
				cls: "text-muted",
			});
		} else {
			const sourceTable = sourceSection.createEl("table", { cls: "job-tracker-table source-table" });
			const stHead = sourceTable.createEl("thead");
			const stHeadRow = stHead.createEl("tr");
			stHeadRow.createEl("th", { text: "Source" });
			stHeadRow.createEl("th", { text: "Applications" });
			stHeadRow.createEl("th", { text: "Interviews Landed" });
			stHeadRow.createEl("th", { text: "Offers Landed" });
			stHeadRow.createEl("th", { text: "Interview %" });

			const stBody = sourceTable.createEl("tbody");
			for (const [sourceName, stats] of sourceMap.entries()) {
				const tr = stBody.createEl("tr");
				tr.createEl("td", { text: sourceName, cls: "font-semibold" });
				tr.createEl("td", { text: `${stats.total}` });
				tr.createEl("td", { text: `${stats.interviews}` });
				tr.createEl("td", { text: `${stats.offers}` });
				const srcIvRate = stats.total > 0 ? ((stats.interviews / stats.total) * 100).toFixed(0) : "0";
				tr.createEl("td", { text: `${srcIvRate}%` });
			}
		}

		// 4. Section: Recent Activity Timeline
		const activitySection = metricsContainer.createDiv({ cls: "job-tracker-metrics-section" });
		activitySection.createEl("h4", { text: "Recent Application Activity" });

		const allHistoryEntries: { company: string; role: string; filePath: string; date: string; status: string; note?: string }[] = [];
		for (const app of this.applications) {
			for (const h of app.statusHistory || []) {
				allHistoryEntries.push({
					company: app.company,
					role: app.role,
					filePath: app.filePath,
					date: h.date,
					status: h.status,
					note: h.note,
				});
			}
		}

		allHistoryEntries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

		if (allHistoryEntries.length === 0) {
			activitySection.createEl("p", {
				text: "No recent status activity recorded yet.",
				cls: "text-muted",
			});
		} else {
			const activityList = activitySection.createDiv({ cls: "job-tracker-activity-list" });
			for (const entry of allHistoryEntries.slice(0, 10)) {
				const item = activityList.createDiv({ cls: "job-tracker-activity-item" });
				const dot = item.createSpan({ cls: `activity-dot status-${entry.status.toLowerCase()}` });

				const textContainer = item.createDiv({ cls: "activity-text" });
				const titleRow = textContainer.createDiv({ cls: "activity-title-row" });
				const compLink = titleRow.createEl("a", { text: entry.company, cls: "activity-comp-link" });
				compLink.onclick = () => this.openNote(entry.filePath);
				titleRow.createSpan({ text: `(${entry.role})` });
				titleRow.createSpan({
					text: entry.status,
					cls: `job-tracker-status-badge status-${entry.status.toLowerCase()}`,
				});
				titleRow.createSpan({ text: entry.date, cls: "activity-date" });

				if (entry.note) {
					textContainer.createDiv({ text: entry.note, cls: "activity-note" });
				}
			}
		}
	}

	renderKpiCard(container: HTMLElement, label: string, value: string, icon: string, subtext: string) {
		const card = container.createDiv({ cls: "job-tracker-kpi-card" });
		const top = card.createDiv({ cls: "job-tracker-kpi-top" });
		top.createSpan({ text: label, cls: "job-tracker-kpi-label" });
		const iconEl = top.createSpan({ cls: "job-tracker-kpi-icon" });
		setIcon(iconEl, icon);

		card.createDiv({ text: value, cls: "job-tracker-kpi-value" });
		card.createDiv({ text: subtext, cls: "job-tracker-kpi-subtext" });
	}

	showCardMenu(e: MouseEvent, app: JobApplication) {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle("Open Note")
				.setIcon("file-text")
				.onClick(() => this.openNote(app.filePath))
		);

		menu.addItem((item) =>
			item
				.setTitle("Update Status")
				.setIcon("arrow-right-circle")
				.onClick(() => new UpdateStatusModal(this.app, this.plugin, app).open())
		);

		menu.addItem((item) =>
			item
				.setTitle("Add Interview")
				.setIcon("calendar-plus")
				.onClick(() => new AddInterviewModal(this.app, this.plugin, app).open())
		);

		menu.addItem((item) =>
			item
				.setTitle("Add Contact")
				.setIcon("user-plus")
				.onClick(() => new AddContactModal(this.app, this.plugin, app).open())
		);

		if (app.jobUrl) {
			menu.addItem((item) =>
				item
					.setTitle("Open Job Posting URL")
					.setIcon("external-link")
					.onClick(() => window.open(app.jobUrl, "_blank"))
			);
		}

		menu.showAtMouseEvent(e);
	}

	async openNote(filePath: string) {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
		}
	}
}

