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
		const width = container.clientWidth || 900;
		const height = Math.max(400, width * 0.55);
		const paddingX = 80;
		const paddingY = 36;
		const nodeWidth = 14;
		const nodeGap = 16;

		const usableWidth = width - paddingX * 2;
		const usableHeight = height - paddingY * 2;
		const layerXStep = maxLayer > 0 ? usableWidth / maxLayer : usableWidth;

		// Compute positions for each column
		for (let layer = 0; layer <= maxLayer; layer++) {
			const nodeIds = layerGroups.get(layer) || [];
			if (nodeIds.length === 0) continue;

			const totalValue = nodeIds.reduce((sum, id) => sum + (nodeMap.get(id)?.value || 0), 0);
			const availableHeight = usableHeight - (nodeIds.length - 1) * nodeGap;
			const pixelsPerUnit = totalValue > 0 ? Math.min(30, availableHeight / totalValue) : 20;

			// Total height of this column
			let columnHeight = 0;
			for (const id of nodeIds) {
				const n = nodeMap.get(id)!;
				n.height = Math.max(16, n.value * pixelsPerUnit);
				columnHeight += n.height;
			}
			columnHeight += (nodeIds.length - 1) * nodeGap;

			// Vertically center column
			let currentY = paddingY + (usableHeight - columnHeight) / 2;
			const currentX = paddingX + layer * layerXStep;

			for (const id of nodeIds) {
				const n = nodeMap.get(id)!;
				n.x = currentX;
				n.y = currentY;
				currentY += n.height + nodeGap;
			}
		}

		// 4. Build SVG
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
		svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
		svg.setAttribute("class", "job-tracker-native-sankey-svg");
		svg.style.width = "100%";
		svg.style.maxWidth = `${width}px`;
		svg.style.overflow = "visible";

		// Definitions for gradients & filters
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		svg.appendChild(defs);

		// Track offsets for multiple links connecting to/from the same node
		const sourceOffsets = new Map<string, number>();
		const targetOffsets = new Map<string, number>();

		// Draw Links (Ribbons)
		const linksGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
		linksGroup.setAttribute("class", "job-tracker-sankey-links");
		svg.appendChild(linksGroup);

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
			const gradId = `sankey-grad-${Math.random().toString(36).substr(2, 9)}`;
			const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
			grad.setAttribute("id", gradId);
			grad.setAttribute("gradientUnits", "userSpaceOnUse");
			grad.setAttribute("x1", `${x0}`);
			grad.setAttribute("y1", `${y0}`);
			grad.setAttribute("x2", `${x1}`);
			grad.setAttribute("y2", `${y1}`);

			const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
			stop1.setAttribute("offset", "0%");
			stop1.setAttribute("stop-color", sourceNode.color);
			stop1.setAttribute("stop-opacity", "0.45");

			const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
			stop2.setAttribute("offset", "100%");
			stop2.setAttribute("stop-color", targetNode.color);
			stop2.setAttribute("stop-opacity", "0.45");

			grad.appendChild(stop1);
			grad.appendChild(stop2);
			defs.appendChild(grad);

			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", pathData);
			path.setAttribute("fill", `url(#${gradId})`);
			path.setAttribute("class", "job-tracker-sankey-ribbon");

			// Interactive hover
			path.onmouseenter = () => {
				stop1.setAttribute("stop-opacity", "0.85");
				stop2.setAttribute("stop-opacity", "0.85");
			};
			path.onmouseleave = () => {
				stop1.setAttribute("stop-opacity", "0.45");
				stop2.setAttribute("stop-opacity", "0.45");
			};

			const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
			title.textContent = `${link.source} → ${link.target}: ${link.value} application${link.value === 1 ? "" : "s"}`;
			path.appendChild(title);

			linksGroup.appendChild(path);
		}

		// Draw Nodes
		const nodesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
		nodesGroup.setAttribute("class", "job-tracker-sankey-nodes");
		svg.appendChild(nodesGroup);

		for (const node of nodeMap.values()) {
			const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
			g.setAttribute("class", "job-tracker-sankey-node");

			// Rect
			const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			rect.setAttribute("x", `${node.x}`);
			rect.setAttribute("y", `${node.y}`);
			rect.setAttribute("width", `${node.width}`);
			rect.setAttribute("height", `${node.height}`);
			rect.setAttribute("rx", "3");
			rect.setAttribute("ry", "3");
			rect.setAttribute("fill", node.color);
			rect.setAttribute("stroke", "var(--background-primary, #ffffff)");
			rect.setAttribute("stroke-width", "1");
			g.appendChild(rect);

			// Text Label
			const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
			const isRightSide = node.layer === maxLayer;

			text.setAttribute("y", `${node.y + node.height / 2 + 4}`);
			text.setAttribute("font-size", "11px");
			text.setAttribute("font-family", "var(--font-default, sans-serif)");
			text.setAttribute("fill", "var(--text-normal, #dcddde)");
			text.setAttribute("font-weight", "500");

			if (isRightSide) {
				text.setAttribute("x", `${node.x + node.width + 8}`);
				text.setAttribute("text-anchor", "start");
			} else if (node.layer === 0) {
				text.setAttribute("x", `${node.x - 8}`);
				text.setAttribute("text-anchor", "end");
			} else {
				text.setAttribute("x", `${node.x + node.width / 2}`);
				text.setAttribute("y", `${node.y - 6}`);
				text.setAttribute("text-anchor", "middle");
			}

			text.textContent = `${node.label} (${node.value})`;
			g.appendChild(text);

			const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
			title.textContent = `${node.label}: ${node.value} applications`;
			g.appendChild(title);

			nodesGroup.appendChild(g);
		}

		container.appendChild(svg);
	}
}
