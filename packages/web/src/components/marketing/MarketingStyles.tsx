export function MarketingStyles() {
  return (
    <style>{`
      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
      }
      @keyframes fade-in-up {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes gradient-shift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      .landing-nav-link:hover { color: var(--color-text) !important; }
      .landing-card:hover {
        border-color: var(--color-border-light) !important;
        box-shadow: var(--shadow-card-hover) !important;
        transform: translateY(-2px);
      }
      .landing-cta-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 0 30px rgba(139, 92, 246, 0.4), 0 0 80px rgba(232, 121, 249, 0.15) !important;
      }
      .landing-ghost-btn:hover {
        background: var(--color-surface-hover) !important;
        border-color: var(--color-border-light) !important;
      }
      .landing-solutions-dropdown:hover .landing-solutions-menu,
      .landing-solutions-dropdown:focus-within .landing-solutions-menu {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
      @media (max-width: 900px) {
        .landing-nav-links { display: none !important; }
        .landing-nav-mobile { display: flex !important; }
      }
      @media (min-width: 901px) {
        .landing-nav-mobile { display: none !important; }
      }
      @media (max-width: 768px) {
        .landing-hero-btns { flex-direction: column !important; align-items: stretch !important; }
        .landing-grid-2 { grid-template-columns: 1fr !important; }
        .landing-grid-3 { grid-template-columns: 1fr !important; }
        .landing-grid-4 { grid-template-columns: 1fr !important; }
        .landing-footer-inner { flex-direction: column !important; text-align: center !important; }
        .landing-steps { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );
}
