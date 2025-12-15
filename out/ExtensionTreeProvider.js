import * as vscode from "vscode";
export var ExtensionStatus;
(function (ExtensionStatus) {
    ExtensionStatus["Pending"] = "pending";
    ExtensionStatus["Installing"] = "installing";
    ExtensionStatus["Success"] = "success";
    ExtensionStatus["Failed"] = "failed";
    ExtensionStatus["AlreadyInstalled"] = "alreadyInstalled";
})(ExtensionStatus || (ExtensionStatus = {}));
export class ExtensionItem extends vscode.TreeItem {
    constructor(extensionData, settingsData) {
        super(extensionData.displayName || extensionData.id, vscode.TreeItemCollapsibleState.None);
        this.extensionData = extensionData;
        this.status = ExtensionStatus.Pending;
        this.selected = true;
        this.id = extensionData.id;
        this.settingsData = settingsData;
        // Show description as secondary text (more useful than just ID)
        this.description = extensionData.description
            ? extensionData.description.length > 50
                ? extensionData.description.substring(0, 47) + "..."
                : extensionData.description
            : extensionData.id;
        // Rich tooltip with all details
        const tooltipLines = [
            `**${extensionData.displayName || extensionData.id}**`,
            "",
            `**ID:** ${extensionData.id}`,
        ];
        if (extensionData.publisher) {
            tooltipLines.push(`**Publisher:** ${extensionData.publisher}`);
        }
        if (extensionData.version) {
            tooltipLines.push(`**Version:** ${extensionData.version}`);
        }
        if (extensionData.description) {
            tooltipLines.push("", extensionData.description);
        }
        this.tooltip = new vscode.MarkdownString(tooltipLines.join("\n"));
        this.contextValue = "extensionItem";
        this.updateCheckbox();
        this.iconPath = new vscode.ThemeIcon("extensions");
        // Special handling for Settings item
        if (this.id === "settings") {
            this.iconPath = new vscode.ThemeIcon("settings-gear");
            this.contextValue = "settingsItem";
        }
    }
    updateCheckbox() {
        this.checkboxState = this.selected
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;
    }
    updateIcon() {
        switch (this.status) {
            case ExtensionStatus.Success:
                this.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"));
                break;
            case ExtensionStatus.Failed:
                this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
                this.command = {
                    command: "vscode-extension-manager.showError",
                    title: "Show Error",
                    arguments: [this],
                };
                break;
            case ExtensionStatus.Installing:
                this.iconPath = new vscode.ThemeIcon("sync~spin");
                break;
            case ExtensionStatus.AlreadyInstalled:
                this.iconPath = new vscode.ThemeIcon("verified", new vscode.ThemeColor("testing.iconPassed"));
                break;
            default:
                this.iconPath =
                    this.id === "settings"
                        ? new vscode.ThemeIcon("settings-gear")
                        : new vscode.ThemeIcon("extensions");
        }
    }
}
export class ExtensionTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.extensions = [];
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.extensions);
    }
    loadExtensions(extensionDataList) {
        this.extensions = extensionDataList.map((data) => new ExtensionItem(data));
        this.refresh();
    }
    addSettingsItem(settingsData) {
        // Remove existing settings item if any
        this.extensions = this.extensions.filter((e) => e.id !== "settings");
        const settingsItem = new ExtensionItem({
            id: "settings",
            displayName: "VS Code Settings",
            description: "User settings.json configuration",
            publisher: "User",
            version: "Current",
        }, settingsData);
        // Add to top or bottom? Top seems better for visibility.
        this.extensions.unshift(settingsItem);
        this.refresh();
    }
    getExtensions() {
        return this.extensions;
    }
    getSelectedExtensions() {
        return this.extensions.filter((ext) => ext.selected);
    }
    selectAll() {
        this.extensions.forEach((ext) => {
            ext.selected = true;
            ext.updateCheckbox();
        });
        this.refresh();
    }
    deselectAll() {
        this.extensions.forEach((ext) => {
            ext.selected = false;
            ext.updateCheckbox();
        });
        this.refresh();
    }
    updateExtensionStatus(id, status, errorMessage) {
        const ext = this.extensions.find((e) => e.id === id);
        if (ext) {
            ext.status = status;
            ext.errorMessage = errorMessage;
            ext.updateIcon();
            this._onDidChangeTreeData.fire(ext);
        }
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    handleCheckboxChange(item, state) {
        item.selected = state === vscode.TreeItemCheckboxState.Checked;
        item.updateCheckbox();
    }
}
//# sourceMappingURL=ExtensionTreeProvider.js.map