import { expect, type Page } from '@playwright/test';

/** Opens every component's values in the overlay, which starts with them all closed. */
export async function openAllValues(page: Page): Promise<void> {
  await expect(page.locator('[data-values]').first()).toBeVisible();
  // Opening values adds no (+), so one pass opens them all.
  const closed = page.locator('[data-values][aria-expanded="false"]');
  await closed.evaluateAll((buttons) => buttons.forEach((b) => (b as HTMLElement).click()));
  await expect(closed).toHaveCount(0);
}

/** Loads the page with the overlay's values beside the tree, below a divider. */
export async function gotoValuesBeside(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem('runespect:overlayValues', JSON.stringify('Beside the tree')),
  );
  await page.reload();
}
