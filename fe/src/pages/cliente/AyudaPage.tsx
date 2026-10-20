// Reúne las opciones de ayuda y contacto para el cliente.
import { useState, useEffect } from 'react';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import {
  FaEnvelope, FaPhone, FaClock, FaLocationDot,
  FaArrowRight, FaPaperPlane, FaLifeRing, FaBook, FaHeadset, FaCircleCheck,
  FaQuestion, FaRobot, FaMessage
} from 'react-icons/fa6';
import '@styles/ayuda.css';
import api from '@services/api';
import { CATEGORIAS_CONSULTA, CATEGORIAS_CONSULTA_ORDER } from '../../constants';
import { BOT_INICIAL, BOT_SUGERENCIAS, responderBot } from '../../data/botData';

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

interface ChatMsg {
  de: 'bot' | 'usuario';
  texto: string;
}

// Comunica con el backend mediante GET '/faq', POST '/contacto'.
const AyudaPage = () => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useIdioma();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loadingFAQs, setLoadingFAQs] = useState(true);
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'faq' | 'chat' | 'contacto' | 'formulario'>('faq');
  const [consulta, setConsulta] = useState<ConsultaForm>({
    nombre: user?.nombre || '',
    email: user?.correo || '',
    mensaje: '',
    categoria: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null);
  const [chats, setChats] = useState<ChatMsg[]>([{ de: 'bot', texto: BOT_INICIAL }]);
  const [chatInput, setChatInput] = useState('');
  const [chatEscribiendo, setChatEscribiendo] = useState(false);

  useEffect(() => {
    // Comunica con el backend mediante GET '/faq'.
    const fetchFAQs = async () => {
      try {
        const res = await api.get('/faq');
        setFaqs(res.data.data || res.data || []);
      } catch (err) {
        console.error(err);
        setFaqs(faqsMock);
      } finally {
        setLoadingFAQs(false);
      }
    };
    fetchFAQs();
  }, []);

  const faqsMock: FAQ[] = [
    { id: 1, pregunta: '¿Cómo realizo un pedido?', respuesta: 'Navega a la sección Productos, selecciona los items que deseas, ajusta cantidades y haz clic en "Agregar al carrito". Luego ve a tu carrito y completa el checkout.', categoria: 'Pedidos' },
    { id: 2, pregunta: '¿Cuáles son los métodos de pago?', respuesta: 'Aceptamos tarjetas de crédito/débito (Visa, Mastercard), PSE, Nequi y Daviplata. Todos los pagos son procesados de forma segura.', categoria: 'Pagos' },
    { id: 3, pregunta: '¿Cómo agendo una cita con un técnico?', respuesta: 'Ve a la sección "Citas" en el menú, selecciona el tipo de servicio, fecha, hora y describe tu necesidad. Opcionalmente elige un técnico preferido.', categoria: 'Citas' },
    { id: 4, pregunta: '¿Puedo cancelar o modificar mi cita?', respuesta: 'Sí, puedes cancelar o reprogramar desde tu perfil en la sección "Mis citas" con al menos 2 horas de antelación.', categoria: 'Citas' },
    { id: 5, pregunta: '¿Cómo agrego productos a favoritos?', respuesta: 'En la página de productos, haz clic en el ícono de corazón en la tarjeta del producto. Luego ve a "Mi perfil > Mis favoritos" para verlos.', categoria: 'Cuenta' },
    { id: 6, pregunta: '¿Cuál es el tiempo de entrega?', respuesta: 'Envíos a ciudades principales: 2-3 días hábiles. Otras zonas: 4-6 días hábiles. Recibirás notificaciones de seguimiento.', categoria: 'Envíos' },
    { id: 7, pregunta: '¿Ofrecen garantía en instalaciones?', respuesta: 'Sí, todas nuestras instalaciones tienen garantía de 12 meses en mano de obra y la garantía del fabricante en equipos.', categoria: 'Servicios' },
    { id: 8, pregunta: '¿Cómo contacto a soporte?', respuesta: 'Puedes usar el formulario en esta página, escribir a soporte@neodomus.com o llamar al +57 601 123 4567 en horario laboral.', categoria: 'Contacto' },
  ];

  const handleConsultaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setConsulta(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const respondoBot = (texto: string): string => responderBot(texto);

  const enviarChat = (texto: string) => {
    const mensaje = texto.trim();
    if (!mensaje || chatEscribiendo) return;
    setChats(prev => [...prev, { de: 'usuario', texto: mensaje }]);
    setChatInput('');
    setChatEscribiendo(true);
    window.setTimeout(() => {
      setChats(prev => [...prev, { de: 'bot', texto: respondoBot(mensaje) }]);
      setChatEscribiendo(false);
    }, 450);
  };

  // Comunica con el backend mediante POST '/contacto'.
  const handleConsultaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consulta.nombre.trim() || !consulta.email.trim() || !consulta.mensaje.trim()) {
      showToast('Completa todos los campos', 'error');
      return;
    }
    if (!consulta.email.includes('@')) {
      showToast('Email inválido', 'error');
      return;
    }
    if (!consulta.categoria) {
      showToast('Selecciona la clasificación de tu consulta', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/contacto', {
        nombre: consulta.nombre,
        email: consulta.email,
        asunto: CATEGORIAS_CONSULTA[consulta.categoria] || 'Consulta',
        mensaje: consulta.mensaje,
        categoria: consulta.categoria,
      });
      showToast('Tu consulta ha sido enviada. Te responderemos pronto.', 'success');
      setConsulta(prev => ({ ...prev, categoria: '', mensaje: '' }));
    } catch (err) {
      console.error(err);
      showToast('Error al enviar. Intenta de nuevo.', 'error');
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
    { icon: <FaEnvelope />, titulo: 'Correo de soporte', valor: 'soporte@neodomus.com', descripcion: 'Respondemos en 24h hábiles' },
    { icon: <FaPhone />, titulo: 'Línea de atención', valor: '+57 601 123 4567', descripcion: 'Lun-Vie 8:00 - 18:00' },
    { icon: <FaClock />, titulo: 'Horario de atención', valor: 'Lunes a Viernes', descripcion: '8:00 AM - 6:00 PM' },
    { icon: <FaLocationDot />, titulo: 'Oficina principal', valor: 'Cra 15 #93-47, Bogotá', descripcion: 'Solo con cita previa' },
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
            onClick={() => setActiveTab('faq')}
          >
            <FaQuestion /> {t('ayuda.preguntasFrec')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'chat'}
            className={`ayuda-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <FaRobot /> Asistente virtual
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'contacto'}
            className={`ayuda-tab ${activeTab === 'contacto' ? 'active' : ''}`}
            onClick={() => setActiveTab('contacto')}
          >
            <FaHeadset /> {t('ayuda.contacto')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'formulario'}
            className={`ayuda-tab ${activeTab === 'formulario' ? 'active' : ''}`}
            onClick={() => setActiveTab('formulario')}
          >
            <FaPaperPlane /> {t('ayuda.enviarConsulta')}
          </button>
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
                <button className="ayuda-btn ayuda-btn-primary" onClick={() => setActiveTab('formulario')}>
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

                <div className="ayuda-chat-sugs">
                  {!chatEscribiendo && chats.length <= 1 && (
                    <>
                      <span className="ayuda-chat-sugs-label">Preguntas frecuentes:</span>
                      <div className="ayuda-chat-sugs-list">
                        {BOT_SUGERENCIAS.map((s) => (
                          <button
                            type="button"
                            key={s}
                            className="ayuda-chat-sug"
                            onClick={() => enviarChat(s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="ayuda-chat-input-row">
                  <input
                    type="text"
                    className="ayuda-input"
                    placeholder="Escribe tu pregunta..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') enviarChat(chatInput);
                    }}
                  />
                  <button
                    type="button"
                    className="ayuda-btn ayuda-btn-primary"
                    disabled={chatEscribiendo}
                    onClick={() => enviarChat(chatInput)}
                  >
                    <FaMessage />
                  </button>
                </div>

                <div className="ayuda-chat-cta">
                  <span>¿No encontraste tu respuesta?</span>
                  <button className="ayuda-btn ayuda-btn-ghost" onClick={() => setActiveTab('formulario')}>
                    <FaPaperPlane /> Escalar a un asesor
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
                  <li><FaCircleCheck /> WhatsApp Business: +57 300 123 4567</li>
                  <li><FaCircleCheck /> Redes sociales: @NeodomusOficial</li>
                </ul>
              </div>
            </section>
          )}

          {activeTab === 'formulario' && (
            <section className="ayuda-formulario">
              <form onSubmit={handleConsultaSubmit} className="ayuda-form" noValidate>
                <div className="ayuda-form-grid">
                  <div className="ayuda-form-group">
                    <label htmlFor="ayuda-nombre">Nombre completo *</label>
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
                    {isAuthenticated && <span className="ayuda-hint">Se completa automáticamente desde tu perfil</span>}
                  </div>
                  <div className="ayuda-form-group">
                    <label htmlFor="ayuda-email">Correo electrónico *</label>
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
                    <label htmlFor="ayuda-categoria">Motivo de la consulta *</label>
                    <select
                      id="ayuda-categoria"
                      name="categoria"
                      value={consulta.categoria}
                      onChange={handleConsultaChange}
                      className="ayuda-select"
                      required
                    >
                      <option value="">Selecciona una clasificación</option>
                      {CATEGORIAS_CONSULTA_ORDER.map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORIAS_CONSULTA[cat]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ayuda-form-group ayuda-form-full">
                    <label htmlFor="ayuda-mensaje">Mensaje *</label>
                    <textarea
                      id="ayuda-mensaje"
                      name="mensaje"
                      value={consulta.mensaje}
                      onChange={handleConsultaChange}
                      className="ayuda-textarea"
                      rows={6}
                      placeholder="Describe tu consulta, problema o sugerencia con el mayor detalle posible..."
                      required
                    />
                    <span className="ayuda-hint">Mínimo 30 caracteres</span>
                  </div>
                </div>
                <div className="ayuda-form-actions">
                  <button type="submit" className="ayuda-btn ayuda-btn-primary" disabled={submitting}>
                    {submitting ? (
                      <>
                        <FaCircleCheck style={{ animation: 'spin 1s linear infinite' }} /> Enviando...
                      </>
                    ) : (
                      <>
                        <FaPaperPlane /> Enviar consulta
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>

        {toast && (
          <div className={`ayuda-toast ${toast.tipo}`}>
            <FaCircleCheck />
            <span>{toast.msg}</span>
          </div>
        )}
      </main>
    </div>
  );
};

export default AyudaPage;