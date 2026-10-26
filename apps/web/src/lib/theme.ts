export const THEME_KEY = "docdo-theme";

/** Roda antes da hidratação: aplica o tema salvo (padrão claro) sem piscar. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){}`;
