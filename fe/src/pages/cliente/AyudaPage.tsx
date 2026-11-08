import LocalizedNotificationText from '@components/common/LocalizedNotificationText';
// Reúne las opciones de ayuda y contacto para el cliente.
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@contexts/AuthContext';
import { useAuthModal } from '@contexts/AuthModalContext';
import { useIdioma } from '@i18n/IdiomaContext';
import { useSearchParams } from 'react-router-dom';
import {
  FaEnvelope, FaPhone, FaClock, FaLocationDot,
  FaArrowRight, FaPaperPlane, FaLifeRing, FaBook, FaHeadset, FaCircleCheck,
  FaQuestion, FaRobot, FaMessage, FaChevronDown, FaCircleExclamation,
} from 'react-icons/fa6';
import '@styles/ayuda.css';
import api from '@services/api';
import { CATEGORIAS_CONSULTA, CATEGORIAS_CONSULTA_ORDER } from '../../constants';
import { BOT_SUGERENCIAS } from '../../data/botData';
import { useBotChat } from '../../hooks/useBotChat';

interface FAQ {
  id: number;
  pregunta: string;
  respuesta: string;
  categoria: string;
}

interface ConsultaForm {
  nombre: string;
  email: string;
  mensaje: string;
  categoria: string;
}

interface SolicitudCliente {
  id: number;
  asunto: string;
  mensaje: string;
  categoria?: string | null;
  estado: string;
  respuesta?: string | null;
  created_at?: string | null;
  responded_at?: string | null;
  respuesta_no_leida: boolean;
}

type TabAyuda = 'faq' | 'chat' | 'contacto' | 'formulario' | 'misSolicitudes';

const CLAVES_CATEGORIA_CONSULTA: Record<string, string> = {
  'consulta-general': 'ayuda.form.opcionConsultaGeneral',
  'soporte-tecnico': 'ayuda.form.opcionSoporteTecnico',
  pedido: 'ayuda.form.opcionPedido',
  pago: 'ayuda.form.opcionPago',
  reembolso: 'ayuda.form.opcionReembolso',
  reclamo: 'ayuda.form.opcionReclamo',
  otro: 'ayuda.form.opcionOtro',
};

const CLAVES_SUGERENCIAS_BOT = [
  'ayuda.faq.sug1',
  'ayuda.faq.sug2',
  'ayuda.faq.sug3',
  'ayuda.faq.sug4',
  'ayuda.faq.sug5',
  'ayuda.faq.sug6',
];

// Comunica con el backend mediante GET '/faq', POST '/contacto'.
const AyudaPage = () => {
  const { user, isAuthenticated } = useAuth();
  const { openAuth } = useAuthModal();
  const { t, idioma } = useIdioma();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabSolicitudesSolicitado = ['mis-solicitudes', 'misSolicitudes'].includes(searchParams.get('tab') || '');
  const etiquetaCategoria = (categoria: string) => {
    const clave = CLAVES_CATEGORIA_CONSULTA[categoria];
    return clave ? t(clave) : CATEGORIAS_CONSULTA[categoria];
  };
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loadingFAQs, setLoadingFAQs] = useState(true);
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabAyuda>(tabSolicitudesSolicitado ? 'misSolicitudes' : 'faq');
  const [misSolicitudes, setMisSolicitudes] = useState<SolicitudCliente[]>([]);
  const [cargandoSolicitudes, setCargandoSolicitudes] = useState(false);
  const [solicitudExpandida, setSolicitudExpandida] = useState<number | null>(null);
  const [consulta, setConsulta] = useState<ConsultaForm>({
    nombre: user?.nombre || '',
    email: user?.correo || '',
    mensaje: '',
    categoria: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null);
  const {
    chats,
    input: chatInput,
    setInput: setChatInput,
    escribiendo: chatEscribiendo,
    enviar,
    confirmar,
    esperandoConfirmacion,
    mostrarSugerencias,
  } = useBotChat();
  const chatInputRef = useRef<HTMLInputElement>(null);

  const cambiarTab = (tab: TabAyuda) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    if (tab === 'misSolicitudes') {
      params.set('tab', 'mis-solicitudes');
      if (activeTab !== 'misSolicitudes') params.delete('id');
    } else {
      params.delete('tab');
      params.delete('id');
    }
    setSearchParams(params, { replace: true });
  };

  const cargarMisSolicitudes = async () => {
    if (!isAuthenticated) return;
    setCargandoSolicitudes(true);
    try {
      const response = await api.get<SolicitudCliente[]>('/contacto/mias');
      setMisSolicitudes(response.data || []);
    } catch {
      showToast(t('ayuda.solicitudes.errorCarga'), 'error');
    } finally {
      setCargandoSolicitudes(false);
    }
  };

  const abrirSolicitud = async (solicitud: SolicitudCliente) => {
    const seAbre = solicitudExpandida !== solicitud.id;
    setSolicitudExpandida(seAbre ? solicitud.id : null);
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'mis-solicitudes');
    if (seAbre) params.set('id', String(solicitud.id));
    else params.delete('id');
    setSearchParams(params, { replace: true });
    if (seAbre && solicitud.respuesta_no_leida) {
      try {
        await api.patch(`/contacto/mias/${solicitud.id}/respuesta/leida`);
        setMisSolicitudes((prev) => prev.map((item) => item.id === solicitud.id
          ? { ...item, respuesta_no_leida: false }
          : item));
      } catch {
        showToast(t('ayuda.solicitudes.errorLeida'), 'error');
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'chat' && !chatEscribiendo) chatInputRef.current?.focus();
  }, [activeTab, chatEscribiendo]);

  useEffect(() => {
    if (tabSolicitudesSolicitado) setActiveTab('misSolicitudes');
    else if (activeTab === 'misSolicitudes') setActiveTab('faq');
  }, [tabSolicitudesSolicitado]);

  useEffect(() => {
    // Las FAQ son el contenido local del proyecto (no existe un endpoint /faq
    // en el backend); se cargan directo para no generar 404 en consola.
    setFaqs(faqsBase);
    setLoadingFAQs(false);
  }, [t]);

  useEffect(() => {
    if (isAuthenticated) void cargarMisSolicitudes();
  }, [activeTab, isAuthenticated]);

  useEffect(() => {
    const idSolicitud = Number(searchParams.get('id'));
    if (
      activeTab === 'misSolicitudes' &&
      Number.isInteger(idSolicitud) &&
      idSolicitud > 0 &&
      misSolicitudes.some((solicitud) => solicitud.id === idSolicitud)
    ) {
      setSolicitudExpandida(idSolicitud);
    }
  }, [activeTab, misSolicitudes, searchParams]);

  const faqsBase: FAQ[] = [
    { id: 1, pregunta: t('ayuda.faq.p1'), respuesta: t('ayuda.faq.r1'), categoria: t('ayuda.faq.catPedidos') },
    { id: 2, pregunta: t('ayuda.faq.p2'), respuesta: t('ayuda.faq.r2'), categoria: t('ayuda.faq.catPagos') },
    { id: 3, pregunta: t('ayuda.faq.p3'), respuesta: t('ayuda.faq.r3'), categoria: t('ayuda.faq.catCitas') },
    { id: 4, pregunta: t('ayuda.faq.p4'), respuesta: t('ayuda.faq.r4'), categoria: t('ayuda.faq.catCitas') },
    { id: 5, pregunta: t('ayuda.faq.p5'), respuesta: t('ayuda.faq.r5'), categoria: t('ayuda.faq.catCuenta') },
    { id: 6, pregunta: t('ayuda.faq.p6'), respuesta: t('ayuda.faq.r6'), categoria: t('ayuda.faq.catEnvios') },
    { id: 7, pregunta: t('ayuda.faq.p7'), respuesta: t('ayuda.faq.r7'), categoria: t('ayuda.faq.catServicios') },
    { id: 8, pregunta: t('ayuda.faq.p8'), respuesta: t('ayuda.faq.r8'), categoria: t('ayuda.faq.catContacto') },
  ];

  const handleConsultaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setConsulta(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Comunica con el backend mediante POST '/contacto'.
  const handleConsultaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consulta.nombre.trim() || !consulta.email.trim() || !consulta.mensaje.trim()) {
      showToast(t('ayuda.form.errorCampos'), 'error');
      return;
    }
    if (!consulta.email.includes('@')) {
      showToast(t('ayuda.form.errorEmail'), 'error');
      return;
    }
    if (!consulta.categoria) {
      showToast(t('ayuda.form.errorCategoria'), 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(isAuthenticated ? '/contacto/autenticado' : '/contacto', {
        nombre: consulta.nombre,
        email: consulta.email,
        asunto: CATEGORIAS_CONSULTA[consulta.categoria] || 'Consulta',
        mensaje: consulta.mensaje,
        categoria: consulta.categoria,
      });
      showToast(t('ayuda.form.exito'), 'success');
      setConsulta(prev => ({ ...prev, categoria: '', mensaje: '' }));
    } catch (err) {
      console.error(err);
      showToast(t('ayuda.form.errorEnvio'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const showToast = (msg: string, tipo: 'success' | 'error') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  const toggleFAQ = (id: number) => {
    setExpandedFAQ(prev => prev === id ? null : id);
  };

  const faqsPorCategoria = faqs.reduce((acc, faq) => {
    if (!acc[faq.categoria]) acc[faq.categoria] = [];
    acc[faq.categoria].push(faq);
    return acc;
  }, {} as Record<string, FAQ[]>);

  const infoContacto = [
    { icon: <FaEnvelope />, titulo: t('ayuda.contacto.correoTitulo'), valor: 'soporte@neodomus.com', descripcion: t('ayuda.contacto.correoDesc') },
    { icon: <FaPhone />, titulo: t('ayuda.contacto.lineaTitulo'), valor: '+57 601 123 4567', descripcion: t('ayuda.contacto.lineaDesc') },
    { icon: <FaClock />, titulo: t('ayuda.contacto.horarioTitulo'), valor: t('ayuda.contacto.horarioValor'), descripcion: t('ayuda.contacto.horarioDesc') },
    { icon: <FaLocationDot />, titulo: t('ayuda.contacto.oficinaTitulo'), valor: 'Cra 15 #93-47, Bogotá', descripcion: t('ayuda.contacto.oficinaDesc') },
  ];

  return (
    <div className="ayuda-page app-glass">
      <main className="ayuda-main">
        <header className="ayuda-header">
          <h1 className="ayuda-title">
            <FaLifeRing /> {t('ayuda.centro')}
          </h1>
          <p className="ayuda-subtitle">
            {isAuthenticated
              ? t('ayuda.subLogueado')
              : t('ayuda.subPublico')}
          </p>
        </header>

        <nav className="ayuda-tabs" role="tablist" aria-label={t('ayuda.seccionesLabel')}>
          <button
            role="tab"
            aria-selected={activeTab === 'faq'}
            className={`ayuda-tab ${activeTab === 'faq' ? 'active' : ''}`}
            onClick={() => cambiarTab('faq')}
          >
            <FaQuestion /> {t('ayuda.preguntasFrec')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'chat'}
            className={`ayuda-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => cambiarTab('chat')}
          >
            <FaRobot /> {t('ayuda.contacto.asistenteVirtual')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'contacto'}
            className={`ayuda-tab ${activeTab === 'contacto' ? 'active' : ''}`}
            onClick={() => cambiarTab('contacto')}
          >
            <FaHeadset /> {t('ayuda.contacto')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'formulario'}
            className={`ayuda-tab ${activeTab === 'formulario' ? 'active' : ''}`}
            onClick={() => cambiarTab('formulario')}
          >
            <FaPaperPlane /> {t('ayuda.enviarConsulta')}
          </button>
          {(isAuthenticated || tabSolicitudesSolicitado || activeTab === 'misSolicitudes') && (
            <button
              role="tab"
              aria-selected={activeTab === 'misSolicitudes'}
              className={`ayuda-tab ${activeTab === 'misSolicitudes' ? 'active' : ''}`}
              onClick={() => cambiarTab('misSolicitudes')}
            >
              <FaMessage /> {t('ayuda.solicitudes.titulo')}
              {misSolicitudes.some((solicitud) => solicitud.respuesta_no_leida) && (
                <span className="ayuda-solicitudes-count" aria-label={t('ayuda.solicitudes.nuevaRespuesta')}>
                  <FaCircleExclamation />
                </span>
              )}
            </button>
          )}
        </nav>

        <div className="ayuda-content" role="tabpanel">
          {activeTab === 'faq' && (
            <section className="ayuda-faq">
              {loadingFAQs ? (
                <div className="ayuda-loading">{t('ayuda.cargandoPreguntas')}</div>
              ) : (
                <div className="ayuda-faq-grid">
                  {Object.entries(faqsPorCategoria).map(([categoria, items]) => (
                    <div key={categoria} className="ayuda-faq-categoria">
                      <h3 className="ayuda-faq-categoria-title">
                        <FaBook /> {categoria}
                      </h3>
                      <div className="ayuda-faq-list">
                        {items.map(faq => (
                          <article key={faq.id} className="ayuda-faq-item">
                            <button
                              type="button"
                              className={`ayuda-faq-question ${expandedFAQ === faq.id ? 'open' : ''}`}
                              onClick={() => toggleFAQ(faq.id)}
                              aria-expanded={expandedFAQ === faq.id}
                            >
                              <span className="ayuda-faq-q-text">{faq.pregunta}</span>
                              <FaArrowRight className="ayuda-faq-chevron" />
                            </button>
                            <div className={`ayuda-faq-answer ${expandedFAQ === faq.id ? 'open' : ''}`}>
                              <p>{faq.respuesta}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="ayuda-faq-cta">
                <p>{t('ayuda.noEncontraste')}</p>
                <button className="ayuda-btn ayuda-btn-primary" onClick={() => cambiarTab('formulario')}>
                  <FaPaperPlane /> {t('ayuda.enviarUnaPregunta')}
                </button>
              </div>
            </section>
          )}

          {activeTab === 'chat' && (
            <section className="ayuda-chat">
              <div className="ayuda-chat-window">
                <div className="ayuda-chat-msgs">
                  {chats.map((msg, i) => (
                    <div key={i} className={`ayuda-chat-msg ${msg.de}`}>
                      {msg.de === 'bot' && (
                        <span className="ayuda-chat-bot-avatar">
                          <FaRobot />
                        </span>
                      )}
                      <div className="ayuda-chat-bubble">
                        {msg.texto.split('\n').map((linea, j) => (
                          <span key={j}>{linea}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {chatEscribiendo && (
                    <div className="ayuda-chat-msg bot">
                      <span className="ayuda-chat-bot-avatar">
                        <FaRobot />
                      </span>
                      <div className="ayuda-chat-bubble typing">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  )}
                </div>

                <div className="ayuda-chat-confirm">
                  {!chatEscribiendo && esperandoConfirmacion && (
                    <>
                      <button
                        type="button"
                        className="ayuda-chat-confirm-btn si"
                        onClick={() => confirmar('si')}
                      >
                        {t('ayuda.contacto.chatSi')}
                      </button>
                      <button
                        type="button"
                        className="ayuda-chat-confirm-btn no"
                        onClick={() => confirmar('no')}
                      >
                        {t('ayuda.contacto.chatNo')}
                      </button>
                    </>
                  )}
                </div>

                <div className="ayuda-chat-sugs">
                  {!chatEscribiendo && mostrarSugerencias && (
                    <>
                      <span className="ayuda-chat-sugs-label">{t('ayuda.preguntasFrec')}:</span>
                      <div className="ayuda-chat-sugs-list">
                        {BOT_SUGERENCIAS.map((s, i) => (
                          <button
                            type="button"
                            key={s}
                            className="ayuda-chat-sug"
                            onClick={() => enviar(s)}
                          >
                            {t(CLAVES_SUGERENCIAS_BOT[i] ?? s)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="ayuda-chat-input-row">
                  <input
                    ref={chatInputRef}
                    type="text"
                    className="ayuda-input"
                    placeholder={t('ayuda.contacto.chatPlaceholder')}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') enviar(chatInput);
                    }}
                  />
                  <button
                    type="button"
                    className="ayuda-btn ayuda-btn-primary"
                    disabled={chatEscribiendo}
                    onClick={() => enviar(chatInput)}
                  >
                    <FaMessage />
                  </button>
                </div>

                <div className="ayuda-chat-cta">
                  <span>{t('ayuda.noEncontraste')}</span>
                  <button className="ayuda-btn ayuda-btn-ghost" onClick={() => cambiarTab('formulario')}>
                    <FaPaperPlane /> {t('ayuda.contacto.escalarAsesor')}
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'contacto' && (
            <section className="ayuda-contacto">
              <div className="ayuda-contacto-grid">
                {infoContacto.map((item, i) => (
                  <article key={i} className="ayuda-contacto-card">
                    <div className="ayuda-contacto-icon">{item.icon}</div>
                    <h3 className="ayuda-contacto-title">{item.titulo}</h3>
                    <p className="ayuda-contacto-valor">{item.valor}</p>
                    <p className="ayuda-contacto-desc">{item.descripcion}</p>
                  </article>
                ))}
              </div>
              <div className="ayuda-contacto-extra">
                <h3>{t('ayuda.canalesExtra')}</h3>
                <ul className="ayuda-contacto-lista">
                  <li><FaCircleCheck /> {t('ayuda.chatEnVivo')}</li>
                  <li><FaCircleCheck /> {t('ayuda.contacto.whatsapp')}: +57 300 123 4567</li>
                  <li><FaCircleCheck /> {t('ayuda.contacto.redes')}: @NeodomusOficial</li>
                </ul>
              </div>
            </section>
          )}

          {activeTab === 'formulario' && (
            <section className="ayuda-formulario">
              <form onSubmit={handleConsultaSubmit} className="ayuda-form" noValidate>
                <div className="ayuda-form-grid">
                  <div className="ayuda-form-group">
                    <label htmlFor="ayuda-nombre">{t('ayuda.form.nombre')}</label>
                    <input
                      type="text"
                      id="ayuda-nombre"
                      name="nombre"
                      value={consulta.nombre}
                      onChange={handleConsultaChange}
                      className="ayuda-input"
                      required
                      disabled={isAuthenticated}
                    />
                    {isAuthenticated && <span className="ayuda-hint">{t('ayuda.form.hintPerfil')}</span>}
                  </div>
                  <div className="ayuda-form-group">
                    <label htmlFor="ayuda-email">{t('ayuda.form.email')}</label>
                    <input
                      type="email"
                      id="ayuda-email"
                      name="email"
                      value={consulta.email}
                      onChange={handleConsultaChange}
                      className="ayuda-input"
                      required
                      disabled={isAuthenticated}
                    />
                  </div>
                  <div className="ayuda-form-group ayuda-form-full">
                    <label htmlFor="ayuda-categoria">{t('ayuda.form.motivo')}</label>
                    <select
                      id="ayuda-categoria"
                      name="categoria"
                      value={consulta.categoria}
                      onChange={handleConsultaChange}
                      className="ayuda-select"
                      required
                    >
                      <option value="">{t('ayuda.form.seleccionaClasificacion')}</option>
                      {CATEGORIAS_CONSULTA_ORDER.map((cat) => (
                        <option key={cat} value={cat}>
                          {etiquetaCategoria(cat)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ayuda-form-group ayuda-form-full">
                    <label htmlFor="ayuda-mensaje">{t('ayuda.form.mensaje')}</label>
                    <textarea
                      id="ayuda-mensaje"
                      name="mensaje"
                      value={consulta.mensaje}
                      onChange={handleConsultaChange}
                      className="ayuda-textarea"
                      rows={6}
                      placeholder={t('ayuda.form.placeholderMensaje')}
                      required
                    />
                    <span className="ayuda-hint">{t('ayuda.form.hintMinimo')}</span>
                  </div>
                </div>
                <div className="ayuda-form-actions">
                  <button type="submit" className="ayuda-btn ayuda-btn-primary" disabled={submitting}>
                    {submitting ? (
                      <>
                        <FaCircleCheck style={{ animation: 'spin 1s linear infinite' }} /> {t('ayuda.form.enviando')}
                      </>
                    ) : (
                      <>
                        <FaPaperPlane /> {t('ayuda.enviarConsulta')}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeTab === 'misSolicitudes' && (
            <section className="ayuda-solicitudes">
              {!isAuthenticated ? (
                <div className="ayuda-solicitudes-vacio">
                  <FaMessage />
                  <h2>{t('ayuda.solicitudes.loginTitulo')}</h2>
                  <p>{t('ayuda.solicitudes.loginDesc')}</p>
                  <button type="button" className="ayuda-btn ayuda-btn-primary" onClick={() => openAuth('ingresar')}>
                    {t('ayuda.solicitudes.loginAccion')}
                  </button>
                </div>
              ) : cargandoSolicitudes ? (
                <p className="ayuda-loading">{t('ayuda.solicitudes.cargando')}</p>
              ) : misSolicitudes.length === 0 ? (
                <div className="ayuda-solicitudes-vacio">
                  <FaMessage />
                  <h2>{t('ayuda.solicitudes.vacio')}</h2>
                  <p>{t('ayuda.solicitudes.vacioDesc')}</p>
                </div>
              ) : (
                <div className="ayuda-solicitudes-lista">
                  {misSolicitudes.map((solicitud) => {
                    const abierta = solicitudExpandida === solicitud.id;
                    const estadoKey: Record<string, string> = {
                      pendiente: 'ayuda.solicitudes.estadoPendiente',
                      en_proceso: 'ayuda.solicitudes.estadoProceso',
                      respondida: 'ayuda.solicitudes.estadoResuelta',
                      resuelta: 'ayuda.solicitudes.estadoResuelta',
                    };
                    const fecha = solicitud.created_at
                      ? new Date(solicitud.created_at).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-CO', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })
                      : '';
                    return (
                      <article className="ayuda-solicitud-card" key={solicitud.id}>
                        <button
                          type="button"
                          className="ayuda-solicitud-toggle"
                          aria-expanded={abierta}
                          onClick={() => void abrirSolicitud(solicitud)}
                        >
                          <span className="ayuda-solicitud-main">
                            <strong>{solicitud.asunto}</strong>
                            <span className="ayuda-solicitud-meta">
                              <span>{fecha}</span>
                              <span className={`ayuda-solicitud-estado ${solicitud.estado}`}>
                                {t(estadoKey[solicitud.estado] || 'ayuda.solicitudes.estadoPendiente')}
                              </span>
                              {solicitud.respuesta_no_leida && (
                                <span className="ayuda-solicitud-nueva">{t('ayuda.solicitudes.nuevaRespuesta')}</span>
                              )}
                            </span>
                          </span>
                          <FaChevronDown className={abierta ? 'abierto' : ''} />
                        </button>
                        {abierta && (
                          <div className="ayuda-solicitud-detalle">
                            <p>{solicitud.mensaje}</p>
                            {solicitud.respuesta ? (
                              <div className="ayuda-solicitud-respuesta">
                                <strong>{t('ayuda.solicitudes.respuesta')}</strong>
                                <p>{solicitud.respuesta}</p>
                                {solicitud.responded_at && (
                                  <small>{new Date(solicitud.responded_at).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-CO')}</small>
                                )}
                              </div>
                            ) : (
                              <p className="ayuda-solicitud-pendiente">{t('ayuda.solicitudes.sinRespuesta')}</p>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>

        {toast && (
          <div className={`ayuda-toast ${toast.tipo}`}>
            <FaCircleCheck />
            <span><LocalizedNotificationText message={toast.msg} /></span>
          </div>
        )}
      </main>
    </div>
  );
};

export default AyudaPage;
