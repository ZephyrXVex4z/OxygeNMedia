// temas.js
// Sistema de temas visuales de OxygeNMedia.
// Cada tema define variables CSS (colores + fuentes). Cambiar de tema =
// cambiar esas variables en :root — el resto del CSS del sitio ya las usa.

export const TEMAS = {
  terminal: {
    nombre: "Terminal",
    emoji: "💻",
    descripcion: "Verde fósforo, monoespaciada, estética hacker",
    fuentes: {
      google: "JetBrains+Mono:wght@400;500;700",
      display: "'JetBrains Mono', monospace",
      body: "'JetBrains Mono', monospace"
    },
    vars: {
      "--bg": "#0A0E0A",
      "--card": "#0F1710",
      "--border": "#1F8C52",
      "--accent": "#3FFF8F",
      "--accent-hover": "#2FE07A",
      "--text": "#C9F5D8",
      "--text-dim": "#5C9C77",
      "--danger": "#FF5C5C",
      "--success": "#3FFF8F",
      "--warn": "#FFB627",
      "--radius": "2px",
      "--card-shadow": "none",
      "--font-weight-heading": "700"
    }
  },

  neobrutal: {
    nombre: "Neobrutal",
    emoji: "⚡",
    descripcion: "Bordes gruesos, sombras duras, colores saturados",
    fuentes: {
      google: "Space+Grotesk:wght@500;700",
      display: "'Space Grotesk', sans-serif",
      body: "'Space Grotesk', sans-serif"
    },
    vars: {
      "--bg": "#FFF4E0",
      "--card": "#FFFFFF",
      "--border": "#16161A",
      "--accent": "#FF5C8A",
      "--accent-hover": "#E84577",
      "--text": "#16161A",
      "--text-dim": "#4A453D",
      "--danger": "#E84545",
      "--success": "#6FCF97",
      "--warn": "#FFD23F",
      "--radius": "10px",
      "--card-shadow": "5px 5px 0 var(--border)",
      "--font-weight-heading": "700"
    }
  },

  editorial: {
    nombre: "Editorial",
    emoji: "📰",
    descripcion: "Serif elegante, tonos tierra, papel crema",
    fuentes: {
      google: "Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600",
      display: "'Fraunces', serif",
      body: "'Inter', sans-serif"
    },
    vars: {
      "--bg": "#EFE8DC",
      "--card": "#F8F4EB",
      "--border": "#D8CFBE",
      "--accent": "#A65B3F",
      "--accent-hover": "#8C4A32",
      "--text": "#2B2620",
      "--text-dim": "#6B6255",
      "--danger": "#B0473A",
      "--success": "#6B7A5E",
      "--warn": "#B8863B",
      "--radius": "2px",
      "--card-shadow": "none",
      "--font-weight-heading": "400"
    }
  },

  aurora: {
    nombre: "Aurora",
    emoji: "🌌",
    descripcion: "Gradientes suaves, glassmorphism, nocturno",
    fuentes: {
      google: "Outfit:wght@400;500;700&family=Manrope:wght@400;500",
      display: "'Outfit', sans-serif",
      body: "'Manrope', sans-serif"
    },
    vars: {
      "--bg": "#0D0B1F",
      "--card": "rgba(255,255,255,0.06)",
      "--border": "rgba(255,255,255,0.14)",
      "--accent": "#B08CFF",
      "--accent-hover": "#9A6FFF",
      "--text": "#F0EEFF",
      "--text-dim": "#9C93C4",
      "--danger": "#FF7A9C",
      "--success": "#7CE8C4",
      "--warn": "#FFC98C",
      "--radius": "16px",
      "--card-shadow": "0 8px 32px rgba(120,80,255,0.15)",
      "--font-weight-heading": "700"
    }
  },

  minimal: {
    nombre: "Minimal",
    emoji: "◻️",
    descripcion: "Blanco y negro puro, mucho espacio",
    fuentes: {
      google: "Instrument+Sans:wght@400;500;600",
      display: "'Instrument Sans', sans-serif",
      body: "'Instrument Sans', sans-serif"
    },
    vars: {
      "--bg": "#FFFFFF",
      "--card": "#FFFFFF",
      "--border": "#E4E4E4",
      "--accent": "#111111",
      "--accent-hover": "#333333",
      "--text": "#111111",
      "--text-dim": "#8A8A8A",
      "--danger": "#D64545",
      "--success": "#2E9E5B",
      "--warn": "#B8862E",
      "--radius": "6px",
      "--card-shadow": "none",
      "--font-weight-heading": "600"
    }
  }
};

const CLAVE_TEMA = "oxygenmedia_tema";
const TEMA_DEFAULT = "terminal";

// Aplica un tema: inyecta sus variables en :root y carga su Google Font si hace falta
export function aplicarTema(idTema) {
  const tema = TEMAS[idTema] || TEMAS[TEMA_DEFAULT];

  const root = document.documentElement;
  Object.entries(tema.vars).forEach(([variable, valor]) => {
    root.style.setProperty(variable, valor);
  });
  root.style.setProperty("--font-display", tema.fuentes.display);
  root.style.setProperty("--font-body", tema.fuentes.body);

  cargarFuenteGoogle(tema.fuentes.google);
  document.body.style.fontFamily = "var(--font-body)";

  localStorage.setItem(CLAVE_TEMA, idTema);
}

function cargarFuenteGoogle(query) {
  const id = "tema-google-font";
  let link = document.getElementById(id);
  const href = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
  if (link) {
    if (link.href === href) return; // ya está cargada esta misma fuente
    link.href = href;
  } else {
    link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

export function obtenerTemaGuardado() {
  return localStorage.getItem(CLAVE_TEMA) || TEMA_DEFAULT;
}

// Se llama una vez al cargar cualquier página, antes de pintar el contenido
export function inicializarTema() {
  aplicarTema(obtenerTemaGuardado());
}

