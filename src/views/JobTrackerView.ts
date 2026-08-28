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
import { EditApplicationModal } from "../modals/EditApplicationModal";
import { ManageApplicationModal } from "../modals/ManageApplicationModal";
import { ConfirmDeleteModal } from "../modals/ConfirmDeleteModal";
import { KanbanRenderer } from "./renderers/KanbanRenderer";
import { TableRenderer } from "./renderers/TableRenderer";
import { ListRenderer } from "./renderers/ListRenderer";
import { MetricsRenderer } from "./renderers/MetricsRenderer";

export type TrackerViewMode = "kanban" | "table" | "list" | "metrics";

export interface MetricsData {
	appHistories: { app: JobApplication; visited: string[] }[];
	totalApps: number;
	appliedTotal: number;
	wishlistCount: number;
	activeCount: number;
	responseRate: string;
	interviewRate: string;
	offerRate: string;
	totalContacts: number;
	totalInterviews: number;
	completedInterviews: number;
	respondedCount: number;
	interviewCount: number;
	offerCount: number;
	acceptedCount: number;
	sourceMap: Map<string, { total: number; interviews: number; offers: number }>;
	allHistoryEntries: { company: string; role: string; filePath: string; date: string; status: string; note?: string }[];
}

export class JobTrackerView extends ItemView {
	plugin: JobApplicationTrackerPlugin;

	currentMode: TrackerViewMode = "kanban";
	searchQuery = "";
	statusFilter = "All";
	sortField: keyof JobApplication = "dateApplied";
	sortAscending = false;
	applications: JobApplication[] = [];

	private kanbanRenderer: KanbanRenderer;
	private tableRenderer: TableRenderer;
	private listRenderer: ListRenderer;
	private metricsRenderer: MetricsRenderer;

	/** Cache key for metrics computations to avoid re-calculating on tab switches */
	private metricsCacheKey = "";
	private metricsCache: MetricsData | null = null;

	private debouncedRefresh: () => void;
	private debouncedSearch: () => void;

	constructor(leaf: WorkspaceLeaf, plugin: JobApplicationTrackerPlugin) {
		super(leaf);
		this.plugin = plugin;

		this.kanbanRenderer = new KanbanRenderer(this);
		this.tableRenderer = new TableRenderer(this);
		this.listRenderer = new ListRenderer(this);
		this.metricsRenderer = new MetricsRenderer(this);

		this.debouncedRefresh = debounce(
			() => {
				this.loadAndRender();
			},
			300,
			true
		);

		this.debouncedSearch = debounce(
			() => {
				this.renderContentOnly();
			},
			200,
			false
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
		// Only respond to changes within the application or interview folders
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile && file.extension === "md" && this.isTrackedFile(file)) this.debouncedRefresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && file.extension === "md" && this.isTrackedFile(file)) this.debouncedRefresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file) => {
				if (file instanceof TFile && file.extension === "md" && this.isTrackedFile(file)) this.debouncedRefresh();
			})
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file instanceof TFile && this.isTrackedFile(file)) this.debouncedRefresh();
			})
		);

		await this.loadAndRender();
	}

	/**
	 * Checks if a file is within the tracked application folder or has job-application frontmatter.
	 */
	private isTrackedFile(file: TFile): boolean {
		const trackerFolder = this.plugin.settings.trackerFolderPath;
		const interviewFolder = this.plugin.settings.interviewNotesFolderPath;
		if (file.path.startsWith(trackerFolder + "/") || file.path.startsWith(interviewFolder + "/")) {
			return true;
		}
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.type === "job-application";
	}

	async loadAndRender() {
		this.applications = await this.plugin.appService.getAllApplications();
		this.metricsCache = null;
		this.metricsCacheKey = "";
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
			this.kanbanRenderer.render(contentContainer, filteredApps);
		} else if (this.currentMode === "table") {
			this.tableRenderer.render(contentContainer, filteredApps);
		} else if (this.currentMode === "list") {
			this.listRenderer.render(contentContainer, filteredApps);
		} else {
			this.metricsRenderer.render(contentContainer);
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
		const viewSwitcher = headerActions.createDiv({
			cls: "job-tracker-view-switcher",
			attr: { role: "tablist", "aria-label": "View mode" },
		});

		const modes: { mode: TrackerViewMode; label: string; icon: string }[] = [
			{ mode: "kanban", label: "Kanban View", icon: "columns-3" },
			{ mode: "table", label: "Table View", icon: "table" },
			{ mode: "list", label: "List View", icon: "list" },
			{ mode: "metrics", label: "Metrics & Statistics", icon: "bar-chart-3" },
		];

		for (const { mode, label, icon } of modes) {
			const isActive = this.currentMode === mode;
			const btn = viewSwitcher.createEl("button", {
				cls: `job-tracker-mode-btn ${isActive ? "is-active" : ""}`,
				attr: {
					"aria-label": label,
					role: "tab",
					"aria-selected": `${isActive}`,
					tabindex: isActive ? "0" : "-1",
				},
			});
			setIcon(btn, icon);
			btn.onclick = () => {
				this.currentMode = mode;
				this.render();
			};
			btn.onkeydown = (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					this.currentMode = mode;
					this.render();
				}
			};
		}

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
				attr: { "aria-label": "Search applications" },
			});
			searchInput.oninput = (e) => {
				this.searchQuery = (e.target as HTMLInputElement).value;
				this.debouncedSearch();
			};

			if (this.searchQuery) {
				const clearBtn = searchWrapper.createSpan({
					cls: "job-tracker-search-clear",
					attr: { "aria-label": "Clear search", role: "button", tabindex: "0" },
				});
				setIcon(clearBtn, "x");
				clearBtn.onclick = () => {
					this.searchQuery = "";
					this.render();
				};
				clearBtn.onkeydown = (e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						this.searchQuery = "";
						this.render();
					}
				};
			}

			// Status filter dropdown
			const statusSelect = filterRow.createEl("select", {
				cls: "job-tracker-filter-select",
				attr: { "aria-label": "Filter by status" },
			});
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
				this.kanbanRenderer.render(contentArea, filteredApps);
			} else if (this.currentMode === "table") {
				this.tableRenderer.render(contentArea, filteredApps);
			} else if (this.currentMode === "list") {
				this.listRenderer.render(contentArea, filteredApps);
			} else {
				this.metricsRenderer.render(contentArea);
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
					(a.company ?? "").toLowerCase().includes(q) ||
					(a.role ?? "").toLowerCase().includes(q) ||
					(a.location && a.location.toLowerCase().includes(q)) ||
					(a.source && a.source.toLowerCase().includes(q)) ||
					(a.salary && a.salary.toLowerCase().includes(q)) ||
					(a.contacts?.some(
						(c) =>
							c.name.toLowerCase().includes(q) ||
							(c.email && c.email.toLowerCase().includes(q))
					) ?? false)
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

	/**
	 * Extracts the chronological sequence of statuses that the application entered/exited.
	 * Resolves final statuses (Accepted, Rejected, Withdrawn, Ghosted) so only the latest
	 * current final status is kept at the end of the chain, preventing multiple final transitions.
	 */
	getVisitedStatuses(app: JobApplication): string[] {
		const rawVisited: string[] = [];

		// 1. Extract from statusHistory
		if (app.statusHistory && app.statusHistory.length > 0) {
			for (const entry of app.statusHistory) {
				if (entry.status && (rawVisited.length === 0 || rawVisited[rawVisited.length - 1] !== entry.status)) {
					rawVisited.push(entry.status);
				}
			}
		}

		// 2. Ensure current status is at the end
		if (app.status && (rawVisited.length === 0 || rawVisited[rawVisited.length - 1] !== app.status)) {
			rawVisited.push(app.status);
		}

		// 3. Fallback: If application has interview records but "Interviewing" isn't in history
		if (app.interviews && app.interviews.length > 0 && !rawVisited.includes("Interviewing")) {
			const last = rawVisited[rawVisited.length - 1];
			if (["Offer", "Accepted", "Rejected", "Ghosted", "Withdrawn"].includes(last)) {
				rawVisited.splice(rawVisited.length - 1, 0, "Interviewing");
			} else {
				rawVisited.push("Interviewing");
			}
		}

		// 4. Ensure "Applied" is in the chain if application was submitted beyond Wishlist
		if (rawVisited.length === 0) {
			rawVisited.push(app.status || "Applied");
		} else if (rawVisited[0] !== "Wishlist" && !rawVisited.includes("Applied")) {
			rawVisited.unshift("Applied");
		}

		// 5. Eliminate cycles / loops
		const visited: string[] = [];
		for (const st of rawVisited) {
			const existingIdx = visited.indexOf(st);
			if (existingIdx !== -1) {
				visited.length = existingIdx + 1;
			} else {
				visited.push(st);
			}
		}

		// 6. Enforce Single Final Status Rule
		const finalStatuses = ["Accepted", "Rejected", "Withdrawn", "Ghosted"];
		let lastFinalStatus: string | null = null;

		for (let i = visited.length - 1; i >= 0; i--) {
			if (finalStatuses.includes(visited[i])) {
				lastFinalStatus = visited[i];
				break;
			}
		}

		if (lastFinalStatus) {
			const filtered: string[] = [];
			for (let i = 0; i < visited.length; i++) {
				const s = visited[i];
				if (!finalStatuses.includes(s)) {
					filtered.push(s);
				}
			}
			filtered.push(lastFinalStatus);
			return filtered;
		}

		return visited;
	}

	/**
	 * Computes and caches metrics data. Only recomputes when applications data has changed.
	 */
	getOrComputeMetrics(): MetricsData {
		const cacheKey = `${this.applications.length}:${this.applications.map((a) => `${a.filePath}:${a.lastUpdated || a.status}`).join(",")}`;
		if (this.metricsCache && this.metricsCacheKey === cacheKey) {
			return this.metricsCache;
		}

		const totalApps = this.applications.length;
		const appHistories = this.applications.map((a) => ({
			app: a,
			visited: this.getVisitedStatuses(a),
		}));

		const appliedApps = appHistories.filter(
			(h) => h.visited.some((st) => st !== "Wishlist") || h.app.status !== "Wishlist"
		);
		const wishlistApps = appHistories.filter(
			(h) => h.app.status === "Wishlist" && !h.visited.some((st) => st !== "Wishlist")
		);
		const appliedTotal = appliedApps.length;

		const activeStatuses: JobStatus[] = ["Applied", "Screening", "Interviewing", "Offer"];
		const activeApps = this.applications.filter((a) => activeStatuses.includes(a.status));

		const interviewApps = appliedApps.filter(
			(h) =>
				h.visited.includes("Interviewing") ||
				h.visited.includes("Offer") ||
				h.visited.includes("Accepted") ||
				(h.app.interviews && h.app.interviews.length > 0)
		);

		const offerApps = appliedApps.filter(
			(h) => h.visited.includes("Offer") || h.visited.includes("Accepted") || h.app.status === "Offer" || h.app.status === "Accepted"
		);

		const acceptedApps = appliedApps.filter(
			(h) => h.visited.includes("Accepted") || h.app.status === "Accepted"
		);

		const respondedApps = appliedApps.filter(
			(h) =>
				h.visited.some((st) => ["Screening", "Interviewing", "Offer", "Accepted", "Rejected"].includes(st)) ||
				(h.app.interviews && h.app.interviews.length > 0)
		);

		const responseRate = appliedTotal > 0 ? ((respondedApps.length / appliedTotal) * 100).toFixed(1) : "0.0";
		const interviewRate = appliedTotal > 0 ? ((interviewApps.length / appliedTotal) * 100).toFixed(1) : "0.0";
		const offerRate = appliedTotal > 0 ? ((offerApps.length / appliedTotal) * 100).toFixed(1) : "0.0";

		const totalContacts = this.applications.reduce((acc, a) => acc + (a.contacts?.length || 0), 0);
		const totalInterviews = this.applications.reduce((acc, a) => acc + (a.interviews?.length || 0), 0);
		const completedInterviews = this.applications.reduce(
			(acc, a) => acc + (a.interviews?.filter((i) => i.status === "Completed").length || 0),
			0
		);

		const sourceMap = new Map<string, { total: number; interviews: number; offers: number }>();
		for (const h of appHistories) {
			const src = h.app.source || "Unspecified";
			const entry = sourceMap.get(src) || { total: 0, interviews: 0, offers: 0 };
			entry.total++;
			if (h.visited.includes("Interviewing") || (h.app.interviews && h.app.interviews.length > 0)) {
				entry.interviews++;
			}
			if (h.visited.includes("Offer") || h.app.status === "Offer") {
				entry.offers++;
			}
			sourceMap.set(src, entry);
		}

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

		this.metricsCache = {
			appHistories,
			totalApps,
			appliedTotal,
			wishlistCount: wishlistApps.length,
			activeCount: activeApps.length,
			responseRate,
			interviewRate,
			offerRate,
			totalContacts,
			totalInterviews,
			completedInterviews,
			respondedCount: respondedApps.length,
			interviewCount: interviewApps.length,
			offerCount: offerApps.length,
			acceptedCount: acceptedApps.length,
			sourceMap,
			allHistoryEntries,
		};
		this.metricsCacheKey = cacheKey;
		return this.metricsCache;
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
				.setTitle("Manage Contacts & Interviews")
				.setIcon("users")
				.onClick(() => new ManageApplicationModal(this.app, this.plugin, app).open())
		);

		menu.addItem((item) =>
			item
				.setTitle("Edit Details & Attachment")
				.setIcon("edit")
				.onClick(() => new EditApplicationModal(this.app, this.plugin, app).open())
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

		if (app.jobDescriptionFile) {
			const isPdf = app.jobDescriptionFile.toLowerCase().endsWith(".pdf");
			menu.addItem((item) =>
				item
					.setTitle(isPdf ? "Open Attached PDF" : "Open Attached JD")
					.setIcon(isPdf ? "file-text" : "file")
					.onClick(() => this.openNote(app.jobDescriptionFile!))
			);
		}

		if (app.jobUrl) {
			menu.addItem((item) =>
				item
					.setTitle("Open Job Posting URL")
					.setIcon("external-link")
					.onClick(() => window.open(app.jobUrl, "_blank"))
			);
		}

		menu.addSeparator();

		menu.addItem((item) =>
			item
				.setTitle("Delete Application")
				.setIcon("trash-2")
				.setWarning(true)
				.onClick(() => {
					new ConfirmDeleteModal(
						this.app,
						`Delete ${app.company}?`,
						`Are you sure you want to delete "${app.company} - ${app.role}"? This will move the application note to trash.`,
						"Delete Application",
						async () => {
							const file = this.plugin.appService.resolveFile(app.filePath);
							if (file instanceof TFile) {
								await this.plugin.appService.deleteApplication(file);
							}
						}
					).open();
				})
		);

		menu.showAtMouseEvent(e);
	}

	async openNote(filePath: string) {
		const file = this.plugin.appService.resolveFile(filePath);
		if (file instanceof TFile) {
			const activeLeaf = this.app.workspace.getActiveViewOfType(JobTrackerView);
			if (activeLeaf && activeLeaf.leaf === this.leaf) {
				const targetLeaf = this.app.workspace.getLeaf("tab");
				await targetLeaf.openFile(file);
			} else {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(file);
			}
		}
	}
}
