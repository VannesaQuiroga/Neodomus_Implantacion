import { test, expect, type Page } from '@playwright/test';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}; ejecutar mediante scripts/e2e_admin_paginacion.py`);
  return value;
};

const PREFIXO = required('E2E_PREFIXO');

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

const buscar = async (page: Page, q: string) => {
  await page.locator('.ap-search input').first().fill(q);
};

const numeracionTabla = async (page: Page) => {
  const filas = page.locator('table.ap-table tbody tr');
  const n = await filas.count();
  const textos: string[] = [];
  for (let i = 0; i < n; i++) {
    textos.push((await filas.nth(i).locator('td').first().textContent())?.trim() || '');
  }
  return textos;
};

const esperarNumeracion = async (page: Page, esperada: string[]) => {
  await expect.poll(async () => (await numeracionTabla(page)).join(',')).toBe(esperada.join(','));
};

test('clientes: paginación, numeración y vacío', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'));
  await page.goto('/admin/clientes');
  await page.waitForSelector('table.ap-table');

  await buscar(page, PREFIXO);
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(10);
  await esperarNumeracion(page, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);

  await page.getByLabel('Ir a la página 2').click();
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(5);
  await esperarNumeracion(page, ['11', '12', '13', '14', '15']);

  await buscar(page, 'zzz-no-existe');
  await expect(page.locator('table.ap-table')).toHaveCount(0);
});

test('proveedores: paginación, numeración y vacío', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'));
  await page.goto('/admin/proveedores');
  await page.waitForSelector('table.ap-table');

  await buscar(page, PREFIXO);
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(10);
  await esperarNumeracion(page, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);

  await page.getByLabel('Ir a la página 2').click();
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(5);
  await esperarNumeracion(page, ['11', '12', '13', '14', '15']);

  await buscar(page, 'zzz-no-existe');
  await expect(page.locator('table.ap-table')).toHaveCount(0);
});

test('novedades: paginación, número vs ID y vacío', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'));
  await page.goto('/admin/novedades');
  await page.waitForSelector('table.ap-table');

  await buscar(page, PREFIXO);
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(10);
  await esperarNumeracion(page, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  // El ID real se muestra aparte (columna Tipo), no como número de fila.
  await expect(page.locator('table.ap-table tbody tr').first()).toContainText('ID ');

  await page.getByLabel('Ir a la página 2').click();
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(5);
  await esperarNumeracion(page, ['11', '12', '13', '14', '15']);

  await buscar(page, 'zzz-no-existe');
  await expect(page.locator('table.ap-table')).toHaveCount(0);
});

test('técnicos: paginación, numeración y vacío', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'));
  await page.goto('/admin/tecnicos');
  await page.waitForSelector('.ap-grid');

  await buscar(page, PREFIXO);
  await expect(page.locator('.ap-grid-item')).toHaveCount(12);
  await expect(page.locator('.ap-grid-item').first()).toContainText('#1');

  await page.getByLabel('Ir a la página 2').click();
  await expect(page.locator('.ap-grid-item')).toHaveCount(1);
  await expect(page.locator('.ap-grid-item').first()).toContainText('#13');

  await buscar(page, 'zzz-no-existe');
  await expect(page.locator('.ap-grid')).toHaveCount(0);
});

test('novedades: error de carga muestra reintento, no lista vacía', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'));
  await page.route('**/api/v1/novedades', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/admin/novedades');

  await expect(page.getByRole('button', { name: /Reintentar/ })).toBeVisible();
  await expect(page.getByText('No se pudieron cargar las novedades')).toBeVisible();
});

test.use({ viewport: { width: 390, height: 844 } });
test('clientes móvil: controles de paginación visibles y utilizables', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'));
  await page.goto('/admin/clientes');
  await page.waitForSelector('table.ap-table');

  await buscar(page, PREFIXO);
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(10);

  const pagina2 = page.getByLabel('Ir a la página 2');
  await expect(pagina2).toBeVisible();
  await pagina2.click();
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(5);
});

test('proveedores móvil: paginación accesible y numeración', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'));
  await page.goto('/admin/proveedores');
  await page.waitForSelector('table.ap-table');

  await buscar(page, PREFIXO);
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(10);
  await esperarNumeracion(page, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);

  const pagina2 = page.getByLabel('Ir a la página 2');
  await expect(pagina2).toBeVisible();
  await pagina2.click();
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(5);
  await esperarNumeracion(page, ['11', '12', '13', '14', '15']);
});

test('novedades móvil: paginación accesible y numeración', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'));
  await page.goto('/admin/novedades');
  await page.waitForSelector('table.ap-table');

  await buscar(page, PREFIXO);
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(10);
  await esperarNumeracion(page, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);

  const pagina2 = page.getByLabel('Ir a la página 2');
  await expect(pagina2).toBeVisible();
  await pagina2.click();
  await expect(page.locator('table.ap-table tbody tr')).toHaveCount(5);
  await esperarNumeracion(page, ['11', '12', '13', '14', '15']);
});

test('técnicos móvil: paginación accesible y numeración', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'));
  await page.goto('/admin/tecnicos');
  await page.waitForSelector('.ap-grid');

  await buscar(page, PREFIXO);
  await expect(page.locator('.ap-grid-item')).toHaveCount(12);
  await expect(page.locator('.ap-grid-item').first()).toContainText('#1');

  const pagina2 = page.getByLabel('Ir a la página 2');
  await expect(pagina2).toBeVisible();
  await pagina2.click();
  await expect(page.locator('.ap-grid-item')).toHaveCount(1);
  await expect(page.locator('.ap-grid-item').first()).toContainText('#13');
});
