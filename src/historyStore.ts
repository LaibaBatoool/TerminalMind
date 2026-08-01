import * as fs from "fs";
import { HISTORY_FILE } from "./config";
import { ResolvedErrorRecord } from "./types";

export function loadHistory(): ResolvedErrorRecord[] {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
}

export function appendHistory(record: ResolvedErrorRecord): void {
    const existing = loadHistory();
    existing.push(record);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(existing, null, 2));
}