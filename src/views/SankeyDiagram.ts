/**
 * Native SVG Sankey Diagram Renderer for Obsidian Job Application Tracker.
 * Renders pure SVG DOM elements without external dependencies or security prompts.
 */

export interface SankeyLink {
	source: string;
	target: string;
	value: number;
}

export interface SankeyNode {
	id: string;
	label: string;
	layer: number;
	value: number;
	x: number;
	y: number;
	width: number;
	height: number;
	color: string;
}

export class SankeyDiagram {
	static getNodeColor(id: string): string {
		const lower = id.toLowerCase();
		if (lower === "accepted") return "var(--color-green, #10b981)";
		if (lower === "offer") return "var(--color-yellow, #f59e0b)";
		if (lower === "interviewing") return "var(--color-blue, #3b82f6)";
		if (lower === "screening") return "var(--color-cyan, #06b6d4)";
		if (lower === "applied") return "var(--color-purple, #8b5cf6)";
		if (lower === "wishlist") return "var(--color-slate, #94a3b8)";
		if (lower === "rejected") return "var(--color-red, #ef4444)";
		if (lower === "ghosted") return "var(--color-orange, #ea580c)";
		if (lower === "withdrawn") return "var(--color-base-60, #94a3b8)";

		// Source colors based on hash/palette
		const sourcePalette = [
			"#3b82f6",
			"#8b5cf6",
			"#ec4899",
			"#06b6d4",
			"#10b981",
			"#f59e0b",
			"#6366f1",
			"#14b8a6",
		];
		let hash = 0;
		for (let i = 0; i < id.length; i++) {
			hash = (hash << 5) - hash + id.charCodeAt(i);
		}
		return sourcePalette[Math.abs(hash) % sourcePalette.length];
	}

	/**
	 * Formats and safely truncates display text labels for diagram nodes.
	 */
	static formatDisplayLabel(label: string, value: number, maxChars = 22): string {
		const clean = (label || "").trim();
		const displayStr = clean.length > maxChars ? clean.slice(0, maxChars - 1) + "…" : clean;
		return `${displayStr} (${value})`;
	}

	/**
	 * Renders a complete interactive Sankey SVG into the provided container.
	 */
	static render(container: HTMLElement, links: SankeyLink[], totalApps: number) {
		container.empty();

		if (links.length === 0 || totalApps === 0) {
			container.createEl("p", {
				text: "No application flow data available yet.",
				cls: "text-muted",
			});
			return;
		}

		// 1. Collect all unique nodes
		const nodeMap = new Map<string, SankeyNode>();
		const outgoingMap = new Map<string, SankeyLink[]>();
		const incomingMap = new Map<string, SankeyLink[]>();

		for (const link of links) {
			if (!outgoingMap.has(link.source)) outgoingMap.set(link.source, []);
			outgoingMap.get(link.source)!.push(link);

			if (!incomingMap.has(link.target)) incomingMap.set(link.target, []);
			incomingMap.get(link.target)!.push(link);
		}

		const allNodeIds = new Set<string>();
		for (const link of links) {
			allNodeIds.add(link.source);
			allNodeIds.add(link.target);
		}

		// 2. Assign layer/column using topological depth
		const layers = new Map<string, number>();

		// Find root nodes (no incoming links)
		const roots: string[] = [];
		for (const id of allNodeIds) {
			if (!incomingMap.has(id) || incomingMap.get(id)!.length === 0) {
				roots.push(id);
			}
		}

		// Fallback if all have incoming (should not happen in DAG)
		if (roots.length === 0 && allNodeIds.size > 0) {
			roots.push(Array.from(allNodeIds)[0]);
		}

		// BFS to assign layers
		const queue: { id: string; layer: number }[] = roots.map((r) => ({ id: r, layer: 0 }));
		for (const r of roots) layers.set(r, 0);

		while (queue.length > 0) {
			const { id, layer } = queue.shift()!;
			const outs = outgoingMap.get(id) || [];
			for (const link of outs) {
				const nextLayer = Math.max(layers.get(link.target) || 0, layer + 1);
				layers.set(link.target, nextLayer);
				queue.push({ id: link.target, layer: nextLayer });
			}
		}

		const maxLayer = Math.max(...Array.from(layers.values()), 1);

		// Group nodes by layer
		const layerGroups = new Map<number, string[]>();
		for (const [id, layer] of layers.entries()) {
			if (!layerGroups.has(layer)) layerGroups.set(layer, []);
			layerGroups.get(layer)!.push(id);
		}

		// Calculate node values: max(incomingSum, outgoingSum)
		for (const id of allNodeIds) {
			const inSum = (incomingMap.get(id) || []).reduce((acc, l) => acc + l.value, 0);
			const outSum = (outgoingMap.get(id) || []).reduce((acc, l) => acc + l.value, 0);
			const val = Math.max(inSum, outSum, 1);
			nodeMap.set(id, {
				id,
				label: id,
				layer: layers.get(id) || 0,
				value: val,
				x: 0,
				y: 0,
				width: 14,
				height: 0,
				color: this.getNodeColor(id),
			});
		}

		// 3. Geometry & Layout Coordinates
		// Dynamically compute left and right padding based on actual label lengths to ensure labels never clip
		const leftNodeIds = layerGroups.get(0) || [];
		const rightNodeIds = layerGroups.get(maxLayer) || [];

		const maxLeftChars = leftNodeIds.reduce((max, id) => {
			const n = nodeMap.get(id);
			return Math.max(max, this.formatDisplayLabel(n?.label || id, n?.value || 0).length);
		}, 10);

		const maxRightChars = rightNodeIds.reduce((max, id) => {
			const n = nodeMap.get(id);
			return Math.max(max, this.formatDisplayLabel(n?.label || id, n?.value || 0).length);
		}, 10);

		const paddingLeft = Math.max(120, Math.min(220, Math.ceil(maxLeftChars * 7.5) + 24));
		const paddingRight = Math.max(120, Math.min(220, Math.ceil(maxRightChars * 7.5) + 24));
		const paddingY = 40;
		const nodeGap = 16;

		const baseWidth = Math.max(880, maxLayer * 200 + paddingLeft + paddingRight);
		let baseHeight = Math.max(420, baseWidth * 0.5);

		const usableWidth = baseWidth - paddingLeft - paddingRight;
		let usableHeight = baseHeight - paddingY * 2;
		const layerXStep = maxLayer > 0 ? usableWidth / maxLayer : usableWidth;

		// Compute node heights and adjust baseHeight if columns are tall
		let maxColHeight = 0;
		for (let layer = 0; layer <= maxLayer; layer++) {
			const nodeIds = layerGroups.get(layer) || [];
			if (nodeIds.length === 0) continue;

			const totalValue = nodeIds.reduce((sum, id) => sum + (nodeMap.get(id)?.value || 0), 0);
			const availableHeight = usableHeight - (nodeIds.length - 1) * nodeGap;
			const pixelsPerUnit = totalValue > 0 ? Math.min(32, Math.max(8, availableHeight / totalValue)) : 20;

			let colHeight = 0;
			for (const id of nodeIds) {
				const n = nodeMap.get(id)!;
				n.height = Math.max(18, n.value * pixelsPerUnit);
				colHeight += n.height;
			}
			colHeight += (nodeIds.length - 1) * nodeGap;
			if (colHeight > maxColHeight) maxColHeight = colHeight;
		}

		if (maxColHeight > usableHeight) {
			baseHeight = maxColHeight + paddingY * 2;
			usableHeight = baseHeight - paddingY * 2;
		}

		// Compute positions for each column
		for (let layer = 0; layer <= maxLayer; layer++) {
			const nodeIds = layerGroups.get(layer) || [];
			if (nodeIds.length === 0) continue;

			let columnHeight = 0;
			for (const id of nodeIds) {
				columnHeight += nodeMap.get(id)!.height;
			}
			columnHeight += (nodeIds.length - 1) * nodeGap;

			// Vertically center column
			let currentY = paddingY + (usableHeight - columnHeight) / 2;
			const currentX = paddingLeft + layer * layerXStep;

			for (const id of nodeIds) {
				const n = nodeMap.get(id)!;
				n.x = currentX;
				n.y = currentY;
				currentY += n.height + nodeGap;
			}
		}

		// 4. Build SVG with Obsidian's createSvg helper
		const svg = container.createSvg("svg", {
			cls: "job-tracker-native-sankey-svg",
			attr: {
				viewBox: `0 0 ${baseWidth} ${baseHeight}`,
				preserveAspectRatio: "xMidYMid meet",
			},
		});

		// Definitions for gradients & filters
		const defs = svg.createSvg("defs");

		// Track offsets for multiple links connecting to/from the same node
		const sourceOffsets = new Map<string, number>();
		const targetOffsets = new Map<string, number>();

		// Draw Links (Ribbons)
		const linksGroup = svg.createSvg("g", { cls: "job-tracker-sankey-links" });

		for (const link of links) {
			const sourceNode = nodeMap.get(link.source);
			const targetNode = nodeMap.get(link.target);
			if (!sourceNode || !targetNode) continue;

			const sOffset = sourceOffsets.get(link.source) || 0;
			const tOffset = targetOffsets.get(link.target) || 0;

			const sourceLinkHeight = Math.max(4, (link.value / sourceNode.value) * sourceNode.height);
			const targetLinkHeight = Math.max(4, (link.value / targetNode.value) * targetNode.height);

			const x0 = sourceNode.x + sourceNode.width;
			const y0 = sourceNode.y + sOffset;
			const x1 = targetNode.x;
			const y1 = targetNode.y + tOffset;

			sourceOffsets.set(link.source, sOffset + sourceLinkHeight);
			targetOffsets.set(link.target, tOffset + targetLinkHeight);

			const curvature = 0.5;
			const xi = x0 + (x1 - x0) * curvature;

			const pathData = `
				M ${x0} ${y0}
				C ${xi} ${y0}, ${xi} ${y1}, ${x1} ${y1}
				L ${x1} ${y1 + targetLinkHeight}
				C ${xi} ${y1 + targetLinkHeight}, ${xi} ${y0 + sourceLinkHeight}, ${x0} ${y0 + sourceLinkHeight}
				Z
			`;

			// Create linear gradient for link
			const gradId = `sankey-grad-${Math.random().toString(36).substring(2, 11)}`;
			const grad = defs.createSvg("linearGradient", {
				attr: {
					id: gradId,
					gradientUnits: "userSpaceOnUse",
					x1: `${x0}`,
					y1: `${y0}`,
					x2: `${x1}`,
					y2: `${y1}`,
				},
			});

			const stop1 = grad.createSvg("stop", {
				attr: {
					offset: "0%",
					"stop-color": sourceNode.color,
					"stop-opacity": "0.45",
				},
			});

			const stop2 = grad.createSvg("stop", {
				attr: {
					offset: "100%",
					"stop-color": targetNode.color,
					"stop-opacity": "0.45",
				},
			});

			const path = linksGroup.createSvg("path", {
				cls: "job-tracker-sankey-ribbon",
				attr: {
					d: pathData,
					fill: `url(#${gradId})`,
				},
			});

			// Interactive hover
			path.onmouseenter = () => {
				stop1.setAttribute("stop-opacity", "0.85");
				stop2.setAttribute("stop-opacity", "0.85");
			};
			path.onmouseleave = () => {
				stop1.setAttribute("stop-opacity", "0.45");
				stop2.setAttribute("stop-opacity", "0.45");
			};

			const linkTitle = path.createSvg("title");
			linkTitle.textContent = `${link.source} → ${link.target}: ${link.value} application${link.value === 1 ? "" : "s"}`;
		}

		// Draw Nodes
		const nodesGroup = svg.createSvg("g", { cls: "job-tracker-sankey-nodes" });

		for (const node of nodeMap.values()) {
			const g = nodesGroup.createSvg("g", { cls: "job-tracker-sankey-node" });

			// Rect
			g.createSvg("rect", {
				attr: {
					x: `${node.x}`,
					y: `${node.y}`,
					width: `${node.width}`,
					height: `${node.height}`,
					rx: "3",
					ry: "3",
					fill: node.color,
					stroke: "var(--background-primary, #ffffff)",
					"stroke-width": "1",
				},
			});

			// Text Label
			const isRightSide = node.layer === maxLayer;
			let labelX = `${node.x + node.width / 2}`;
			let labelY = `${Math.max(14, node.y - 6)}`;
			let textAnchor = "middle";

			if (isRightSide) {
				labelX = `${node.x + node.width + 8}`;
				labelY = `${node.y + node.height / 2 + 4}`;
				textAnchor = "start";
			} else if (node.layer === 0) {
				labelX = `${node.x - 8}`;
				labelY = `${node.y + node.height / 2 + 4}`;
				textAnchor = "end";
			}

			const labelText = g.createSvg("text", {
				attr: {
					"font-size": "11px",
					"font-family": "var(--font-default, sans-serif)",
					fill: "var(--text-normal, #dcddde)",
					"font-weight": "500",
					x: labelX,
					y: labelY,
					"text-anchor": textAnchor,
				},
			});
			labelText.textContent = this.formatDisplayLabel(node.label, node.value);

			const nodeTitle = g.createSvg("title");
			nodeTitle.textContent = `${node.label}: ${node.value} application${node.value === 1 ? "" : "s"}`;
		}
	}
}
