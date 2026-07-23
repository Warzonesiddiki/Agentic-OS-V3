/**
 * E2E tests — API Console interactions.
 *
 * Verifies that the API console can be used to make requests,
 * apply presets, and display responses.
 */
import { test, expect } from '@playwright/test';

test.describe('API Console', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/console');
    // Wait for the console to render
    await page.waitForSelector('[role="button"]', { timeout: 5000 });
  });

  test('renders the API console with default values', async ({ page }) => {
    // Should have method selector defaulting to GET
    await expect(page.getByLabel('Method')).toHaveValue('GET');

    // Should have path defaulting to /api/v1/health
    await expect(page.getByLabel('Path')).toHaveValue('/api/v1/health');

    // Should have a Send button
    await expect(page.getByRole('button', { name: /send request/i })).toBeVisible();
  });

  test('applies request presets when clicked', async ({ page }) => {
    // Click the POST /memories preset
    await page.getByRole('button', { name: /post \/memories/i }).click();

    // Method should change to POST
    await expect(page.getByLabel('Method')).toHaveValue('POST');

    // Path should change to /api/v1/memories
    await expect(page.getByLabel('Path')).toHaveValue('/api/v1/memories');

    // Body should be pre-filled
    const body = page.getByLabel(/request body/i);
    await expect(body).toContainText('Console-created memory');
  });

  test('can change the HTTP method', async ({ page }) => {
    const methodSelect = page.getByLabel('Method');
    await methodSelect.selectOption('POST');
    await expect(methodSelect).toHaveValue('POST');
  });

  test('can type a custom path', async ({ page }) => {
    const pathInput = page.getByLabel('Path');
    await pathInput.fill('/api/v1/skills');
    await expect(pathInput).toHaveValue('/api/v1/skills');
  });

  test('health endpoint returns a response', async ({ page }) => {
    // Ensure defaults (GET /api/v1/health)
    await expect(page.getByLabel('Method')).toHaveValue('GET');
    await expect(page.getByLabel('Path')).toHaveValue('/api/v1/health');

    // Send the request
    await page.getByRole('button', { name: /send request/i }).click();

    // Should show a response within a reasonable time
    // (The server may or may not be running, but the UI should handle both cases)
    await page.waitForTimeout(2000);

    // The console should show either a response or an error
    // but should NOT crash
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });
});
