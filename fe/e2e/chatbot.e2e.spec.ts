import { expect, test, type Locator, type Page } from '@playwright/test';

async function abrirChat(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Abrir asistente virtual/i }).click();
  const dialog = page.getByRole('dialog', { name: /Asistente virtual Neodomus/i });
  await expect(dialog).toBeVisible();
  return {
    dialog,
    input: page.getByLabel('Escribe tu pregunta'),
    send: page.getByLabel('Enviar mensaje'),
    mensajes: page.locator('.cbw-msgs'),
  };
}

async function preguntar(
  page: Page,
  input: Locator,
  send: Locator,
  texto: string,
  porBoton: boolean,
) {
  await input.fill(texto);
  await expect(input).toHaveValue(texto);
  if (porBoton) await send.click();
  else await input.press('Enter');
  await expect(page.locator('.cbw-msg.usuario').filter({ hasText: texto })).toHaveCount(1);
  await expect(send).toBeEnabled({ timeout: 5000 });
}

test('desktop: preguntas seguidas, error de foco, duplicados y cierre', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const { input, send, mensajes } = await abrirChat(page);

  const preguntas = ['pedido', 'metodos de pago', 'tiempo de entrega'];
  for (let i = 0; i < preguntas.length; i += 1) {
    await preguntar(page, input, send, preguntas[i], i % 2 === 0);
    await expect(page.locator('.cbw-msg.bot')).toHaveCount(i + 2);
  }
  await expect(page.locator('.cbw-msg.usuario')).toHaveCount(3);
  await expect(send).toBeEnabled();
  await expect(input).toHaveValue('');

  for (let i = 0; i < 8; i += 1) {
    await preguntar(page, input, send, `pregunta extra ${i}`, i % 2 === 0);
    await expect(page.locator('.cbw-msg.bot')).toHaveCount(preguntas.length + i + 2);
  }

  await expect(input).toBeInViewport();
  await expect(send).toBeInViewport();
  expect(await mensajes.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await mensajes.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2)).toBe(true);

  await input.fill('duplicada');
  const respuestasAntes = await page.locator('.cbw-msg.bot').count();
  await send.dblclick();
  await expect(page.locator('.cbw-msg.usuario').filter({ hasText: 'duplicada' })).toHaveCount(1);
  await expect(page.locator('.cbw-msg.bot')).toHaveCount(respuestasAntes + 1);
  await expect(send).toBeEnabled();

  await page.getByLabel('Cerrar chat').click();
  await expect(page.getByRole('dialog', { name: /Asistente virtual Neodomus/i })).toHaveCount(0);
  await page.getByRole('button', { name: /Abrir asistente virtual/i }).click();
  await expect(page.getByRole('dialog', { name: /Asistente virtual Neodomus/i })).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(input).toBeInViewport();
  await expect(send).toBeInViewport();
});

test('desktop: devuelve el foco a la entrada tras responder con botón', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const { input, send } = await abrirChat(page);

  await input.fill('pedido');
  await expect(input).toHaveValue('pedido');
  await send.click();
  await expect(send).toBeEnabled({ timeout: 5000 });
  await expect(input).toBeFocused();

  await page.keyboard.type('metodos de pago');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cbw-msg.usuario').filter({ hasText: 'metodos de pago' })).toHaveCount(1);
  await expect(send).toBeEnabled({ timeout: 5000 });
  await expect(input).toHaveValue('');
});

test('pantalla estrecha: historial desplazable y entrada accesible', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const { dialog, input, send, mensajes } = await abrirChat(page);

  for (let i = 0; i < 6; i += 1) {
    await preguntar(page, input, send, `consulta movil ${i}`, i % 2 === 0);
    await expect(page.locator('.cbw-msg.bot')).toHaveCount(i + 2);
  }

  await expect(input).toBeInViewport();
  await expect(send).toBeInViewport();
  expect(await mensajes.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const caja = await dialog.boundingBox();
  expect(caja).not.toBeNull();
  expect(caja!.x).toBeGreaterThanOrEqual(0);
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(360);

  await input.fill('pendiente');
  await input.press('Enter');
  await page.getByLabel('Cerrar chat').click();
  await page.getByRole('button', { name: /Abrir asistente virtual/i }).click();
  await expect(page.locator('.cbw-msg.usuario').filter({ hasText: 'pendiente' })).toHaveCount(1);
  await expect(page.locator('.cbw-msg.bot')).toHaveCount(8);
  await expect(input).toHaveValue('');
  await expect(send).toBeEnabled();
  await expect(input).toBeInViewport();
  await expect(input).toBeFocused();
});
