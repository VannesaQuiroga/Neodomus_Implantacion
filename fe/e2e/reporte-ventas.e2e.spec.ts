import { writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}; ejecutar mediante scripts/e2e_reporte_ventas.py`);
  return value;
};

const login = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.getByPlaceholder('Correo electrónico', { exact: true }).fill(email);
  await page.getByPlaceholder('Contraseña', { exact: true }).fill(password);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST',
  );
  await page.locator('button.btn-login-submit').click();
  expect((await response).status()).toBe(200);
  await page.waitForURL(/\/dashboard\/admin$/);
};

test('descarga PDF de ventas con filtros y contraste de totales', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'));
  await page.goto('/admin/reportes');

  const desde = page.locator('input[type="date"]').first();
  const hasta = page.locator('input[type="date"]').nth(1);
  await desde.fill('2020-03-01');
  await hasta.fill('2020-03-31');

  const pdfResponse = page.waitForResponse(
    (r) => r.url().includes('/api/v1/reports/pdf') && r.request().method() === 'GET',
  );
  await page.getByRole('button', { name: /Descargar/i }).click();
  const response = await pdfResponse;
  expect(response.status()).toBe(200);

  const body = await response.body();
  writeFileSync(required('E2E_REPORTE_PATH'), body);
});
