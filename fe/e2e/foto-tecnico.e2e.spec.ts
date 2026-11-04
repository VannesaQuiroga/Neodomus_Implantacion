import { test, expect, type Page } from '@playwright/test';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}; ejecutar mediante scripts/e2e_foto_tecnico.py`);
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
  await page.waitForURL(/\/dashboard\/tecnico$/);
};

test('subir, ver, reemplazar y recargar foto de perfil', async ({ page }) => {
  await login(page, required('E2E_TECNICO_EMAIL'), required('E2E_TECNICO_PASSWORD'));
  await page.goto('/perfil/tecnico');

  const fileInput = page.locator('input[type="file"]');

  await fileInput.setInputFiles(required('E2E_FOTO_A'));
  await expect(page.locator('.pf-avatar-big img')).toBeVisible();
  const srcA = await page.locator('.pf-avatar-big img').getAttribute('src');

  await fileInput.setInputFiles(required('E2E_FOTO_B'));
  // La URL cambia (objeto único por subida): se espera hasta que ocurra.
  await expect.poll(async () => page.locator('.pf-avatar-big img').getAttribute('src')).not.toBe(srcA);
  const srcB = await page.locator('.pf-avatar-big img').getAttribute('src');

  await page.reload();
  await expect(page.locator('.pf-avatar-big img')).toBeVisible();
  await expect.poll(async () => page.locator('.pf-avatar-big img').getAttribute('src')).toBe(srcB);
});

test('fallback de foto rota muestra iniciales', async ({ page }) => {
  await login(page, required('E2E_TECNICO_ROTO_EMAIL'), required('E2E_TECNICO_ROTO_PASSWORD'));
  await page.goto('/perfil/tecnico');
  await expect(page.locator('.pf-avatar-iniciales')).toBeVisible();
});

test.use({ viewport: { width: 390, height: 844 } });
test('móvil: subir y ver foto de perfil', async ({ page }) => {
  await login(page, required('E2E_TECNICO_EMAIL'), required('E2E_TECNICO_PASSWORD'));
  await page.goto('/perfil/tecnico');

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(required('E2E_FOTO_A'));
  await expect(page.locator('.pf-avatar-big img')).toBeVisible();
});
