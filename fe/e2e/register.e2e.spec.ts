import { writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const requerido = (nombre: string) => {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre}`);
  return valor;
};

interface DatosRegistro {
  nombre: string;
  apellido: string;
  documento: string;
  direccion: string;
  telefono: string;
  correo: string;
  password: string;
}

const datosBase: DatosRegistro = {
  nombre: 'Ana',
  apellido: 'Perez',
  documento: '1234567890',
  direccion: 'Calle 1 #2-3',
  telefono: '3001234567',
  correo: 'ana.registro@example.com',
  password: 'Clave123!',
};

async function abrirRegistro(page: Page) {
  await page.goto('/register');
  const form = page.locator('.register-form');
  await expect(form).toBeVisible();
  return {
    form,
    nombre: page.locator('input[name="nombre"]'),
    apellido: page.locator('input[name="apellido"]'),
    documento: page.locator('input[name="documento"]'),
    direccion: page.locator('input[name="direccion"]'),
    telefono: page.locator('input[name="telefono"]'),
    correo: page.locator('input[name="correo"]'),
    confirmCorreo: page.locator('.form-grid input[type="email"]').nth(1),
    password: page.locator('input[autocomplete="new-password"]'),
    confirmPassword: page.locator('.password-input-wrapper').nth(1).locator('input'),
    submit: page.locator('button.btn-register-submit'),
    error: page.locator('.register-form .error'),
  };
}

async function llenarFormulario(page: Page, datos: DatosRegistro) {
  await page.locator('input[name="nombre"]').fill(datos.nombre);
  await page.locator('input[name="apellido"]').fill(datos.apellido);
  await page.locator('select[name="tipo_documento"]').selectOption('1');
  await page.locator('input[name="documento"]').fill(datos.documento);
  await page.locator('select[name="ciudad"]').selectOption({ index: 1 });
  const municipio = page.locator('select[name="municipio"]');
  await expect(municipio).toBeEnabled();
  await municipio.selectOption({ index: 1 });
  await page.locator('input[name="direccion"]').fill(datos.direccion);
  await page.locator('input[name="telefono"]').fill(datos.telefono);
  await page.locator('input[name="correo"]').fill(datos.correo);
  await page.locator('.form-grid input[type="email"]').nth(1).fill(datos.correo);
  await page.locator('input[autocomplete="new-password"]').fill(datos.password);
  await page.locator('.password-input-wrapper').nth(1).locator('input').fill(datos.password);
  const checks = page.locator('.legal-checkboxes input[type="checkbox"]');
  for (let i = 0; i < 3; i += 1) await checks.nth(i).check();
}

async function pegarEn(page: Page, campo: Locator, texto: string) {
  await page.evaluate((valor) => navigator.clipboard.writeText(valor), texto);
  await campo.fill('');
  await campo.focus();
  await page.keyboard.press('Control+V');
}

async function comprobarLayout(page: Page) {
  const resultado = await page.evaluate(() => {
    const form = document.querySelector('.register-form') as HTMLElement;
    const overlay = document.querySelector('.auth-modal-overlay') as HTMLElement;
    const content = document.querySelector('.auth-modal-content') as HTMLElement;
    const desbordan = [form, overlay, content]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className);
    const fuera = Array.from(form.querySelectorAll('input, select, button, label, .error'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
      })
      .map((el) => (el as HTMLElement).name || (el as HTMLElement).className || el.tagName);
    return { desbordan, fuera };
  });
  expect(resultado.desbordan).toEqual([]);
  expect(resultado.fuera).toEqual([]);
  await page.locator('button.btn-register-submit').scrollIntoViewIfNeeded();
  await expect(page.locator('button.btn-register-submit')).toBeInViewport();
}

test('no desborda en 360/390/768/1440, con textos largos y error largo', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const detalleLargo = `Error de servidor ${'X'.repeat(500)}`;
  await page.route('**/auth/register/client', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ detail: detalleLargo }),
    }),
  );

  const { form, nombre, apellido, documento, direccion, telefono, correo, confirmCorreo, password, confirmPassword, submit, error } =
    await abrirRegistro(page);
  const largos: DatosRegistro = {
    nombre: 'N'.repeat(100),
    apellido: 'A'.repeat(100),
    documento: '1234567890',
    direccion: `Calle ${'D'.repeat(140)}`,
    telefono: '3001234567',
    correo: `${'c'.repeat(80)}@example.com`,
    password: datosBase.password,
  };
  await llenarFormulario(page, largos);

  const editables: Array<[Locator, string]> = [
    [nombre, 'Nombre temporal'],
    [apellido, 'Apellido temporal'],
    [documento, '9876543210'],
    [direccion, 'Calle temporal 9'],
    [telefono, '3009998877'],
    [correo, 'temporal@example.com'],
    [password, datosBase.password],
  ];
  for (const [campo, valor] of editables) {
    await campo.fill(valor);
    await expect(campo).toHaveValue(valor);
    await campo.fill('');
    await expect(campo).toHaveValue('');
  }

  const pegables: Array<[Locator, string]> = [
    ...editables,
    [confirmCorreo, largos.correo],
    [confirmPassword, largos.password],
  ];
  for (const [campo, valor] of pegables) {
    await pegarEn(page, campo, valor);
    await expect(campo).toHaveValue(valor);
    await campo.fill('');
    await expect(campo).toHaveValue('');
  }

  await nombre.focus();
  await page.keyboard.press('Tab');
  await expect(apellido).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('select[name="tipo_documento"]')).toBeFocused();

  await nombre.fill(largos.nombre);
  await apellido.fill(largos.apellido);
  await documento.fill(largos.documento);
  await direccion.fill(largos.direccion);
  await telefono.fill(largos.telefono);
  await correo.fill(largos.correo);
  await confirmCorreo.fill(largos.correo);
  await password.fill(largos.password);
  await confirmPassword.fill(largos.password);
  await expect(submit).toBeEnabled();

  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 740 : 900 });
    await submit.click();
    await expect(error).toContainText('Error de servidor');
    await comprobarLayout(page);
    await expect(form).toBeVisible();
  }
});

test('registro real: error de servidor, recuperación y doble clic sin duplicados', async ({ page }) => {
  test.skip(!process.env.E2E_REGISTER_EMAIL, 'Requiere backend y base de prueba');
  const email = requerido('E2E_REGISTER_EMAIL');
  const password = requerido('E2E_REGISTER_PASSWORD');
  const duplicado = requerido('E2E_REGISTER_DUPLICATE_EMAIL');

  const { correo, confirmCorreo, password: campoPassword, confirmPassword, submit, error } =
    await abrirRegistro(page);
  const datos = { ...datosBase, correo: duplicado, password };
  await llenarFormulario(page, datos);
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(error).toContainText(/ya est. registrado/i);

  await correo.fill(email);
  await confirmCorreo.fill(email);
  await campoPassword.fill(password);
  await confirmPassword.fill(password);
  await expect(submit).toBeEnabled();

  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/auth/register/client')) posts += 1;
  });
  const respuesta = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/auth/register/client'),
  );
  await submit.dblclick();
  const res = await respuesta;
  expect(res.status()).toBe(200);
  await page.waitForTimeout(400);
  expect(posts).toBe(1);
  await expect(page.getByRole('heading', { name: /Verificaci.n de cuenta/i })).toBeVisible();

  writeFileSync(requerido('E2E_RESULT_PATH'), JSON.stringify({ email, duplicado }));
});
