import { Fragment, createElement, type ReactNode } from "react";
import { en, type Dict } from "./en";
import { pt } from "./pt";

export type { Dict } from "./en";

export type Lang = "en" | "pt";

export const dictionaries: Record<Lang, Dict> = { en, pt };

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "pt";
}

/** Replaces "{token}" placeholders with plain strings. */
export function fillStr(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

/** Replaces "{token}" placeholders with React nodes, for rich inline content. */
export function fill(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, index) => {
    const match = /^\{(\w+)\}$/.exec(part);
    if (!match) return part;
    return createElement(Fragment, { key: index }, values[match[1]] ?? part);
  });
}

export interface SplitError {
  code: "assignRun" | "needShoe" | "positiveKm" | "underBy" | "overBy" | "exceedDistance";
  km?: string;
}

export function splitErrorText(error: SplitError, dict: Dict): string {
  const template = dict.errors[error.code];
  return error.km != null ? fillStr(template, { km: error.km }) : template;
}
