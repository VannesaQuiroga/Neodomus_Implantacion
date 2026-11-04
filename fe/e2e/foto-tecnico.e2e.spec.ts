import { test, expect, type Page } from '@playwright/test';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}; ejecutar mediante scripts/e2e_foto_tecnico.py`);
  return value;
};

const login = async (page: Page, email: string, password: string, destino: RegExp) => {
  await page.goto('/login');
  await page.getByPlaceholder('Correo electrónico', { exact: true }).fill(email);
  await page.getByPlaceholder('Contraseña', { exact: true }).fill(password);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST',
  );
  await page.locator('button.btn-login-submit').click();
  expect((await response).status()).toBe(200);
  await page.waitForURL(destino);
};

const loginTecnico = (page: Page) =>
  login(page, required('E2E_TECNICO_EMAIL'), required('E2E_TECNICO_PASSWORD'), /\/dashboard\/tecnico$/);

const buscar = async (page: Page, q: string) => {
  await page.locator('.ap-search input').first().fill(q);
};

test('subir, ver, reemplazar y recargar foto de perfil', async ({ page }) => {
  await loginTecnico(page);
  await page.goto('/perfil/tecnico');

  const fileInput = page.locator('input[type="file"]');

  await fileInput.setInputFiles(required('E2E_FOTO_A'));
  await expect(page.locator('.pf-avatar-big img')).toBeVisible();
  const srcA = await page.locator('.pf-avatar-big img').getAttribute('src');

  await fileInput.setInputFiles(required('E2E_FOTO_B'));
  await expect.poll(async () => page.locator('.pf-avatar-big img').getAttribute('src')).not.toBe(srcA);
  const srcB = await page.locator('.pf-avatar-big img').getAttribute('src');

  await page.reload();
  await expect(page.locator('.pf-avatar-big img')).toBeVisible();
  await expect.poll(async () => page.locator('.pf-avatar-big img').getAttribute('src')).toBe(srcB);
});

test('fallback de foto rota muestra iniciales', async ({ page }) => {
  await login(page, required('E2E_TECNICO_ROTO_EMAIL'), required('E2E_TECNICO_ROTO_PASSWORD'), /\/dashboard\/tecnico$/);
  await page.goto('/perfil/tecnico');
  await expect(page.locator('.pf-avatar-iniciales')).toBeVisible();
});

test('admin: foto válida y fallback de iniciales', async ({ page }) => {
  // El técnico "ConFoto" ya tiene foto (test previo); "SinFoto" tiene URL rota.
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'), /\/dashboard\/admin$/);
  await page.goto('/admin/tecnicos');
  await page.waitForSelector('.ap-grid');

  await buscar(page, 'ConFoto');
  await expect(page.locator('.ap-grid-item').first().locator('img')).toBeVisible();

  await buscar(page, 'SinFoto');
  await expect(page.locator('.ap-grid-item').first().locator('img')).toHaveCount(0);
});

test.use({ viewport: { width: 390, height: 844 } });
test('móvil: subir y ver foto de perfil', async ({ page }) => {
  await loginTecnico(page);
  await page.goto('/perfil/tecnico');

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(required('E2E_FOTO_A'));
  await expect(page.locator('.pf-avatar-big img')).toBeVisible();
});

test('móvil: admin ve foto y fallback', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'), /\/dashboard\/admin$/);
  await page.goto('/admin/tecnicos');
  await page.waitForSelector('.ap-grid');

  await buscar(page, 'ConFoto');
  await expect(page.locator('.ap-grid-item').first().locator('img')).toBeVisible();

  await buscar(page, 'SinFoto');
  await expect(page.locator('.ap-grid-item').first().locator('img')).toHaveCount(0);
});
