"use client";

/**
 * Waitlist overlay control — a simple module-level registry so any component
 * can trigger the overlay without prop-drilling or a heavy context tree.
 */

let _showOverlay: (() => void) | null = null;
let _hideOverlay: (() => void) | null = null;

export function registerOverlay(show: () => void, hide: () => void): void {
  _showOverlay = show;
  _hideOverlay = hide;
}

export function showWaitlist(): void {
  _showOverlay?.();
}

export function hideWaitlist(): void {
  _hideOverlay?.();
}
