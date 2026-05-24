import {
	App,
	ItemView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CodeReferenceSettings {
	snippetsFolder: string;
	patternsFolder: string;
}

const DEFAULT_SETTINGS: CodeReferenceSettings = {
	snippetsFolder: "Code/Snippets",
	patternsFolder: "Code/Patterns",
};

type Language =
	| "JavaScript"
	| "TypeScript"
	| "Python"
	| "Go"
	| "Rust"
	| "SQL"
	| "Shell"
	| "Other";

const LANGUAGES: Language[] = [
	"JavaScript",
	"TypeScript",
	"Python",
	"Go",
	"Rust",
	"SQL",
	"Shell",
	"Other",
];

const LANG_HIGHLIGHT: Record<Language, string> = {
	JavaScript: "javascript",
	TypeScript: "typescript",
	Python: "python",
	Go: "go",
	Rust: "rust",
	SQL: "sql",
	Shell: "bash",
	Other: "",
};

type PatternCategory =
	| "architecture"
	| "design-pattern"
	| "algorithm"
	| "data-structure"
	| "other";

const PATTERN_CATEGORIES: PatternCategory[] = [
	"architecture",
	"design-pattern",
	"algorithm",
	"data-structure",
	"other",
];

const VIEW_TYPE_CODE_REF = "code-reference-sidebar";

// ─── Sidebar View ────────────────────────────────────────────────────────────

class CodeRefView extends ItemView {
	plugin: CodeReferencePlugin;
	private activeTab: "snippets" | "patterns" = "snippets";
	private filterLang = "";

	constructor(leaf: WorkspaceLeaf, plugin: CodeReferencePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() { return VIEW_TYPE_CODE_REF; }
	getDisplayText() { return "Code Reference"; }
	getIcon() { return "code-2"; }

	async onOpen() { await this.render(); }
	async onClose() {}

	async render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("crl-container");

		const header = contentEl.createDiv({ cls: "crl-header" });
		header.createEl("h2", { text: "Code Reference" });
		const addBtn = header.createEl("button", { text: "+", cls: "crl-btn-primary" });
		addBtn.title = "New Snippet";
		addBtn.onclick = () => new SnippetModal(this.app, this.plugin, () => this.render()).open();

		const tabs = contentEl.createDiv({ cls: "crl-tabs" });
		const makeTab = (label: string, tab: "snippets" | "patterns") => {
			const btn = tabs.createEl("button", { text: label, cls: "crl-tab" });
			if (this.activeTab === tab) btn.addClass("active");
			btn.onclick = () => { this.activeTab = tab; this.render(); };
		};
		makeTab("Snippets", "snippets");
		makeTab("Patterns", "patterns");

		const filter = contentEl.createEl("input", {
			cls: "crl-filter",
			placeholder: "Filter by language...",
		}) as HTMLInputElement;
		filter.value = this.filterLang;
		filter.oninput = () => { this.filterLang = filter.value; this.renderCards(list); };

		const list = contentEl.createDiv({ cls: "crl-list" });
		await this.renderCards(list);
	}

	async renderCards(container: HTMLElement) {
		container.empty();
		const folder =
			this.activeTab === "snippets"
				? this.plugin.settings.snippetsFolder
				: this.plugin.settings.patternsFolder;

		const files = this.app.vault.getMarkdownFiles().filter((f) =>
			f.path.startsWith(folder + "/")
		);

		const langFilter = this.filterLang.toLowerCase().trim();

		const cards: { file: TFile; lang: string; fw: string; desc: string }[] = [];
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter ?? {};
			const lang: string = fm["language"] ?? fm["languages"] ?? "";
			const fw: string = fm["framework"] ?? "";
			const desc: string = fm["description"] ?? "";
			if (langFilter && !lang.toLowerCase().includes(langFilter)) continue;
			cards.push({ file, lang, fw, desc });
		}

		if (cards.length === 0) {
			container.createEl("p", { cls: "crl-empty", text: "No entries found." });
			return;
		}

		for (const { file, lang, fw, desc } of cards) {
			const card = container.createDiv({ cls: "crl-card" });
			const title = card.createDiv({ cls: "crl-card-title", text: file.basename });
			title.onclick = () => this.app.workspace.openLinkText(file.path, "", false);

			const meta = card.createDiv({ cls: "crl-card-meta" });
			if (lang) meta.createSpan({ cls: "crl-badge crl-badge-lang", text: lang });
			if (fw) meta.createSpan({ cls: "crl-badge", text: fw });

			if (desc) card.createDiv({ cls: "crl-card-desc", text: desc });
		}
	}
}

// ─── New Snippet Modal ───────────────────────────────────────────────────────

class SnippetModal extends Modal {
	plugin: CodeReferencePlugin;
	onSave: () => void;

	private title = "";
	private language: Language = "JavaScript";
	private framework = "";
	private tags = "";
	private description = "";
	private code = "";

	constructor(app: App, plugin: CodeReferencePlugin, onSave: () => void) {
		super(app);
		this.plugin = plugin;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("crl-modal");
		contentEl.createEl("h2", { text: "New Code Snippet" });

		new Setting(contentEl).setName("Title").addText((t) => {
			t.setPlaceholder("e.g. Debounce function").onChange((v) => (this.title = v));
		});

		new Setting(contentEl).setName("Language").addDropdown((d) => {
			LANGUAGES.forEach((l) => d.addOption(l, l));
			d.setValue(this.language);
			d.onChange((v) => (this.language = v as Language));
		});

		new Setting(contentEl).setName("Framework / Library (optional)").addText((t) => {
			t.setPlaceholder("e.g. React, Lodash").onChange((v) => (this.framework = v));
		});

		new Setting(contentEl).setName("Tags (comma-separated)").addText((t) => {
			t.setPlaceholder("e.g. async, utility").onChange((v) => (this.tags = v));
		});

		new Setting(contentEl).setName("Description").addTextArea((t) => {
			t.inputEl.addClass("crl-textarea");
			t.inputEl.rows = 3;
			t.setPlaceholder("What does this snippet do?").onChange((v) => (this.description = v));
		});

		new Setting(contentEl).setName("Code").addTextArea((t) => {
			t.inputEl.addClass("crl-textarea");
			t.inputEl.rows = 8;
			t.setPlaceholder("Paste your code here...").onChange((v) => (this.code = v));
		});

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Save Snippet").setCta().onClick(() => this.save())
		);
	}

	async save() {
		if (!this.title.trim()) { new Notice("Title is required."); return; }

		const folder = this.plugin.settings.snippetsFolder;
		await this.app.vault.createFolder(folder).catch(() => {});

		const tagList = this.tags
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean)
			.map((t) => `"${t}"`)
			.join(", ");

		const highlight = LANG_HIGHLIGHT[this.language] ?? "";
		const date = new Date().toISOString().split("T")[0];

		const lines: string[] = [
			"---",
			`title: "${this.title}"`,
			`language: ${this.language}`,
		];
		if (this.framework) lines.push(`framework: "${this.framework}"`);
		if (tagList) lines.push(`tags: [${tagList}]`);
		lines.push(`description: "${this.description.replace(/"/g, '\\"')}"`);
		lines.push(`created: ${date}`);
		lines.push("---", "", `## ${this.title}`, "");
		if (this.description) lines.push(this.description, "");
		lines.push(`\`\`\`${highlight}`, this.code, "```", "", "## Links", "", "- ");

		const safeName = this.title.replace(/[\\/:*?"<>|]/g, "-");
		const path = `${folder}/${safeName}.md`;
		if (this.app.vault.getAbstractFileByPath(path)) {
			new Notice("A snippet with that name already exists."); return;
		}

		await this.app.vault.create(path, lines.join("\n"));
		new Notice(`Snippet "${this.title}" saved.`);
		this.close();
		this.onSave();
	}

	onClose() { this.contentEl.empty(); }
}

// ─── New Pattern Modal ───────────────────────────────────────────────────────

class PatternModal extends Modal {
	plugin: CodeReferencePlugin;
	onSave: () => void;

	private title = "";
	private category: PatternCategory = "design-pattern";
	private languages = "";
	private description = "";
	private example = "";

	constructor(app: App, plugin: CodeReferencePlugin, onSave: () => void) {
		super(app);
		this.plugin = plugin;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("crl-modal");
		contentEl.createEl("h2", { text: "New Code Pattern" });

		new Setting(contentEl).setName("Title").addText((t) => {
			t.setPlaceholder("e.g. Observer Pattern").onChange((v) => (this.title = v));
		});

		new Setting(contentEl).setName("Category").addDropdown((d) => {
			PATTERN_CATEGORIES.forEach((c) => d.addOption(c, c));
			d.setValue(this.category);
			d.onChange((v) => (this.category = v as PatternCategory));
		});

		new Setting(contentEl).setName("Applicable Languages (comma-separated)").addText((t) => {
			t.setPlaceholder("e.g. JavaScript, Python").onChange((v) => (this.languages = v));
		});

		new Setting(contentEl).setName("Description").addTextArea((t) => {
			t.inputEl.addClass("crl-textarea");
			t.inputEl.rows = 4;
			t.setPlaceholder("Describe the pattern...").onChange((v) => (this.description = v));
		});

		new Setting(contentEl).setName("Example Code").addTextArea((t) => {
			t.inputEl.addClass("crl-textarea");
			t.inputEl.rows = 8;
			t.setPlaceholder("Example implementation...").onChange((v) => (this.example = v));
		});

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Save Pattern").setCta().onClick(() => this.save())
		);
	}

	async save() {
		if (!this.title.trim()) { new Notice("Title is required."); return; }

		const folder = this.plugin.settings.patternsFolder;
		await this.app.vault.createFolder(folder).catch(() => {});

		const langList = this.languages
			.split(",")
			.map((l) => l.trim())
			.filter(Boolean);

		const date = new Date().toISOString().split("T")[0];

		const lines: string[] = [
			"---",
			`title: "${this.title}"`,
			`category: ${this.category}`,
			`languages: [${langList.map((l) => `"${l}"`).join(", ")}]`,
			`description: "${this.description.replace(/"/g, '\\"')}"`,
			`created: ${date}`,
			"---",
			"",
			`## ${this.title}`,
			"",
			`**Category:** ${this.category}`,
		];
		if (langList.length > 0) lines.push(`**Languages:** ${langList.join(", ")}`);
		lines.push("", "### Description", "", this.description, "", "### Example", "", "```", this.example, "```");

		const safeName = this.title.replace(/[\\/:*?"<>|]/g, "-");
		const path = `${folder}/${safeName}.md`;
		if (this.app.vault.getAbstractFileByPath(path)) {
			new Notice("A pattern with that name already exists."); return;
		}

		await this.app.vault.create(path, lines.join("\n"));
		new Notice(`Pattern "${this.title}" saved.`);
		this.close();
		this.onSave();
	}

	onClose() { this.contentEl.empty(); }
}

// ─── Search by Tag Modal ─────────────────────────────────────────────────────

class SearchTagModal extends Modal {
	plugin: CodeReferencePlugin;

	constructor(app: App, plugin: CodeReferencePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Search by Tag" });

		let tagQuery = "";
		new Setting(contentEl).setName("Tag").addText((t) => {
			t.setPlaceholder("e.g. async").onChange((v) => (tagQuery = v.trim().toLowerCase()));
		});

		const results = contentEl.createDiv();

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Search").setCta().onClick(() => {
				results.empty();
				if (!tagQuery) { results.createEl("p", { text: "Enter a tag to search." }); return; }

				const allFolders = [
					this.plugin.settings.snippetsFolder,
					this.plugin.settings.patternsFolder,
				];

				const matches: TFile[] = [];
				for (const file of this.app.vault.getMarkdownFiles()) {
					if (!allFolders.some((f) => file.path.startsWith(f + "/"))) continue;
					const cache = this.app.metadataCache.getFileCache(file);
					const fm = cache?.frontmatter ?? {};
					const tags: string[] = Array.isArray(fm["tags"])
						? fm["tags"]
						: typeof fm["tags"] === "string"
						? [fm["tags"]]
						: [];
					if (tags.some((t: string) => t.toLowerCase().includes(tagQuery))) {
						matches.push(file);
					}
				}

				if (matches.length === 0) {
					results.createEl("p", { cls: "crl-empty", text: "No matches found." });
					return;
				}

				results.createEl("p", { text: `${matches.length} result(s):` });
				const list = results.createDiv({ cls: "crl-list" });
				for (const file of matches) {
					const card = list.createDiv({ cls: "crl-card" });
					const link = card.createDiv({ cls: "crl-card-title", text: file.basename });
					link.onclick = () => {
						this.app.workspace.openLinkText(file.path, "", false);
						this.close();
					};
					const isSnippet = file.path.startsWith(this.plugin.settings.snippetsFolder + "/");
					card.createDiv({ cls: "crl-card-desc", text: isSnippet ? "Snippet" : "Pattern" });
				}
			})
		);
	}

	onClose() { this.contentEl.empty(); }
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

class CodeReferenceSettingTab extends PluginSettingTab {
	plugin: CodeReferencePlugin;

	constructor(app: App, plugin: CodeReferencePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Code Reference Library Settings" });

		new Setting(containerEl)
			.setName("Snippets folder")
			.setDesc("Folder where code snippets are stored.")
			.addText((t) =>
				t.setValue(this.plugin.settings.snippetsFolder).onChange(async (v) => {
					this.plugin.settings.snippetsFolder = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Patterns folder")
			.setDesc("Folder where code patterns are stored.")
			.addText((t) =>
				t.setValue(this.plugin.settings.patternsFolder).onChange(async (v) => {
					this.plugin.settings.patternsFolder = v;
					await this.plugin.saveSettings();
				})
			);
	}
}

// ─── Main Plugin ─────────────────────────────────────────────────────────────

export default class CodeReferencePlugin extends Plugin {
	settings: CodeReferenceSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_CODE_REF, (leaf) => new CodeRefView(leaf, this));

		this.addRibbonIcon("code-2", "Code Reference Library", () => this.activateSidebar());

		this.addCommand({
			id: "open-sidebar",
			name: "Open Reference Sidebar",
			callback: () => this.activateSidebar(),
		});

		this.addCommand({
			id: "new-snippet",
			name: "New Snippet",
			callback: () => new SnippetModal(this.app, this, () => this.refreshSidebar()).open(),
		});

		this.addCommand({
			id: "new-pattern",
			name: "New Pattern",
			callback: () => new PatternModal(this.app, this, () => this.refreshSidebar()).open(),
		});

		this.addCommand({
			id: "search-by-tag",
			name: "Search by Tag",
			callback: () => new SearchTagModal(this.app, this).open(),
		});

		this.addSettingTab(new CodeReferenceSettingTab(this.app, this));
	}

	async activateSidebar() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CODE_REF);
		if (existing.length) { this.app.workspace.revealLeaf(existing[0]); return; }
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_CODE_REF, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	refreshSidebar() {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_CODE_REF).forEach((leaf) => {
			if (leaf.view instanceof CodeRefView) leaf.view.render();
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() { await this.saveData(this.settings); }
}
