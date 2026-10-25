import { test, expect } from '@playwright/test';

async function signIn(page, email = 'buyer@example.com') {
  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Find your next adventure.' })).toBeVisible();
  await expect(page.getByRole('article').first()).toBeVisible();
}

test('buyer searches, purchases the last unit, and signs out', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Manage inventory' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/desktop-dashboard.png', fullPage: true });
  const response = await page.request.get('/');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.getByRole('article', { name: 'Honda CR-V' }).getByRole('button', { name: 'Out of stock' })).toBeDisabled();
  await page.getByLabel('In stock only').check();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toHaveAttribute('aria-label', 'Toyota Camry');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByLabel('In stock only')).not.toBeChecked();
  await page.getByLabel('Make', { exact: true }).fill('toy');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Purchase', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm purchase', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Purchase confirmed' })).toBeVisible();
  await expect(page.getByRole('article').getByRole('button', { name: 'Out of stock' })).toBeDisabled();
  await page.getByLabel('Make', { exact: true }).fill('no-match');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No matches just yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('admin adds, edits, restocks and deletes a vehicle', async ({ page }) => {
  await signIn(page, 'admin@example.com');
  await page.getByLabel('In stock only').check();
  await page.getByRole('button', { name: 'Manage inventory' }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: '+ Add vehicle', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Make', { exact: true }).fill('Mazda');
  await dialog.getByLabel('Model', { exact: true }).fill('CX-5');
  await dialog.getByLabel('Category', { exact: true }).fill('SUV');
  await dialog.getByLabel('Price (INR)').fill('32000');
  await dialog.getByLabel('Stock quantity').fill('2');
  await dialog.getByRole('button', { name: 'Add vehicle', exact: true }).click();
  let card = page.getByRole('article', { name: 'Mazda CX-5' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Model', { exact: true }).fill('CX-50');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  card = page.getByRole('article', { name: 'Mazda CX-50' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Restock', exact: true }).click();
  await dialog.getByLabel('Quantity', { exact: true }).fill('3');
  await dialog.getByRole('button', { name: 'Add stock' }).click();
  await expect(card).toContainText('5 in stock');
  await page.screenshot({ path: 'test-results/admin-dashboard.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await card.getByRole('button', { name: 'Delete vehicle' }).click();
  await page.screenshot({ path: 'test-results/mobile-admin-dialog.png' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Delete vehicle' }).click();
  await dialog.getByRole('button', { name: 'Delete vehicle', exact: true }).click();
  await expect(card).toHaveCount(0);
});

test('mobile layout, retry and expired session handling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-dashboard.png', fullPage: true });
  await page.route('**/api/vehicles/search*', route => route.fulfill({ status: 503, json: { message: 'Service temporarily unavailable.' } }));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Service temporarily unavailable.');
  await page.unroute('**/api/vehicles/search*');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('article').first()).toBeVisible();
  await page.route('**/api/vehicles/search*', route => route.fulfill({ status: 401, json: { message: 'Expired' } }));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Your session has expired');
});

test('registration enters dashboard and refresh clears the session', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Full name').fill('New Driver');
  await page.getByLabel('Email address').fill('newdriver@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-123');
  await page.getByRole('button', { name: 'Create account', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Find your next adventure.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});

test('theme persists and vehicle images can be added, replaced and removed', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await signIn(page, 'admin@example.com');
  await expect(page.getByText('Welcome back,', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Manage inventory' }).click();
  // Deterministic image response keeps the test independent of external image hosts.
  await page.route('https://images.example.com/car.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX2kAAAAASUVORK5CYII=', 'base64') }));
  await page.route('https://images.example.com/broken.png', route => route.fulfill({ status: 404, body: '' }));
  const card = page.getByRole('article', { name: 'Toyota Camry' });
  await expect(card.getByText('Illustration')).toBeVisible();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Vehicle image URL (optional)').fill('https://images.example.com/car.png');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.getByRole('img')).toBeVisible();
  expect(await card.getByRole('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(dialog.getByLabel('Vehicle image URL (optional)')).toHaveValue('https://images.example.com/car.png');
  await dialog.getByLabel('Vehicle image URL (optional)').fill('https://images.example.com/broken.png');
  await expect(dialog.getByRole('alert')).toContainText('could not load as an image');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.getByText('Illustration')).toBeVisible();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove image' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.getByText('Illustration')).toBeVisible();
  await page.screenshot({ path: 'test-results/dark-dashboard.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/dark-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('customer collection tabs, sorting, layout and details work', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('link', { name: /Home|Browse Cars|My Garage|Compare/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'SUV (1)', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toHaveAttribute('aria-label', 'Honda CR-V');
  await page.getByRole('button', { name: 'All (2)', exact: true }).click();
  await page.getByLabel('Sort vehicles').selectOption('price-desc');
  await expect(page.getByRole('article').first()).toHaveAttribute('aria-label', 'Honda CR-V');
  await page.getByLabel('Sort vehicles').selectOption('price-asc');
  await expect(page.getByRole('article').first()).toHaveAttribute('aria-label', 'Toyota Camry');
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Vehicles', exact: true })).toHaveClass(/showroom-list/);
  await page.getByRole('article').first().getByRole('button', { name: 'View Details' }).click();
  await expect(page.getByRole('dialog')).toContainText('Toyota');
  await expect(page.getByRole('dialog')).toContainText('Sedan');
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.screenshot({ path: 'test-results/customer-dark.png', fullPage: true });
});
