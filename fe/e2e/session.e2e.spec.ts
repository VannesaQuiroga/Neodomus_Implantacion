import { test, expect } from '@playwright/test';

test('recarga restaura sesión por bearer y conserva corte en carrito', async ({ page, context }) => {
  const { E2E_SESSION_EMAIL: email, E2E_SESSION_PASSWORD: password, E2E_SESSION_PRODUCT: product } = process.env;
  if (!email || !password || !product) throw new Error('Ejecutar mediante scripts/e2e_session.py con fixtures aislados');
  await page.goto('/login');
  await page.getByPlaceholder('Correo electrónico', { exact: true }).fill(email);
  await page.getByPlaceholder('Contraseña', { exact: true }).fill(password);
  await page.locator('button.btn-login-submit').click();
  await expect(page.locator('.user-welcome')).toBeVisible();
  // Sin cookies, la restauración solo puede usar el token real de esta pestaña.
  await context.clearCookies();
  const session = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/session') && r.request().method() === 'GET');
  await page.goto(`/producto/${product}`);
  expect((await session).status()).toBe(200);
  await expect(page.locator('.user-welcome')).toBeVisible();
  await page.getByRole('textbox', { name: 'Metros por unidad' }).fill('1,5');
  await page.locator('button.detalle-agregar-btn').click();
  await page.locator('button.cart-button').click();
  await expect(page).toHaveURL(/\/carrito/);
  const metros = page.getByRole('textbox', { name: 'Metros por unidad' });
  await expect(metros).toHaveValue(/1[.,]5/);
  await metros.fill('2,5');
  await metros.press('Tab');
  const restored = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/session') && r.request().method() === 'GET');
  await page.reload();
  expect((await restored).status()).toBe(200);
  await expect(page.locator('.user-welcome')).toBeVisible();
  await expect(metros).toHaveValue(/2[.,]5/);
  await page.locator('button.carrito-finalizar-btn').click();
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.locator('.checkout-resumen-items')).toContainText(/2[.,]5 m/);
  await expect(page.locator('button.checkout-pagar-btn')).toBeVisible();
});
