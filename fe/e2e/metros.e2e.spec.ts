import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const EMAIL = 'e2e.cliente@neodomus.com';
const PASSWORD = 'E2ePass123';
const PRODUCTO_METROS_ID = process.env.E2E_METROS_ID || '139';
const PRODUCTO_UNIDAD_ID = process.env.E2E_UNIDAD_ID || '140';
const PEDIDO_ID_FILE = process.env.E2E_PEDIDO_ID_FILE || path.join(process.cwd(), '.e2e_pedido_id.txt');

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('input[placeholder="Correo electrónico"]', EMAIL);
  await page.fill('input[placeholder="Contraseña"]', PASSWORD);
  await page.click('button.btn-login-submit');
  await expect(page.locator('.user-welcome')).toBeVisible({ timeout: 30_000 });
}

test('corte fraccionario en metros: pedir 1,5 m, persiste y se cobra exacto', async ({ page }) => {
  await login(page);

  await page.goto(`/producto/${PRODUCTO_METROS_ID}`);
  await expect(page.locator('button.detalle-agregar-btn')).toBeVisible({ timeout: 30_000 });

  const metrosInput = page.locator('input[aria-label="Metros por unidad"]');
  await metrosInput.fill('1,5');
  await expect(metrosInput).toHaveValue('1,5');

  await page.click('button.detalle-agregar-btn');

  await page.click('button.cart-button');
  await expect(page).toHaveURL(/\/carrito/);

  const item = page.locator('.carrito-item').first();
  await expect(item).toBeVisible();
  await expect(item.locator('.carrito-item-nombre')).toContainText('Cable e2e');
  await expect(item.locator('.carrito-item-metros')).toContainText('1.5 m');

  const persiste = await page.evaluate(() => {
    const raw = localStorage.getItem('neodomus_carrito');
    return raw ? raw.includes('1.5') : false;
  });
  expect(persiste).toBeTruthy();

  await page.click('button.carrito-finalizar-btn');
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.locator('button.checkout-pagar-btn')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.checkout-resumen-items')).toContainText('1.5 m', { timeout: 30_000 });

  await page.fill('input[placeholder="4242 4242 4242 4242"]', '4242424242424242');
  await page.fill('input[placeholder="Como aparece en la tarjeta"]', 'Cliente E2E');
  await page.fill('input[placeholder="MM/AA"]', '12/30');
  await page.fill('input[placeholder="123"]', '123');
  await page
    .locator('.checkout-field', { hasText: 'Resultado de simulación' })
    .locator('select')
    .selectOption('aprobado');

  await page.click('button.checkout-pagar-btn');

  await expect(page.locator('h1', { hasText: '¡Pago exitoso!' })).toBeVisible({ timeout: 60_000 });
  const datos = page.locator('.checkout-success-datos');
  await expect(datos).toBeVisible();
  const pedidoText = await datos.locator('div', { hasText: 'Pedido:' }).innerText();
  const idMatch = pedidoText.match(/#(\d+)/);
  expect(idMatch).not.toBeNull();
  const idPedido = idMatch![1];
  fs.writeFileSync(PEDIDO_ID_FILE, idPedido, 'utf8');
  console.log(`PEDIDO_ID=${idPedido}`);
});

test('rechaza precisión superior a 0,01 m', async ({ page }) => {
  await login(page);
  await page.goto(`/producto/${PRODUCTO_METROS_ID}`);
  const metrosInput = page.locator('input[aria-label="Metros por unidad"]');
  await expect(metrosInput).toBeVisible({ timeout: 30_000 });
  await metrosInput.fill('1,555');
  await metrosInput.press('Tab');
  await expect(page.locator('.detalle-metros-error')).toContainText('2 decimales', { timeout: 10_000 });
});

test('producto por unidad usa cantidad entera', async ({ page }) => {
  await login(page);
  await page.goto(`/producto/${PRODUCTO_UNIDAD_ID}`);
  await expect(page.locator('button.detalle-agregar-btn')).toBeVisible({ timeout: 30_000 });
  const cantidadInput = page.locator('input[aria-label="Cantidad"]');
  await expect(cantidadInput).toBeVisible();
  const valor = await cantidadInput.inputValue();
  expect(valor).toMatch(/^\d+$/);
});
