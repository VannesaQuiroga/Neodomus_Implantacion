// Componente de navegación y estructura visual: AmbientBackground. Se reutiliza en las pantallas de su área.
import '@styles/ambient.css';

const AmbientBackground = () => {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <span className="ambient-orb ambient-orb-gold" />
      <span className="ambient-orb ambient-orb-blue" />
      <span className="ambient-orb ambient-orb-white" />

      <span className="ambient-track ambient-track-1" />
      <span className="ambient-track ambient-track-2" />
      <span className="ambient-track ambient-track-3" />

      <span className="ambient-particle ambient-p-1" />
      <span className="ambient-particle ambient-p-2" />
      <span className="ambient-particle ambient-p-3" />
      <span className="ambient-particle ambient-p-4" />
      <span className="ambient-particle ambient-p-5" />
      <span className="ambient-particle ambient-p-6" />
    </div>
  );
};

export default AmbientBackground;
