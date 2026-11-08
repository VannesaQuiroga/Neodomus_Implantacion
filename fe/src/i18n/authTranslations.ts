// Textos de autenticación: login, registro, recuperación y verificación.
const tr = (es: string, en: string) => ({ es, en });

export const AUTH_TRADUCCIONES: Record<string, { es: string; en: string }> = {
  'auth.modal.cerrar': tr('Cerrar', 'Close'),

  // Login
  'auth.login.bienvenido': tr('Bienvenido de nuevo a', 'Welcome back to'),
  'auth.login.contrasena': tr('Contraseña', 'Password'),
  'auth.login.ingresar': tr('Ingresar', 'Log in'),
  'auth.login.ingresando': tr('Ingresando...', 'Logging in...'),
  'auth.login.recordarme': tr('Recordarme', 'Remember me'),
  'auth.login.olvidaste': tr('¿Olvidaste tu contraseña?', 'Forgot your password?'),
  'auth.login.sinCuenta': tr('¿No tienes una cuenta?', "Don't have an account?"),
  'auth.login.errorCorreo': tr('Ingresa un correo electrónico válido', 'Enter a valid email address'),
  'auth.login.errorIniciar': tr('Error al iniciar sesión', 'Error logging in'),
  'auth.login.errorCredenciales': tr(
    'Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.',
    'Incorrect email or password. Check your details and try again.',
  ),
  'auth.login.solicitudEnviada': tr(
    'Solicitud de habilitación enviada. El administrador revisará tu caso y, si la aprueba, podrás iniciar sesión nuevamente.',
    'Reactivation request sent. The administrator will review your case and, if approved, you will be able to log in again.',
  ),
  'auth.login.cuentaInhabilitada': tr(
    'Tu cuenta está inhabilitada por un administrador. Puedes solicitar que sea habilitada nuevamente.',
    'Your account has been disabled by an administrator. You can request that it be enabled again.',
  ),
  'auth.login.enviando': tr('Enviando...', 'Sending...'),
  'auth.login.solicitarHabilitacion': tr('Solicitar habilitación de la cuenta', 'Request account reactivation'),
  'auth.login.emailSinVerificar': tr(
    'Tu correo aún no ha sido verificado. Debes ingresar el código de verificación para poder iniciar sesión.',
    'Your email has not been verified yet. You must enter the verification code to log in.',
  ),
  'auth.login.verificarCorreo': tr('Verificar mi correo', 'Verify my email'),
  'auth.login.errorGoogleCuenta': tr(
    'No encontramos una cuenta vinculada a ese correo de Google',
    'We could not find an account linked to that Google email',
  ),
  'auth.login.errorGoogle': tr('No se pudo iniciar sesión con Google', 'Could not log in with Google'),

  // Registro
  'auth.register.titulo': tr('Crear cuenta', 'Create account'),
  'auth.register.nombres': tr('Nombres', 'First names'),
  'auth.register.tipoDocumento': tr('Tipo documento', 'Document type'),
  'auth.register.documento': tr('Documento', 'Document'),
  'auth.register.ciudad': tr('Ciudad', 'City'),
  'auth.register.municipio': tr('Municipio', 'Municipality'),
  'auth.register.direccion': tr('Dirección', 'Address'),
  'auth.register.correo': tr('Correo', 'Email'),
  'auth.register.confirmacionCorreo': tr('Confirmación de correo', 'Email confirmation'),
  'auth.register.contrasena': tr('Contraseña', 'Password'),
  'auth.register.confirmacionContrasena': tr('Confirmación de contraseña', 'Password confirmation'),
  'auth.register.placeholderNombres': tr('Ingresa tus nombres', 'Enter your first names'),
  'auth.register.placeholderApellidos': tr('Ingresa tus apellidos', 'Enter your last names'),
  'auth.register.placeholderDocumento': tr('Ingresa tu número de documento', 'Enter your document number'),
  'auth.register.placeholderCiudad': tr('Selecciona tu ciudad', 'Select your city'),
  'auth.register.placeholderMunicipio': tr('Selecciona tu municipio', 'Select your municipality'),
  'auth.register.placeholderDireccion': tr('Ingresa tu dirección', 'Enter your address'),
  'auth.register.placeholderTelefono': tr('Ingresa tu número telefónico', 'Enter your phone number'),
  'auth.register.placeholderCorreo': tr('Ingresa tu correo', 'Enter your email'),
  'auth.register.placeholderConfirmacionCorreo': tr('Confirma tu correo', 'Confirm your email'),
  'auth.register.placeholderContrasena': tr('Ingresa tu contraseña', 'Enter your password'),
  'auth.register.placeholderConfirmacionContrasena': tr('Confirma tu contraseña', 'Confirm your password'),
  'auth.register.reqTitulo': tr('La contraseña debe contener:', 'The password must contain:'),
  'auth.register.reqMayuscula': tr('Una mayúscula', 'One uppercase letter'),
  'auth.register.reqMinuscula': tr('Una minúscula', 'One lowercase letter'),
  'auth.register.reqNumero': tr('Un número', 'One number'),
  'auth.register.aceptoTerminos': tr('Acepto los', 'I accept the'),
  'auth.register.terminosUso': tr('Términos de uso', 'Terms of use'),
  'auth.register.aceptoPrivacidad': tr('Acepto la', 'I accept the'),
  'auth.register.politicaPrivacidad': tr('Política de privacidad', 'Privacy Policy'),
  'auth.register.aceptoCookies': tr('Acepto la', 'I accept the'),
  'auth.register.politicaCookies': tr('Política de cookies', 'Cookie Policy'),
  'auth.register.registrando': tr('Registrando...', 'Signing up...'),
  'auth.register.yaTienesCuenta': tr('¿Ya tienes una cuenta?', 'Already have an account?'),
  'auth.register.iniciarSesion': tr('Iniciar Sesión', 'Log in'),
  'auth.register.errorRequisitos': tr(
    'La contraseña no cumple los requisitos.',
    'The password does not meet the requirements.',
  ),
  'auth.register.errorCorreos': tr('Los correos no coinciden.', 'The emails do not match.'),
  'auth.register.errorContrasenas': tr('Las contraseñas no coinciden.', 'The passwords do not match.'),
  'auth.register.errorTimeout': tr(
    'La solicitud tardó demasiado. Verifica tu conexión e inténtalo nuevamente.',
    'The request took too long. Check your connection and try again.',
  ),
  'auth.register.errorRate': tr(
    'Demasiadas solicitudes. Espera un minuto antes de reintentar.',
    'Too many requests. Wait a minute before trying again.',
  ),
  'auth.register.errorGeneral': tr(
    'Error al registrarse. Verifica los datos e inténtalo de nuevo.',
    'Error signing up. Check your details and try again.',
  ),
  'auth.register.errorGoogle': tr('Error al registrar con Google', 'Error signing up with Google'),
  'auth.register.errorGoogleRegistro': tr(
    'No se pudo registrar con Google',
    'Could not sign up with Google',
  ),

  // Recuperar contraseña
  'auth.recover.titulo': tr('Recuperar contraseña', 'Recover password'),
  'auth.recover.instruccionInicio': tr(
    'Ingresa tu correo electrónico y te enviaremos un',
    'Enter your email and we will send you a',
  ),
  'auth.recover.codigo': tr('código', 'code'),
  'auth.recover.instruccionFin': tr('para restablecer tu contraseña.', 'to reset your password.'),
  'auth.recover.placeholderCorreo': tr('Tu correo electrónico', 'Your email address'),
  'auth.recover.enviar': tr('Enviar código', 'Send code'),
  'auth.recover.enviando': tr('Enviando...', 'Sending...'),
  'auth.recover.avisoInicio': tr('Te enviaremos un', 'We will send a'),
  'auth.recover.codigoSeguro': tr('código seguro', 'secure code'),
  'auth.recover.avisoFin': tr('a tu correo.', 'to your email.'),
  'auth.recover.volverLogin': tr('Volver al inicio de sesión', 'Back to log in'),
  'auth.recover.errorCorreo': tr('Correo electrónico inválido', 'Invalid email address'),
  'auth.recover.errorTimeout': tr(
    'La solicitud tardó demasiado. Verifica tu conexión e inténtalo nuevamente.',
    'The request took too long. Check your connection and try again.',
  ),
  'auth.recover.errorRate': tr(
    'Demasiadas solicitudes. Espera un minuto antes de reintentar.',
    'Too many requests. Wait a minute before trying again.',
  ),
  'auth.recover.errorEnvio': tr('Error al enviar la solicitud', 'Error sending the request'),
  'auth.recover.errorConexion': tr(
    'No se pudo conectar con el servidor. Verifica tu conexión.',
    'Could not connect to the server. Check your connection.',
  ),
  'auth.recover.errorGeneral': tr(
    'No fue posible enviar el código. Verifica tu correo e inténtalo nuevamente.',
    'The code could not be sent. Check your email and try again.',
  ),

  // Restablecer contraseña
  'auth.reset.descripcion': tr(
    'Crea una nueva contraseña segura para acceder nuevamente a tu cuenta.',
    'Create a new secure password to access your account again.',
  ),
  'auth.reset.reqTitulo': tr('La contraseña debe contener:', 'The password must contain:'),
  'auth.reset.reqMinuscula': tr('Una letra minúscula', 'One lowercase letter'),
  'auth.reset.reqMayuscula': tr('Una letra mayúscula', 'One uppercase letter'),
  'auth.reset.reqNumero': tr('Un número', 'One number'),
  'auth.reset.reqEspecial': tr('Un carácter especial', 'One special character'),
  'auth.reset.placeholderConfirmar': tr('Confirmar contraseña', 'Confirm password'),
  'auth.reset.restablecer': tr('Restablecer contraseña', 'Reset password'),
  'auth.reset.actualizando': tr('Actualizando...', 'Updating...'),
  'auth.reset.enlaceInvalido': tr('Enlace inválido', 'Invalid link'),
  'auth.reset.enlaceExpirado': tr('El enlace ha expirado o no es válido.', 'The link has expired or is invalid.'),
  'auth.reset.solicitarNuevamente': tr('Solicitar nuevamente', 'Request again'),
  'auth.reset.errorToken': tr('Token no válido', 'Invalid token'),
  'auth.reset.errorRequisitos': tr(
    'La contraseña no cumple los requisitos.',
    'The password does not meet the requirements.',
  ),
  'auth.reset.errorTimeout': tr(
    'La solicitud tardó demasiado. Verifica tu conexión e inténtalo nuevamente.',
    'The request took too long. Check your connection and try again.',
  ),
  'auth.reset.errorIP': tr(
    'Este enlace fue solicitado desde otra IP. Solicita un nuevo restablecimiento.',
    'This link was requested from another IP address. Request a new reset.',
  ),
  'auth.reset.errorRate': tr(
    'Demasiadas solicitudes. Espera un minuto antes de reintentar.',
    'Too many requests. Wait a minute before trying again.',
  ),
  'auth.reset.errorGeneral': tr(
    'Error al restablecer la contraseña. Verifica el código e inténtalo de nuevo.',
    'Error resetting the password. Check the code and try again.',
  ),

  // Verificación por código
  'auth.verifyCode.titulo': tr('Código de seguridad', 'Security code'),
  'auth.verifyCode.instruccion': tr(
    'Ingresa el código de 6 dígitos enviado a',
    'Enter the 6-digit code sent to',
  ),
  'auth.verifyCode.nota': tr(
    'Por seguridad, este código solo puede utilizarse una vez.',
    'For security, this code can only be used once.',
  ),
  'auth.verifyCode.expira': tr('El código expirará en', 'The code will expire in'),
  'auth.verifyCode.confirmar': tr('Confirmar código', 'Confirm code'),
  'auth.verifyCode.confirmando': tr('Confirmando...', 'Confirming...'),
  'auth.verifyCode.reenviando': tr('Reenviando...', 'Resending...'),
  'auth.verifyCode.volverLogin': tr('Volver al inicio de sesión', 'Back to log in'),
  'auth.verifyCode.errorTitulo': tr('Error', 'Error'),
  'auth.verifyCode.errorEmail': tr(
    'No se proporcionó un correo electrónico válido.',
    'A valid email address was not provided.',
  ),
  'auth.verifyCode.errorTimeout': tr(
    'La verificación tardó demasiado. Inténtalo nuevamente.',
    'Verification took too long. Try again.',
  ),
  'auth.verifyCode.errorIntentos': tr(
    'Demasiados intentos. Espera un momento antes de reintentar.',
    'Too many attempts. Wait a moment before trying again.',
  ),
  'auth.verifyCode.errorGeneral': tr(
    'Código inválido o expirado. Verifica el código e inténtalo de nuevo.',
    'Invalid or expired code. Check the code and try again.',
  ),
  'auth.verifyCode.errorReenvioTimeout': tr(
    'El reenvío tardó demasiado. Inténtalo nuevamente.',
    'Resending took too long. Try again.',
  ),
  'auth.verifyCode.errorRate': tr(
    'Demasiadas solicitudes. Espera un minuto antes de reintentar.',
    'Too many requests. Wait a minute before trying again.',
  ),
  'auth.verifyCode.errorReenvio': tr(
    'No fue posible reenviar el código. Inténtalo nuevamente.',
    'The code could not be resent. Try again.',
  ),

  // Verificación de correo
  'auth.verifyEmail.titulo': tr('Verificación de cuenta', 'Account verification'),
  'auth.verifyEmail.instruccion': tr(
    'Ingresa el código de 6 dígitos que enviamos a',
    'Enter the 6-digit code we sent to',
  ),
  'auth.verifyEmail.tuCorreo': tr('tu correo', 'your email'),
  'auth.verifyEmail.expira': tr('El código expirará en 24 horas', 'The code will expire in 24 hours'),
  'auth.verifyEmail.verificar': tr('Verificar cuenta', 'Verify account'),
  'auth.verifyEmail.verificando': tr('Verificando...', 'Verifying...'),
  'auth.verifyEmail.reenviarEn': tr('Reenviar en {segundos}s', 'Resend in {segundos}s'),
  'auth.verifyEmail.volverLogin': tr('Volver al inicio de sesión', 'Back to log in'),
  'auth.verifyEmail.volverRegistro': tr('Volver a registro', 'Back to sign up'),
  'auth.verifyEmail.errorTitulo': tr('Error', 'Error'),
  'auth.verifyEmail.errorEmail': tr(
    'No se proporcionó un correo electrónico válido.',
    'A valid email address was not provided.',
  ),
  'auth.verifyEmail.errorCodigo': tr(
    'Por favor ingresa el código completo de 6 dígitos',
    'Please enter the full 6-digit code',
  ),
  'auth.verifyEmail.errorGeneral': tr('Código inválido o expirado', 'Invalid or expired code'),
  'auth.verifyEmail.errorReenvio': tr('Error al reenviar el código', 'Error resending the code'),

  // Cambiar contraseña
  'auth.changePassword.errorNoCoinciden': tr(
    'Las nuevas contraseñas no coinciden',
    'The new passwords do not match',
  ),
  'auth.changePassword.errorRequisitos': tr(
    'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial',
    'The password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number and a special character',
  ),
  'auth.changePassword.errorGeneral': tr('Error al cambiar contraseña', 'Error changing password'),
  'auth.changePassword.actualizar': tr('Actualizar', 'Update'),
  'auth.changePassword.actualizando': tr('Actualizando...', 'Updating...'),

  // Cambio de contraseña obligatorio
  'auth.forceChange.titulo': tr('Debes cambiar tu contraseña', 'You must change your password'),
  'auth.forceChange.subtitulo': tr(
    'El administrador estableció una contraseña temporal para tu cuenta. Por seguridad, debes crear una nueva contraseña personal antes de continuar.',
    'The administrator set a temporary password for your account. For security, you must create a new personal password before continuing.',
  ),
  'auth.forceChange.placeholderTemporal': tr(
    'Contraseña temporal (la que te dio el administrador)',
    'Temporary password (the one provided by the administrator)',
  ),
  'auth.forceChange.errorNoCoinciden': tr(
    'Las nuevas contraseñas no coinciden',
    'The new passwords do not match',
  ),
  'auth.forceChange.errorRequisitos': tr(
    'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial',
    'The password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number and a special character',
  ),

  // Completar datos
  'auth.data.ariaModal': tr('Completar tus datos', 'Complete your details'),
  'auth.data.titulo': tr('Completa tus datos', 'Complete your details'),
  'auth.data.subtitulo': tr(
    'Te registraste con Google y nos faltan algunos datos obligatorios para poder realizar pedidos y agendar instalaciones. Completa esta información para continuar usando la plataforma.',
    'You signed up with Google and we are missing some required details to place orders and schedule installations. Complete this information to continue using the platform.',
  ),
  'auth.data.placeholderDocumento': tr('Ingresa tu número de documento', 'Enter your document number'),
  'auth.data.placeholderTelefono': tr('10 dígitos', '10 digits'),
  'auth.data.placeholderDireccion': tr('Ingresa tu dirección', 'Enter your address'),
  'auth.data.guardar': tr('Guardar mis datos', 'Save my details'),
  'auth.data.guardado': tr(
    '¡Datos guardados! Tu cuenta está completa.',
    'Data saved! Your account is complete.',
  ),
  'auth.data.errorDocumento': tr('Ingresa un número de documento válido', 'Enter a valid document number'),
  'auth.data.errorTelefono': tr(
    'Ingresa un número de teléfono válido (10 dígitos)',
    'Enter a valid phone number (10 digits)',
  ),
  'auth.data.errorDireccion': tr('Ingresa tu dirección de residencia', 'Enter your home address'),
  'auth.data.errorGuardar': tr('Error al guardar tus datos', 'Error saving your data'),
};
