export const DICTIONARY = {
  pt: {
    nav: {
      works: "Trabalhos",
      experience: "Experiência",
      contact: "Contato",
      cta: "Iniciar conversa",
    },
    hero: {
      explore: "Explorar trabalhos",
      talk: "Falar no WhatsApp",
      metricExpLabel: "Experiência",
      metricExpSuffix: "anos de mercado",
      metricFocusLabel: "Atuação",
      metricFocusValue: "Design Gráfico & UI/UX",
      metricLocationLabel: "Base",
      metricWorksLabel: "Projetos publicados",
    },
    works: {
      index: "01 — Portfólio",
      title: "Trabalhos selecionados",
      lead: "Projetos em cards editoriais, carrosséis interativos e vídeos de direção visual.",
      all: "Todos",
      card: "Cards",
      carousel: "Carrossel",
      video: "Vídeos",
      empty: "Nenhum trabalho publicado nesta categoria ainda.",
      viewDetails: "Ver detalhes",
      typeLabels: {
        card: "Card",
        carousel: "Carrossel",
        video: "Vídeo",
      },
      playReel: "Reproduzir vídeo",
    },
    experience: {
      index: "02 — Trajetória",
      title: "Experiência profissional",
      lead: "Cinco anos construindo marcas, sistemas visuais e interfaces digitais com consistência.",
      yearsCaption: "Anos no mercado de design gráfico e produtos digitais",
      pillar1Title: "Design Gráfico & Identidade",
      pillar1Desc: "Sistemas visuais, direção de arte, papelaria editorial e guias de marca construídos com rigor tipográfico.",
      pillar2Title: "UI/UX & Sistemas de Interface",
      pillar2Desc: "Arquitetura de informação, design systems escaláveis, protótipos interativos e micro-interações funcionais.",
    },
    contact: {
      index: "03 — Contato",
      title: "Vamos construir seu próximo projeto",
      lead: "Disponível para projetos de identidade visual, interfaces digitais e consultoria de design.",
      emailLabel: "E-mail direto",
      whatsappLabel: "WhatsApp / Telefone",
      copy: "Copiar",
      copied: "E-mail copiado",
      openWhatsapp: "Abrir conversa",
    },
    modal: {
      client: "Cliente",
      year: "Ano",
      role: "Papel",
      format: "Formato",
      visitExternal: "Abrir projeto externo",
      deliverables: "Entregáveis",
    },
    footer: {
      rights: "Todos os direitos reservados",
    },
  },
  en: {
    nav: {
      works: "Works",
      experience: "Experience",
      contact: "Contact",
      cta: "Get in touch",
    },
    hero: {
      explore: "Explore works",
      talk: "Message on WhatsApp",
      metricExpLabel: "Experience",
      metricExpSuffix: "years in the market",
      metricFocusLabel: "Focus",
      metricFocusValue: "Graphic Design & UI/UX",
      metricLocationLabel: "Location",
      metricWorksLabel: "Published works",
    },
    works: {
      index: "01 — Portfolio",
      title: "Selected works",
      lead: "Curated projects presented across editorial cards, interactive carousels, and visual direction reels.",
      all: "All",
      card: "Cards",
      carousel: "Carousel",
      video: "Videos",
      empty: "No published works in this view yet.",
      viewDetails: "View case study",
      typeLabels: {
        card: "Card",
        carousel: "Carousel",
        video: "Video",
      },
      playReel: "Play video",
    },
    experience: {
      index: "02 — Background",
      title: "Professional experience",
      lead: "Five years shaping brands, visual systems, and digital interfaces with clarity.",
      yearsCaption: "Years in graphic design and digital product craft",
      pillar1Title: "Graphic Design & Identity",
      pillar1Desc: "Visual systems, art direction, editorial print, and brand guidelines grounded in typographic discipline.",
      pillar2Title: "UI/UX & Interface Systems",
      pillar2Desc: "Information architecture, scalable design systems, interactive prototypes, and purposeful micro-interactions.",
    },
    contact: {
      index: "03 — Contact",
      title: "Let us build your next project",
      lead: "Open to brand identity systems, digital product design, and design direction engagements.",
      emailLabel: "Direct email",
      whatsappLabel: "WhatsApp / Phone",
      copy: "Copy",
      copied: "Email copied",
      openWhatsapp: "Open chat",
    },
    modal: {
      client: "Client",
      year: "Year",
      role: "Role",
      format: "Format",
      visitExternal: "Open live project",
      deliverables: "Deliverables",
    },
    footer: {
      rights: "All rights reserved",
    },
  },
};

export function getInitialLang() {
  const saved = localStorage.getItem("pd_lang");
  if (saved === "pt" || saved === "en") return saved;
  return "pt";
}

export function setLang(lang) {
  localStorage.setItem("pd_lang", lang);
  document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
}

export function pickLang(item, fieldBase, lang) {
  if (!item) return "";
  const primary = item[`${fieldBase}_${lang}`];
  const fallback = item[`${fieldBase}_${lang === "pt" ? "en" : "pt"}`];
  return primary || fallback || "";
}
