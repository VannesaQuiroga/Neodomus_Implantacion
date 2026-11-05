import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}; ejecutar mediante scripts/e2e_cart_checkout.py`);
  return value;
};

const login = async (page: Page, email: string, password: string, destination: RegExp) => {
  await page.goto('/login');
  await page.getByPlaceholder('Correo electrónico', { exact: true }).fill(email);
  await page.getByPlaceholder('Contraseña', { exact: true }).fill(password);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST',
  );
  await page.locator('button.btn-login-submit').click();
  expect((await response).status()).toBe(200);
  await page.waitForURL(destination);
};

test('checkout real por variante y metros con refresco de precio y sin solicitudes repetidas', async ({ page }) => {
  const email = required('E2E_CLIENT_EMAIL');
  const password = required('E2E_CLIENT_PASSWORD');
  const unitId = Number(required('E2E_UNIT_PRODUCT_ID'));
  const metresId = Number(required('E2E_METRES_PRODUCT_ID'));
  const variantId = Number(required('E2E_UNIT_VARIANT_ID'));

  await login(page, email, password, /\/productos$/);

  await page.goto(`/producto/${unitId}?cantidad=2`);
  const unitAdd = page.locator('button.detalle-agregar-btn');
  await expect(unitAdd).toBeEnabled();
  await unitAdd.click();
  await expect(page.locator('.detalle-toast')).toBeVisible();

  await page.goto(`/producto/${metresId}?unidades=3`);
  const metros = page.getByRole('combobox', { name: 'Metros por unidad' });
  await expect(metros).toBeEnabled();
  await metros.selectOption('0.5');
  await expect(page.locator('.detalle-metros-bloque')).toContainText(/1[.,]5 m en total/);
  await page.locator('button.detalle-agregar-btn').click();

  await page.goto('/carrito');
  await expect(page.locator('article.carrito-item')).toHaveCount(2);

  const stale = await page.evaluate(() => JSON.parse(localStorage.getItem('neodomus_carrito') || '[]'));
  expect(stale).toHaveLength(2);
  for (const item of stale) item.precio_venta_producto = 1;
  await page.evaluate((items) => localStorage.setItem('neodomus_carrito', JSON.stringify(items)), stale);

  const detailRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') return;
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(`/api/v1/productos/${unitId}`) || pathname.endsWith(`/api/v1/productos/${metresId}`)) {
      detailRequests.push(pathname);
    }
  });

  await page.reload();
  await expect(page.locator('article.carrito-item')).toHaveCount(2);
  const subtotals = page.locator('.carrito-item-subtotal');
  await expect(subtotals.nth(0)).toContainText('$1,500');
  await expect(subtotals.nth(1)).toContainText('$1,500');
  await expect(page.locator('.carrito-resumen-total')).toContainText('$3,000');

  await page.waitForTimeout(600);
  const requestsAfterRefresh = detailRequests.length;
  await page.waitForTimeout(900);
  expect(detailRequests.length).toBe(requestsAfterRefresh);
  expect(requestsAfterRefresh).toBeGreaterThan(0);

  await page.locator('button.carrito-finalizar-btn').click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator('.checkout-resumen-items')).toContainText(/1[.,]5 m/);

  const pay = page.locator('button.checkout-pagar-btn');
  const cardNumber = page.getByPlaceholder('4242 4242 4242 4242');
  const holder = page.getByPlaceholder('Como aparece en la tarjeta');
  const expiry = page.getByPlaceholder('MM/AA');
  const cvv = page.getByPlaceholder('123');
  let orderPosts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/api/v1/pedidos')) {
      orderPosts += 1;
    }
  });

  await pay.click();
  await expect(page.locator('.checkout-error')).toContainText('Completa los datos de la tarjeta');
  expect(orderPosts).toBe(0);

  await page.locator('button.checkout-metodo').filter({ hasText: 'PSE' }).click();
  await expect(cardNumber).toHaveCount(0);
  await expect(page.locator('select').filter({ hasText: 'Selecciona tu banco' })).toBeVisible();
  await page.locator('button.checkout-metodo').filter({ hasText: 'Tarjeta' }).first().click();
  await expect(cardNumber).toHaveValue('');
  await expect(pay).toBeEnabled();

  await cardNumber.fill('4242424242424242');
  await holder.fill('Cliente E2E');
  await expiry.fill('12/30');
  await cvv.fill('123');
  const simulation = page.locator('.checkout-field', { hasText: 'Resultado de simulaci' }).locator('select');
  await simulation.selectOption('rechazado');

  const rejectedPromise = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/pedidos') && r.request().method() === 'POST',
  );
  await pay.click();
  const rejectedResponse = await rejectedPromise;
  expect(rejectedResponse.status()).toBe(200);
  const rejected = await rejectedResponse.json();
  expect(rejected.pago.estado).toBe('rechazado');
  await expect(page.getByRole('heading', { name: 'Pago rechazado' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('neodomus_carrito') || '[]').length)).toBe(2);
  expect(orderPosts).toBe(1);

  await page.getByRole('button', { name: /Reintentar pago/ }).click();
  await expect(holder).toHaveValue('Cliente E2E');
  await expect(expiry).toHaveValue('12/30');
  await expect(cardNumber).toHaveValue('');
  await expect(cvv).toHaveValue('');
  await cardNumber.fill('4242424242424242');
  await cvv.fill('123');
  const retrySimulation = page.locator('.checkout-field', { hasText: 'Resultado de simulaci' }).locator('select');
  await retrySimulation.selectOption('aprobado');

  let retryPosts = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/api\/v1\/pedidos\/\d+\/reintentar-pago$/.test(new URL(request.url()).pathname)
    ) {
      retryPosts += 1;
    }
  });
  const retryPromise = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/pedidos\/\d+\/reintentar-pago$/.test(new URL(r.url()).pathname),
  );
  await pay.dblclick();
  const retryResponse = await retryPromise;
  expect(retryResponse.status()).toBe(200);
  await page.waitForTimeout(500);
  expect(retryPosts).toBe(1);
  expect(orderPosts).toBe(1);

  const payload = rejectedResponse.request().postDataJSON();
  expect(payload.items).toHaveLength(2);
  const unitItem = payload.items.find((item: any) => item.id_producto === unitId);
  const metresItem = payload.items.find((item: any) => item.id_producto === metresId);
  expect(unitItem).toMatchObject({ id_producto: unitId, cantidad: 2, id_variante: variantId });
  expect(metresItem).toMatchObject({ id_producto: metresId, cantidad: 1, metros: 1.5 });

  const body = await retryResponse.json();
  const orderId = body.pedido.id_pedido;
  expect(orderId).toBe(rejected.pedido.id_pedido);
  expect(body.pago.estado).toBe('aprobado');
  expect(Number(body.factura.monto_total)).toBe(3000);

  const confirmation = page.getByRole('dialog', { name: /Confirmación de compra/ });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(`#${orderId}`);
  await expect(confirmation.locator('.checkout-success-datos')).toContainText(/3[.,\s]*000/);

  writeFileSync(required('E2E_RESULT_PATH'), JSON.stringify({
    pedido_id: orderId,
    cliente_email: email,
    unidad_id: unitId,
    variante_id: variantId,
    metros_id: metresId,
  }));
});

test('admin conserva filtro de categoria o proveedor al volver', async ({ page }) => {
  await login(page, required('E2E_ADMIN_EMAIL'), required('E2E_ADMIN_PASSWORD'), /\/dashboard\/admin$/);

  const filters = [
    ['categoria', required('E2E_CATEGORY_ID')],
    ['proveedor', required('E2E_PROVIDER_ID')],
  ];
  for (const [name, value] of filters) {
    await page.goto(`/admin/productos/nuevo?${name}=${value}`);
    const back = page.getByRole('link', { name: /Volver a productos/i });
    await expect(back).toHaveAttribute('href', `/admin/productos?${name}=${value}`);
  }
});
